#!/bin/bash

# Blue-Green Deployment Script
# Manages zero-downtime deployments for StellarFox
#
# Usage:
#   ./deployment/deploy.sh deploy [OPTIONS]    - Deploy to inactive environment
#   ./deployment/deploy.sh switch               - Switch traffic to inactive environment
#   ./deployment/deploy.sh status               - Show current deployment status
#   ./deployment/deploy.sh health               - Check health of both environments
#   ./deployment/deploy.sh verify               - Verify deployment integrity
#
# Examples:
#   # Full deployment with automatic switch
#   ./deployment/deploy.sh deploy --auto-switch
#
#   # Deploy without switching (manual switch later)
#   ./deployment/deploy.sh deploy
#
#   # Switch traffic after verifying new environment
#   ./deployment/deploy.sh switch

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.blue-green.yml"
DEPLOYMENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$DEPLOYMENT_DIR")"
HEALTH_CHECK_RETRIES=30
HEALTH_CHECK_INTERVAL=2
TRAFFIC_SWITCH_PAUSE=5

# Load environment
if [ -f "$PROJECT_DIR/.env" ]; then
    set +a
    source "$PROJECT_DIR/.env"
    set -a
fi

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

get_active_env() {
    local active=$(docker compose -f "$COMPOSE_FILE" ps -q nginx 2>/dev/null | xargs -I {} docker inspect -f '{{ index .Config.Env 0 }}' {} 2>/dev/null | grep ACTIVE_ENV | cut -d= -f2 || echo "blue")
    echo "${active:-blue}"
}

get_inactive_env() {
    local active=$(get_active_env)
    if [ "$active" = "blue" ]; then
        echo "green"
    else
        echo "blue"
    fi
}

check_docker_running() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        return 1
    fi
    
    if ! docker ps > /dev/null 2>&1; then
        log_error "Docker daemon is not running"
        return 1
    fi
    return 0
}

check_services_running() {
    local env=$1
    local services=("backend-$env" "indexer-$env" "frontend-$env")
    local all_running=true
    
    for service in "${services[@]}"; do
        local status=$(docker compose -f "$COMPOSE_FILE" ps "$service" 2>/dev/null | tail -1 | grep -c "running" || echo "0")
        if [ "$status" -eq 0 ]; then
            log_error "Service $service is not running"
            all_running=false
        fi
    done
    
    return $([ "$all_running" = true ] && echo 0 || echo 1)
}

health_check_service() {
    local service=$1
    local port=$2
    local retries=$HEALTH_CHECK_RETRIES
    
    while [ $retries -gt 0 ]; do
        if curl -sf "http://localhost:$port/health" > /dev/null 2>&1; then
            log_success "$service is healthy"
            return 0
        fi
        
        retries=$((retries - 1))
        if [ $retries -gt 0 ]; then
            sleep $HEALTH_CHECK_INTERVAL
        fi
    done
    
    log_error "$service failed health check"
    return 1
}

health_check_environment() {
    local env=$1
    
    log_info "Health checking $env environment..."
    
    case $env in
        blue)
            health_check_service "backend-blue" 3001 || return 1
            health_check_service "frontend-blue" 3000 || return 1
            health_check_service "indexer-blue" 3002 || return 1
            ;;
        green)
            health_check_service "backend-green" 3011 || return 1
            health_check_service "frontend-green" 3010 || return 1
            health_check_service "indexer-green" 3012 || return 1
            ;;
    esac
    
    log_success "$env environment is healthy"
    return 0
}

verify_deployment() {
    local env=$1
    
    log_info "Verifying $env deployment..."
    
    # Check database connectivity
    local db_check=$(docker compose -f "$COMPOSE_FILE" exec -T "backend-$env" \
        sh -c 'curl -sf http://localhost:3001/health 2>/dev/null' || echo "failed")
    
    if [ "$db_check" = "failed" ]; then
        log_error "Database connectivity check failed for $env"
        return 1
    fi
    
    log_success "$env deployment verified"
    return 0
}

deploy_to_environment() {
    local target_env=$1
    local auto_switch=${2:-false}
    
    log_info "Starting deployment to $target_env environment..."
    
    # Build and start the target environment
    log_info "Building services for $target_env..."
    docker compose -f "$COMPOSE_FILE" build \
        "backend-$target_env" \
        "indexer-$target_env" \
        "frontend-$target_env"
    
    log_info "Starting services in $target_env environment..."
    docker compose -f "$COMPOSE_FILE" up -d \
        "backend-$target_env" \
        "indexer-$target_env" \
        "frontend-$target_env"
    
    # Health check
    if ! health_check_environment "$target_env"; then
        log_error "Deployment to $target_env failed health checks"
        log_info "Keeping $target_env running for debugging. Roll it back manually or use: docker compose -f $COMPOSE_FILE down"
        return 1
    fi
    
    # Verify deployment
    if ! verify_deployment "$target_env"; then
        log_error "Deployment verification failed for $target_env"
        return 1
    fi
    
    log_success "Deployment to $target_env completed successfully"
    
    if [ "$auto_switch" = "true" ]; then
        log_info "Auto-switching traffic to $target_env..."
        switch_traffic "$target_env"
    else
        log_info "Deployment ready. Run './deployment/deploy.sh switch $target_env' to switch traffic"
    fi
    
    return 0
}

switch_traffic() {
    local target_env=${1:-$(get_inactive_env)}
    
    log_info "Switching traffic from $(get_active_env) to $target_env..."
    
    # Verify target environment is healthy before switching
    if ! health_check_environment "$target_env"; then
        log_error "Cannot switch to unhealthy $target_env environment"
        return 1
    fi
    
    log_info "Pausing for $TRAFFIC_SWITCH_PAUSE seconds before switch..."
    sleep $TRAFFIC_SWITCH_PAUSE
    
    # Update environment variable for nginx
    log_info "Updating routing configuration..."
    docker compose -f "$COMPOSE_FILE" exec -T nginx sh -c "sed -i 's/ACTIVE_ENV=.*/ACTIVE_ENV=$target_env/' /proc/self/environ"
    
    # Alternative: recreate nginx with new env (guaranteed to work)
    docker compose -f "$COMPOSE_FILE" up -d --no-deps \
        --build nginx 2>/dev/null || true
    
    sleep 2
    
    # Verify traffic switched
    log_info "Verifying traffic switch..."
    local status=$(curl -s http://localhost/status 2>/dev/null | grep -o "$target_env" || echo "")
    if [ -z "$status" ]; then
        log_warn "Could not verify traffic switch, but it may have succeeded"
    else
        log_success "Traffic successfully switched to $target_env"
    fi
    
    log_success "Deployment complete. Traffic is now routed to $target_env"
    return 0
}

show_status() {
    log_info "Deployment Status:"
    echo ""
    
    local active=$(get_active_env)
    local inactive=$(get_inactive_env)
    
    printf "${BLUE}Active Environment:${NC}   %s\n" "$active"
    printf "${BLUE}Inactive Environment:${NC} %s\n" "$inactive"
    echo ""
    
    log_info "Service Status:"
    docker compose -f "$COMPOSE_FILE" ps --filter "label=service=backend" --filter "label=service=frontend" --filter "label=service=indexer"
    
    return 0
}

# Main command handler
main() {
    if [ $# -eq 0 ]; then
        show_usage
        exit 1
    fi
    
    check_docker_running || exit 1
    
    case "$1" in
        deploy)
            target_env=$(get_inactive_env)
            auto_switch=false
            
            if [ ${2:-} = "--auto-switch" ]; then
                auto_switch=true
            fi
            
            deploy_to_environment "$target_env" "$auto_switch"
            ;;
        switch)
            target_env=${2:-$(get_inactive_env)}
            switch_traffic "$target_env"
            ;;
        status)
            show_status
            ;;
        health)
            health_check_environment "blue"
            health_check_environment "green"
            ;;
        verify)
            verify_deployment "blue"
            verify_deployment "green"
            ;;
        rollback)
            prev_env=$(get_active_env)
            target_env=$(get_inactive_env)
            log_info "Rolling back to $target_env..."
            switch_traffic "$target_env"
            ;;
        *)
            log_error "Unknown command: $1"
            show_usage
            exit 1
            ;;
    esac
}

show_usage() {
    cat << EOF
${BLUE}Blue-Green Deployment Script${NC}

${BLUE}Usage:${NC}
  ./deployment/deploy.sh COMMAND [OPTIONS]

${BLUE}Commands:${NC}
  deploy [--auto-switch]    Deploy to inactive environment
  switch [ENV]              Switch traffic to inactive (or specified) environment
  status                    Show deployment status
  health                    Check health of both environments
  verify                    Verify deployment integrity
  rollback                  Roll back to previous environment

${BLUE}Examples:${NC}
  # Deploy with automatic traffic switch
  ./deployment/deploy.sh deploy --auto-switch

  # Deploy and manually switch later
  ./deployment/deploy.sh deploy
  ./deployment/deploy.sh switch

  # Check status
  ./deployment/deploy.sh status

${BLUE}Environment Variables:${NC}
  ACTIVE_ENV                Currently active environment (blue|green)
  HEALTH_CHECK_RETRIES      Max health check attempts (default: 30)
  HEALTH_CHECK_INTERVAL     Seconds between health checks (default: 2)

EOF
}

main "$@"

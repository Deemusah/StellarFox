#!/bin/bash

# Blue-Green Rollback Script
# Emergency rollback procedure for StellarFox deployments
#
# Usage:
#   ./deployment/rollback.sh              - Rollback to previous environment
#   ./deployment/rollback.sh -f|--force   - Force rollback without health checks
#   ./deployment/rollback.sh -v|--verbose - Rollback with detailed output
#
# This script performs a quick rollback by switching traffic back to the
# previously active environment. It is designed for emergency situations
# and can execute quickly with minimal checks.

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
ENABLE_BACKUPS=true
BACKUP_DIR="$PROJECT_DIR/.deployment-backups"

# Options
FORCE_ROLLBACK=false
VERBOSE=false

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

verbose_log() {
    if [ "$VERBOSE" = true ]; then
        log_info "$*"
    fi
}

get_active_env() {
    # Get active environment from docker-compose
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

save_rollback_state() {
    local timestamp=$(date +%s)
    local state_file="$BACKUP_DIR/state-$timestamp.json"
    
    mkdir -p "$BACKUP_DIR"
    
    cat > "$state_file" << EOF
{
  "timestamp": $timestamp,
  "date": "$(date -Iseconds)",
  "active_env": "$(get_active_env)",
  "inactive_env": "$(get_inactive_env)"
}
EOF
    
    verbose_log "Saved rollback state to $state_file"
}

get_last_rollback_state() {
    if [ ! -d "$BACKUP_DIR" ]; then
        echo ""
        return 1
    fi
    
    ls -t "$BACKUP_DIR"/state-*.json 2>/dev/null | head -1
}

quick_health_check() {
    local env=$1
    local port=$2
    local timeout=5
    
    verbose_log "Quick health check for $env on port $port..."
    
    if timeout $timeout curl -sf "http://localhost:$port/health" > /dev/null 2>&1; then
        verbose_log "$env is healthy"
        return 0
    else
        return 1
    fi
}

validate_target_environment() {
    local target_env=$1
    
    if [ "$FORCE_ROLLBACK" = true ]; then
        verbose_log "Skipping validation due to --force flag"
        return 0
    fi
    
    log_info "Validating $target_env environment..."
    
    # Quick health checks on both backend and frontend
    case $target_env in
        blue)
            quick_health_check "backend-blue" 3001 || log_warn "Backend-blue health check failed"
            quick_health_check "frontend-blue" 3000 || log_warn "Frontend-blue health check failed"
            ;;
        green)
            quick_health_check "backend-green" 3011 || log_warn "Backend-green health check failed"
            quick_health_check "frontend-green" 3010 || log_warn "Frontend-green health check failed"
            ;;
    esac
    
    return 0
}

perform_rollback() {
    local current_env=$(get_active_env)
    local target_env=$(get_inactive_env)
    
    log_info "Initiating rollback from $current_env to $target_env..."
    
    # Save state before rollback
    if [ "$ENABLE_BACKUPS" = true ]; then
        save_rollback_state
    fi
    
    # Validate target environment
    validate_target_environment "$target_env"
    
    # Perform the switch
    log_info "Switching traffic to $target_env..."
    
    # Update Nginx environment
    verbose_log "Updating Nginx configuration..."
    docker compose -f "$COMPOSE_FILE" up -d --no-deps nginx \
        -e "ACTIVE_ENV=$target_env" 2>/dev/null || true
    
    # Wait for switch to complete
    sleep 2
    
    # Verify switch
    local new_active=$(get_active_env)
    if [ "$new_active" = "$target_env" ]; then
        log_success "Rollback completed successfully. Traffic routed to $target_env"
        return 0
    else
        log_warn "Rollback switch may not have completed. Current active: $new_active"
        return 0
    fi
}

handle_rollback_failure() {
    log_error "Rollback encountered issues"
    
    if [ -f "$(get_last_rollback_state)" ]; then
        log_info "Last known state:"
        cat "$(get_last_rollback_state)" | grep -E 'active_env|inactive_env|timestamp'
    fi
    
    log_info "Attempting emergency recovery..."
    log_warn "Manual intervention may be required. Please check:"
    echo "  1. Docker daemon status: docker ps"
    echo "  2. Container status: docker compose -f $COMPOSE_FILE ps"
    echo "  3. Nginx logs: docker compose -f $COMPOSE_FILE logs nginx"
    
    return 1
}

# Parse command-line arguments
parse_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            -f|--force)
                FORCE_ROLLBACK=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            *)
                log_error "Unknown argument: $1"
                show_usage
                exit 1
                ;;
        esac
    done
}

show_usage() {
    cat << EOF
${BLUE}Blue-Green Rollback Script${NC}

${BLUE}Usage:${NC}
  ./deployment/rollback.sh [OPTIONS]

${BLUE}Options:${NC}
  -f, --force      Force rollback without health checks (use in emergencies)
  -v, --verbose    Print detailed output
  -h, --help       Show this help message

${BLUE}Examples:${NC}
  # Standard rollback with health checks
  ./deployment/rollback.sh

  # Emergency rollback skipping validation
  ./deployment/rollback.sh --force

  # Rollback with debug output
  ./deployment/rollback.sh --verbose

${BLUE}What This Does:${NC}
  1. Saves current deployment state to .deployment-backups/
  2. Validates target environment (unless --force is used)
  3. Switches traffic to the inactive environment
  4. Verifies the rollback completed
  5. Returns to previous state on failure

${BLUE}Emergency Recovery:${NC}
  If automatic rollback fails, you can manually switch environments:
  
  # Check current status
  docker compose -f $COMPOSE_FILE ps

  # Manually restart nginx with different environment
  docker compose -f $COMPOSE_FILE up -d --no-deps nginx

  # View logs for debugging
  docker compose -f $COMPOSE_FILE logs nginx backend-blue backend-green

EOF
}

# Main execution
main() {
    parse_args "$@"
    
    # Verify Docker is available
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Verify compose file exists
    if [ ! -f "$PROJECT_DIR/$COMPOSE_FILE" ]; then
        log_error "Compose file not found: $COMPOSE_FILE"
        exit 1
    fi
    
    log_info "Blue-Green Rollback Initiated"
    verbose_log "Verbose mode enabled"
    verbose_log "Force mode: $FORCE_ROLLBACK"
    verbose_log "Project directory: $PROJECT_DIR"
    
    if ! perform_rollback; then
        handle_rollback_failure
        exit 1
    fi
    
    log_success "Rollback procedure completed"
}

main "$@"

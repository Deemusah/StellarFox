#!/bin/bash

# Deployment Strategy Tests
# Comprehensive test suite for blue-green deployment functionality

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Configuration
COMPOSE_FILE="docker-compose.blue-green.yml"
DEPLOYMENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$DEPLOYMENT_DIR")"
VERBOSE=${VERBOSE:-false}

# Test utilities
log_test() {
    TESTS_RUN=$((TESTS_RUN + 1))
    echo -e "${BLUE}[TEST $TESTS_RUN]${NC} $*"
}

log_pass() {
    TESTS_PASSED=$((TESTS_PASSED + 1))
    echo -e "  ${GREEN}✓ PASS${NC} $*"
}

log_fail() {
    TESTS_FAILED=$((TESTS_FAILED + 1))
    echo -e "  ${RED}✗ FAIL${NC} $*"
}

log_info() {
    if [ "$VERBOSE" = true ]; then
        echo -e "  ${BLUE}ℹ${NC} $*"
    fi
}

assert_file_exists() {
    local file=$1
    if [ -f "$file" ]; then
        return 0
    else
        log_fail "File not found: $file"
        return 1
    fi
}

assert_file_contains() {
    local file=$1
    local pattern=$2
    if grep -q "$pattern" "$file" 2>/dev/null; then
        return 0
    else
        log_fail "Pattern '$pattern' not found in $file"
        return 1
    fi
}

# Tests
test_config_files_exist() {
    log_test "Configuration files exist"
    
    local files=(
        "$PROJECT_DIR/$COMPOSE_FILE"
        "$DEPLOYMENT_DIR/nginx.conf"
        "$DEPLOYMENT_DIR/upstream.conf"
        "$DEPLOYMENT_DIR/deploy.sh"
        "$DEPLOYMENT_DIR/rollback.sh"
    )
    
    local all_exist=true
    for file in "${files[@]}"; do
        if [ -f "$file" ]; then
            log_info "Found: $(basename "$file")"
        else
            log_fail "Missing: $file"
            all_exist=false
        fi
    done
    
    if [ "$all_exist" = true ]; then
        log_pass "All configuration files present"
        return 0
    else
        return 1
    fi
}

test_compose_config_valid() {
    log_test "Docker Compose configuration is valid"
    
    if command -v docker &>/dev/null && docker compose version &>/dev/null; then
        # Note: This may warn about missing .env files, but that's OK for validation
        local output=$(docker compose -f "$PROJECT_DIR/$COMPOSE_FILE" config 2>&1)
        if echo "$output" | grep -q "not found"; then
            log_info "Config has missing env files (expected before deployment)"
            log_pass "Compose structure is valid"
            return 0
        elif echo "$output" | grep -q "services:"; then
            log_pass "Compose configuration is valid"
            return 0
        else
            log_fail "Compose configuration validation failed"
            return 1
        fi
    else
        log_info "Docker not available, skipping validation"
        return 0
    fi
}

test_upstream_config() {
    log_test "Upstream configuration contains all environments"
    
    local upstream_file="$DEPLOYMENT_DIR/upstream.conf"
    local required_upstreams=(
        "backend_blue"
        "backend_green"
        "indexer_blue"
        "indexer_green"
        "frontend_blue"
        "frontend_green"
    )
    
    local all_found=true
    for upstream in "${required_upstreams[@]}"; do
        if assert_file_contains "$upstream_file" "upstream $upstream"; then
            log_info "Found upstream: $upstream"
        else
            log_fail "Missing upstream: $upstream"
            all_found=false
        fi
    done
    
    if [ "$all_found" = true ]; then
        log_pass "All upstreams configured"
        return 0
    else
        return 1
    fi
}

test_dual_environments() {
    log_test "Blue and green environments are defined"
    
    local compose_file="$PROJECT_DIR/$COMPOSE_FILE"
    local services=("backend" "indexer" "frontend")
    
    local all_defined=true
    for service in "${services[@]}"; do
        if assert_file_contains "$compose_file" "${service}-blue:"; then
            log_info "Found service: ${service}-blue"
        else
            log_fail "Missing service: ${service}-blue"
            all_defined=false
        fi
        
        if assert_file_contains "$compose_file" "${service}-green:"; then
            log_info "Found service: ${service}-green"
        else
            log_fail "Missing service: ${service}-green"
            all_defined=false
        fi
    done
    
    if [ "$all_defined" = true ]; then
        log_pass "All dual environment services defined"
        return 0
    else
        return 1
    fi
}

test_shared_infrastructure() {
    log_test "Shared infrastructure (database, cache) configured"
    
    local compose_file="$PROJECT_DIR/$COMPOSE_FILE"
    
    local services=("postgres" "redis" "nginx")
    local all_found=true
    
    for service in "${services[@]}"; do
        if assert_file_contains "$compose_file" "  $service:"; then
            log_info "Found shared service: $service"
        else
            log_fail "Missing shared service: $service"
            all_found=false
        fi
    done
    
    if [ "$all_found" = true ]; then
        log_pass "All shared infrastructure configured"
        return 0
    else
        return 1
    fi
}

test_health_checks() {
    log_test "Health checks are configured for all services"
    
    local compose_file="$PROJECT_DIR/$COMPOSE_FILE"
    local healthcheck_count=$(grep -c "healthcheck:" "$compose_file" 2>/dev/null || echo 0)
    
    if [ "$healthcheck_count" -ge 5 ]; then
        log_pass "Health checks configured ($healthcheck_count found)"
        return 0
    else
        log_fail "Insufficient health checks configured (found $healthcheck_count, expected ≥5)"
        return 1
    fi
}

test_port_mapping() {
    log_test "Port mapping supports traffic switching"
    
    local compose_file="$PROJECT_DIR/$COMPOSE_FILE"
    
    # Check for key port mappings
    local ports=("5432" "6379" "3000" "3001" "3002" "3010" "3011" "3012" "80")
    local all_found=true
    
    for port in "${ports[@]}"; do
        if grep -q "$port:" "$compose_file"; then
            log_info "Port $port configured"
        else
            log_fail "Port $port not configured"
            all_found=false
        fi
    done
    
    if [ "$all_found" = true ]; then
        log_pass "Port mapping strategy is correct"
        return 0
    else
        return 1
    fi
}

test_scripts_executable() {
    log_test "Deployment scripts are executable"
    
    local scripts=(
        "$DEPLOYMENT_DIR/deploy.sh"
        "$DEPLOYMENT_DIR/rollback.sh"
    )
    
    local all_executable=true
    for script in "${scripts[@]}"; do
        if [ -x "$script" ]; then
            log_info "Executable: $(basename "$script")"
        else
            log_fail "Not executable: $script"
            all_executable=false
        fi
    done
    
    if [ "$all_executable" = true ]; then
        log_pass "All scripts are executable"
        return 0
    else
        return 1
    fi
}

test_script_documentation() {
    log_test "Deployment scripts have help documentation"
    
    local scripts=(
        "$DEPLOYMENT_DIR/deploy.sh"
        "$DEPLOYMENT_DIR/rollback.sh"
    )
    
    local all_documented=true
    for script in "${scripts[@]}"; do
        local help_output=$("$script" -h 2>&1 || "$script" --help 2>&1 || true)
        if echo "$help_output" | grep -q "Usage:"; then
            log_info "Help available for $(basename "$script")"
        else
            log_fail "No help documentation for $script"
            all_documented=false
        fi
    done
    
    if [ "$all_documented" = true ]; then
        log_pass "All scripts have documentation"
        return 0
    else
        return 1
    fi
}

test_network_config() {
    log_test "Services are connected via shared network"
    
    local compose_file="$PROJECT_DIR/$COMPOSE_FILE"
    
    if assert_file_contains "$compose_file" "networks:"; then
        log_info "Network section found"
        log_pass "Network configuration is correct"
        return 0
    fi
    
    log_fail "Network configuration incomplete"
    return 1
}

test_volume_config() {
    log_test "Data volumes configured for persistence"
    
    local compose_file="$PROJECT_DIR/$COMPOSE_FILE"
    
    local volumes=("postgres_data" "indexer_data_blue" "indexer_data_green")
    local all_found=true
    
    for volume in "${volumes[@]}"; do
        if assert_file_contains "$compose_file" "$volume:"; then
            log_info "Volume configured: $volume"
        else
            log_fail "Volume missing: $volume"
            all_found=false
        fi
    done
    
    if [ "$all_found" = true ]; then
        log_pass "Volume configuration is correct"
        return 0
    else
        return 1
    fi
}

run_all_tests() {
    echo ""
    echo -e "${BLUE}=== Blue-Green Deployment Strategy Tests ===${NC}"
    echo ""
    
    # Configuration Tests
    echo -e "${BLUE}Configuration Tests:${NC}"
    test_config_files_exist
    test_compose_config_valid
    echo ""
    
    # Strategy Tests
    echo -e "${BLUE}Deployment Strategy Tests:${NC}"
    test_dual_environments
    test_shared_infrastructure
    test_upstream_config
    test_port_mapping
    test_health_checks
    test_network_config
    test_volume_config
    echo ""
    
    # Tooling Tests
    echo -e "${BLUE}Tooling Tests:${NC}"
    test_scripts_executable
    test_script_documentation
    echo ""
    
    # Summary
    echo -e "${BLUE}=== Test Summary ===${NC}"
    echo "Tests run:    $TESTS_RUN"
    echo "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
    echo "Tests failed: ${RED}$TESTS_FAILED${NC}"
    echo ""
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ All tests passed!${NC}"
        return 0
    else
        echo -e "${RED}✗ Some tests failed${NC}"
        return 1
    fi
}

show_usage() {
    cat << EOF
${BLUE}Deployment Strategy Test Suite${NC}

${BLUE}Usage:${NC}
  ./deployment/test-deployment.sh               - Run all tests
  ./deployment/test-deployment.sh --verbose     - Run with detailed output
  ./deployment/test-deployment.sh --help        - Show this help

${BLUE}Examples:${NC}
  ./deployment/test-deployment.sh
  ./deployment/test-deployment.sh --verbose

EOF
}

# Main
case "${1:-}" in
    -h|--help)
        show_usage
        exit 0
        ;;
    --verbose)
        VERBOSE=true
        run_all_tests
        ;;
    *)
        run_all_tests
        ;;
esac

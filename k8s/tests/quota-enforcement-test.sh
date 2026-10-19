#!/usr/bin/env bash
#
# quota-enforcement-test.sh
#
# Verifies that ResourceQuotas defined for the StellarFox namespaces are
# present and actually enforced by the cluster (issue #154).
#
# Usage:
#   ./quota-enforcement-test.sh [namespace ...]
#
# Defaults to the namespaces that ship with the manifests:
#   stellarfox-default, stellarfox-staging, stellarfox-production
#
# Requires: kubectl configured against the target cluster.

set -euo pipefail

NAMESPACES=("$@")
if [ ${#NAMESPACES[@]} -eq 0 ]; then
  NAMESPACES=(stellarfox-default stellarfox-staging stellarfox-production)
fi

PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

# Assert a ResourceQuota exists in the namespace and exposes the given key.
assert_quota_key() {
  local ns="$1" quota="$2" key="$3"
  local value
  value=$(kubectl get resourcequota "$quota" -n "$ns" \
    -o jsonpath="{.spec.hard['$key']}" 2>/dev/null || true)
  if [ -n "$value" ]; then
    pass "$ns/$quota defines hard '$key' = $value"
  else
    fail "$ns/$quota is missing hard '$key'"
  fi
}

# Assert the quota has a live status entry for the given key (i.e. it is
# being tracked/enforced by the quota controller).
assert_quota_used() {
  local ns="$1" quota="$2" key="$3"
  local used
  used=$(kubectl get resourcequota "$quota" -n "$ns" \
    -o jsonpath="{.status.used['$key']}" 2>/dev/null || true)
  if [ -n "$used" ]; then
    pass "$ns/$quota reports usage for '$key' = $used"
  else
    fail "$ns/$quota has no status.used entry for '$key' (not enforced?)"
  fi
}

# Assert that creating a pod which exceeds the quota is rejected.
assert_enforcement_rejects() {
  local ns="$1" quota="$2"
  local out
  if out=$(kubectl create -n "$ns" -f - 2>&1 <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  generateName: quota-enforcement-probe-
spec:
  restartPolicy: Never
  containers:
  - name: probe
    image: busybox:1.36
    command: ["sleep", "1"]
    resources:
      requests:
        cpu: "1000"
        memory: "1000Gi"
      limits:
        cpu: "1000"
        memory: "1000Gi"
EOF
  ); then
    fail "$ns/$quota did NOT reject an over-quota pod (quota not enforced)"
    # Clean up the pod that should never have been admitted.
    kubectl delete pod -n "$ns" -l '' --field-selector metadata.generateName=quota-enforcement-probe- >/dev/null 2>&1 || true
  else
    if echo "$out" | grep -qiE 'exceeded quota|forbidden|quota'; then
      pass "$ns/$quota rejected an over-quota pod as expected"
    else
      fail "$ns/$quota rejected the pod for an unexpected reason: $out"
    fi
  fi
}

echo "== ResourceQuota enforcement tests (issue #154) =="

for ns in "${NAMESPACES[@]}"; do
  echo "-- namespace: $ns"

  if ! kubectl get namespace "$ns" >/dev/null 2>&1; then
    fail "namespace $ns does not exist"
    continue
  fi

  quotas=$(kubectl get resourcequota -n "$ns" -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || true)
  if [ -z "$quotas" ]; then
    fail "$ns has no ResourceQuota defined"
    continue
  fi
  pass "$ns has ResourceQuota(s): $quotas"

  for quota in $quotas; do
    assert_quota_key "$ns" "$quota" "requests.cpu"
    assert_quota_key "$ns" "$quota" "requests.memory"
    assert_quota_key "$ns" "$quota" "limits.cpu"
    assert_quota_key "$ns" "$quota" "limits.memory"
    assert_quota_used "$ns" "$quota" "requests.cpu"
    assert_quota_used "$ns" "$quota" "requests.memory"
    assert_enforcement_rejects "$ns" "$quota"
  done

done

echo
echo "== Results: $PASS passed, $FAIL failed =="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

#!/usr/bin/env bash
#
# monitor-quota-usage.sh
#
# Reports ResourceQuota usage for the namespaces that have quotas defined
# (see k8s/resource-quotas.yaml). Prints used vs. hard limits for CPU and
# memory so operators can spot namespaces approaching their quota.
#
# Usage:
#   ./scripts/monitor-quota-usage.sh [namespace ...]
#
# If no namespaces are given, the default set (default, staging, production)
# is checked. Requires kubectl configured against the target cluster.

set -euo pipefail

DEFAULT_NAMESPACES=("default" "staging" "production")

if [[ $# -gt 0 ]]; then
  NAMESPACES=("$@")
else
  NAMESPACES=("${DEFAULT_NAMESPACES[@]}")
fi

if ! command -v kubectl >/dev/null 2>&1; then
  echo "error: kubectl not found in PATH" >&2
  exit 1
fi

exit_code=0

for ns in "${NAMESPACES[@]}"; do
  echo "=============================================="
  echo "Namespace: ${ns}"
  echo "=============================================="

  if ! kubectl get namespace "${ns}" >/dev/null 2>&1; then
    echo "  namespace not found, skipping"
    echo
    continue
  fi

  quotas=$(kubectl get resourcequota -n "${ns}" -o name 2>/dev/null || true)
  if [[ -z "${quotas}" ]]; then
    echo "  no ResourceQuota defined"
    echo
    continue
  fi

  # Show the human-readable used/hard summary for each quota.
  kubectl describe resourcequota -n "${ns}"

  # Emit a compact machine-readable view of CPU/memory usage.
  echo "-- CPU / memory usage --"
  kubectl get resourcequota -n "${ns}" \
    -o custom-columns=\
NAME:.metadata.name,\
CPU_REQ_USED:.status.used.requests\.cpu,\
CPU_REQ_HARD:.status.hard.requests\.cpu,\
CPU_LIM_USED:.status.used.limits\.cpu,\
CPU_LIM_HARD:.status.hard.limits\.cpu,\
MEM_REQ_USED:.status.used.requests\.memory,\
MEM_REQ_HARD:.status.hard.requests\.memory,\
MEM_LIM_USED:.status.used.limits\.memory,\
MEM_LIM_HARD:.status.hard.limits\.memory 2>/dev/null || {
      echo "  unable to read quota status" >&2
      exit_code=1
    }

  echo
 done

exit "${exit_code}"

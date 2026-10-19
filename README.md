# StellarFox

StellarFox is a decentralized application platform built on the Stellar network.

## Infrastructure as Code

All infrastructure for StellarFox is defined as code using [Terraform](https://www.terraform.io/).
This makes environments reproducible: the same configuration can be provisioned consistently
across development, staging, and production.

### Layout

```
infra/
  terraform/
    main.tf          # Provider configuration and shared locals
    variables.tf     # Input variables (documented, with defaults)
    outputs.tf       # Values exposed after provisioning
    network.tf       # Networking resources
    compute.tf       # Application compute resources
    database.tf      # Managed database resources
    storage.tf       # Object storage resources
    terraform.tfvars.example  # Example variable values
```

### Prerequisites

- Terraform >= 1.5.0
- Credentials for the target cloud provider, supplied via environment variables
  (never committed to the repository)

### Usage

```bash
cd infra/terraform

# Initialize providers and modules
terraform init

# Review the execution plan
terraform plan -var-file=terraform.tfvars

# Provision the infrastructure
terraform apply -var-file=terraform.tfvars

# Tear down when no longer needed
terraform destroy -var-file=terraform.tfvars
```

Copy `terraform.tfvars.example` to `terraform.tfvars` and fill in environment-specific
values before running `plan` or `apply`. The `terraform.tfvars` file is git-ignored.

### Reproducibility

Because every resource is declared in code, environments can be recreated from scratch
by running `terraform apply` against a fresh state. Remote state is configured so that
multiple operators share a single source of truth.

### Testing

Infrastructure changes are validated in CI:

```bash
cd infra/terraform
terraform fmt -check
terraform init -backend=false
terraform validate
```

Deployment order: `shared` (build only) → `treasury` → `market_factory` → `market` (wasm upload).

## SSL/TLS Certificate Automation

TLS certificates are managed automatically with [cert-manager](https://cert-manager.io/) and Let's Encrypt, so certificates are provisioned and renewed without manual intervention and never expire unnoticed.

### Install cert-manager

```bash
# Install cert-manager CRDs and controllers
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml

# Wait for the cert-manager components to become ready
kubectl -n cert-manager rollout status deploy/cert-manager
kubectl -n cert-manager rollout status deploy/cert-manager-webhook
kubectl -n cert-manager rollout status deploy/cert-manager-cainjector
```

### Configure Let's Encrypt issuers

Create a staging issuer first to validate DNS/HTTP-01 challenges without hitting production rate limits, then a production issuer:

```yaml
# k8s/cert-manager/cluster-issuer.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    email: ops@bankerchanger.example
    privateKeySecretRef:
      name: letsencrypt-staging-account-key
    solvers:
      - http01:
          ingress:
            class: nginx
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@bankerchanger.example
    privateKeySecretRef:
      name: letsencrypt-prod-account-key
    solvers:
      - http01:
          ingress:
            class: nginx
```

```bash
kubectl apply -f k8s/cert-manager/cluster-issuer.yaml
```

### Provision and rotate certificates

cert-manager renews certificates automatically before expiry. Set `renewBefore` to control how early renewal starts (default is 2/3 of the certificate lifetime):

```yaml
# k8s/cert-manager/certificate.yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: bankerchanger-tls
  namespace: default
spec:
  secretName: bankerchanger-tls
  duration: 2160h      # 90 days
  renewBefore: 720h    # renew 30 days before expiry
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - bankerchanger.example
    - api.bankerchanger.example
```

```bash
kubectl apply -f k8s/cert-manager/certificate.yaml
```

Alternatively, annotate an Ingress and cert-manager will create the `Certificate` automatically:

```yaml
metadata:
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts: [bankerchanger.example]
      secretName: bankerchanger-tls
```

### Verify automation

```bash
# Issuer and Certificate should report Ready=True
kubectl get clusterissuer
kubectl get certificate -A
kubectl describe certificate bankerchanger-tls

# Inspect the issued certificate and its expiry
kubectl get secret bankerchanger-tls -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -noout -subject -dates
```

Automated tests for the provisioning and renewal configuration live in `k8s/cert-manager/certificate_test.sh` and run with `./k8s/cert-manager/certificate_test.sh`.

## Documentation

- **[Getting Started Guide](docs/GETTING_STARTED.md)** — Complete setup guide with Docker
- [Contributing Guidelines](docs/contributing.md)
- [Architecture Overview](docs/architecture.md) — System diagram, data flows, sequence diagrams
- [API Rate Limits](docs/api-rate-limits.md) — Rate limit values, headers, client best practices
- [Observability Guide](docs/observability.md) — Prometheus metric names, alerting, logging
- [Backend Autoscaling](docs/autoscaling.md) — Kubernetes deployment, HPA thresholds, and load tests
- [Operational Runbook](docs/runbook.md) — Incident response procedures for production
- [Deployment Guide](docs/deployment-guide.md) — Instructions for deploying with Docker Compose
- [Troubleshooting Guide](docs/troubleshooting-guide.md) — Common issues and resolution steps

## Development

MIT

## Handsoff notes

<!-- handsoff-issue-111 -->
- #111: Implement Notification Center

<!-- handsoff-issue-112 -->
- #112: Add Loading States and Skeletons
See the individual package READMEs for application-level setup instructions.

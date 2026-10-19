# BANKERCHANGER

Decentralized boxing-only prediction market built on Stellar Soroban.

## Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Rust / Soroban (Stellar) |
| Backend | Node.js / TypeScript |
| Frontend | Next.js 14 / TypeScript / Tailwind CSS |
| Database | PostgreSQL 15 |
| Cache | Redis 7 |
| Wallet | Freighter / Albedo |

## Project Structure

```
contracts/    Soroban smart contracts (MarketFactory, Market, Treasury)
backend/      Indexer + REST API
frontend/     Next.js web app
docs/         Architecture and API documentation
```

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/bankerchanger.git && cd bankerchanger

# 2. Set up environment files
cp backend/.env.example backend/.env
cp indexer/.env.example indexer/.env
cp frontend/.env.example frontend/.env
# Edit .env files with your configuration

# 3. Start all services with one command
docker compose up

# The full stack is now running:
# - PostgreSQL:  localhost:5432
# - Redis:       localhost:6379
# - Indexer:     localhost:3002
# - Backend API: localhost:3001
# - Frontend:    localhost:3000
```

### Development Mode (Local)

If you prefer to run services locally without Docker:

```bash
# 1. Start only infrastructure services
docker compose up postgres redis

# 2. Backend (in separate terminal)
cd backend && npm install && npm run dev

# 3. Indexer (in separate terminal)
cd indexer && npm install && npm run dev

# 4. Frontend (in separate terminal)
cd frontend && npm install && npm run dev
```

## Contract Deployment

Requires [Rust](https://rustup.rs/) and the [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli).

```bash
cd contracts

# Build optimized WASM for all contracts
cargo build --workspace
# or: stellar contract build

# Deploy to Testnet
export ADMIN_SECRET_KEY=S...          # your Stellar secret key
export ORACLE_ADDRESSES=G...,G...     # optional: comma-separated oracle addresses
export DEFAULT_FEE_BPS=200            # optional: platform fee (default 200 = 2%)
./scripts/deploy.sh testnet
```

Deployed addresses are saved to `contracts/deployments.json`:

```json
{
  "network": "testnet",
  "deployedAt": "2025-01-01T00:00:00Z",
  "contracts": {
    "treasury":      { "address": "C..." },
    "marketFactory": { "address": "C...", "defaultFeeBps": 200 },
    "market":        { "wasmHash": "abc123..." }
  },
  "admin": "G..."
}
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

## License

MIT

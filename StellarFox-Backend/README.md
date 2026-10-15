# StellarFox Backend

Express.js API backend with TypeScript for the StellarFox application.

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Run database migrations:
```bash
npm run migrate
```

4. Start development server:
```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Type check TypeScript
- `npm run build:prod` - Compile TypeScript for production
- `npm run test` - Run tests
- `npm run lint` - Lint code
- `npm run migrate` - Run database migrations

## Tech Stack

- TypeScript
- Express.js
- Drizzle ORM
- PostgreSQL
- Redis
- WebSockets

## API Documentation

OpenAPI specification available at `openapi.yaml`

## Network Policies

Kubernetes NetworkPolicies enforce pod-level isolation so that only explicitly
allowed traffic can flow between workloads. The manifests live in
`k8s/network-policies/` and are applied with `kubectl apply -f k8s/network-policies/`.

### Policy Model

- **Default deny** — `default-deny-all.yaml` selects all pods in the namespace
  and denies both ingress and egress. Every other policy is an explicit allow
  layered on top of this baseline.
- **DNS egress** — `allow-dns-egress.yaml` permits UDP/TCP port 53 to
  `kube-system` so name resolution keeps working under default-deny egress.
- **Ingress to the API** — `allow-api-ingress.yaml` allows TCP 3000 to pods
  labeled `app: stellarfox-backend` from the ingress controller namespace only.
- **API to data stores** — `allow-api-to-data.yaml` allows the backend to reach
  PostgreSQL (TCP 5432) and Redis (TCP 6379) pods, and allows those data stores
  to accept traffic from the backend only.
- **Monitoring scrape** — `allow-prometheus-scrape.yaml` allows TCP 9090 from
  the `monitoring` namespace to the backend metrics port.

### Verifying Enforcement

Policy enforcement is verified by `k8s/network-policies/tests/network-policy-test.sh`,
which asserts that allowed flows succeed and disallowed flows are blocked:

```bash
./k8s/network-policies/tests/network-policy-test.sh
```

The test creates a temporary probe pod and checks:

- backend → postgres:5432 is **allowed**
- backend → redis:6379 is **allowed**
- backend → backend:3000 (lateral pod-to-pod) is **blocked**
- frontend → postgres:5432 is **blocked**
- any pod → external internet on port 80 is **blocked**

A non-zero exit code indicates a policy regression.

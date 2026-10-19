# Backend Kubernetes autoscaling

The Kubernetes resources in `k8s/backend.yaml` deploy the backend API behind a
ClusterIP Service and scale its Deployment from 2 to 6 replicas when average
CPU utilization exceeds 70% of the 250m CPU request. Scale-up can add up to two
pods or 100% of the current replicas per minute; scale-down waits five minutes
before removing capacity and removes at most 25% per minute.

The limits intentionally cap database connection growth: each replica can use
up to the backend's configured `DB_POOL_MAX` (10 by default), so the six-pod
maximum can open up to 60 application connections. Confirm the database's
connection limit can support that alongside other services before increasing
`maxReplicas`.

## Deploy

1. Build and publish the image from `backend/` and change the image in
   `k8s/backend.yaml` to the published image.
2. Create the `backend-secrets` Kubernetes Secret with the production backend
   environment variables. At minimum, configure valid `DATABASE_URL`,
   `REDIS_URL`, `STELLAR_RPC_URL`, `ORACLE_PRIVATE_KEY`,
   `ADMIN_JWT_SECRET`, and `FACTORY_CONTRACT_ADDRESS` values. Do not commit
   credentials or a Secret containing real values.
3. Ensure the cluster has the Metrics Server installed; resource-based HPA
   metrics are unavailable without it.
4. Apply the resources with `kubectl apply -f k8s/backend.yaml`.

The Deployment includes CPU and memory requests required for scheduling and
HPA calculations. Its readiness probe removes pods from Service traffic when
the database or Redis is unavailable; its liveness probe checks only that the
process is accepting TCP connections, so transient dependency outages do not
restart every replica.

Backend replicas all schedule the market auto-resolution, auto-lock, and
cleanup jobs. The auto-resolution and auto-lock jobs use Redis distributed
locks so only one replica performs each scheduled run.

## Verify scale behavior

The standard backend test suite validates the manifest's target, thresholds,
replica bounds, resource requests, and scale policies:

```sh
cd backend
npm test -- --runInBand tests/autoscaling/hpa.test.ts
```

To exercise real scaling, first deploy the resources and forward or expose the
backend Service. With `k6` and `kubectl` available, forward the Service (or
provide its URL) and run the integration test. It sustains 500 health checks
per second and requires the HPA's observed replica count to increase within
180 seconds. Run this only against a test environment because it generates
database and Redis traffic.

```sh
KUBERNETES_AUTOSCALING_TEST=true \
AUTOSCALING_BASE_URL=http://localhost:3001 \
npm run test:autoscaling:cluster
```

`AUTOSCALING_BASE_URL` defaults to `http://localhost:3001`. Set
`AUTOSCALING_NAMESPACE` and `AUTOSCALING_HPA` when the deployment is not in the
`default` namespace or its HPA has a different name.

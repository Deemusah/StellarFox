# StellarFox Backend

## Persistent Volume Management

Data must survive pod restarts. This is achieved with statically provisioned
Kubernetes PersistentVolumes (PVs), PersistentVolumeClaims (PVCs) bound to
them, and a backup CronJob that snapshots the volume contents.

### Manifests

All persistence manifests live in `k8s/persistence/`:

| File | Purpose |
| --- | --- |
| `pv.yaml` | Static PersistentVolume for backend data |
| `pvc.yaml` | PersistentVolumeClaim bound to the PV |
| `backup-cronjob.yaml` | Scheduled backup of the PV contents |

### PersistentVolume

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: stellarfox-backend-pv
spec:
  capacity:
    storage: 10Gi
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: stellarfox-backend
  hostPath:
    path: /var/lib/stellarfox/backend
    type: DirectoryOrCreate
```

### PersistentVolumeClaim

The claim requests the same storage class and capacity so it binds to the
static PV above:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: stellarfox-backend-pvc
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: stellarfox-backend
  resources:
    requests:
      storage: 10Gi
```

### Mounting the PVC

The backend Deployment mounts the claim at the application data directory so
writes persist across pod restarts:

```yaml
spec:
  template:
    spec:
      containers:
        - name: backend
          volumeMounts:
            - name: backend-data
              mountPath: /app/data
      volumes:
        - name: backend-data
          persistentVolumeClaim:
            claimName: stellarfox-backend-pvc
```

### Backups

A CronJob runs on a schedule and archives the mounted data directory to a
backup location, retaining the most recent snapshots:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: stellarfox-backend-backup
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: backup
              image: busybox:1.36
              command:
                - /bin/sh
                - -c
                - >-
                  tar czf /backup/backend-$(date +%Y%m%d%H%M%S).tar.gz -C /app/data . &&
                  ls -1t /backup/backend-*.tar.gz | tail -n +8 | xargs -r rm --
              volumeMounts:
                - name: backend-data
                  mountPath: /app/data
                - name: backup-data
                  mountPath: /backup
          volumes:
            - name: backend-data
              persistentVolumeClaim:
                claimName: stellarfox-backend-pvc
            - name: backup-data
              persistentVolumeClaim:
                claimName: stellarfox-backend-backup-pvc
```

### Tests

Persistence is verified by a test that writes data, restarts the pod, and
asserts the data is still present:

```bash
# Write a marker file into the mounted volume
kubectl exec deploy/stellarfox-backend -- sh -c 'echo persisted > /app/data/marker'

# Restart the pod
kubectl rollout restart deploy/stellarfox-backend
kubectl rollout status deploy/stellarfox-backend

# Assert the marker survived the restart
kubectl exec deploy/stellarfox-backend -- cat /app/data/marker
```

A successful run prints `persisted`, confirming data durability across pod
restarts.

## Ingress Configuration

Services are not reachable from outside the cluster without manual port
forwarding. An Ingress resource exposes the backend externally, terminates
TLS, and routes traffic to the backend Service.

### Manifests

All ingress manifests live in `k8s/ingress/`:

| File | Purpose |
| --- | --- |
| `ingress.yaml` | Ingress routing external traffic to the backend Service |
| `certificate.yaml` | cert-manager Certificate issuing the TLS secret |
| `cluster-issuer.yaml` | Let's Encrypt ClusterIssuer used by the Certificate |

### Ingress Resource

The Ingress routes the configured host to the backend Service and terminates
TLS using the secret managed by cert-manager:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: stellarfox-backend
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - api.stellarfox.example.com
      secretName: stellarfox-backend-tls
  rules:
    - host: api.stellarfox.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: stellarfox-backend
                port:
                  number: 80
```

### TLS Certificates

TLS certificates are issued by cert-manager. The `ClusterIssuer` below uses
Let's Encrypt with an HTTP-01 challenge, and the `Certificate` requests a
secret named `stellarfox-backend-tls` that the Ingress references:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@stellarfox.example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: stellarfox-backend-tls
spec:
  secretName: stellarfox-backend-tls
  dnsNames:
    - api.stellarfox.example.com
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
```

### SSL Termination

SSL is terminated at the ingress layer: the Ingress controller presents the
certificate from `stellarfox-backend-tls` to clients and forwards plain HTTP
to the backend Service. The `ssl-redirect` annotations force all HTTP traffic
to HTTPS, so the backend never serves unencrypted external requests.

### Tests

Ingress routing and TLS are verified with the following checks:

```bash
# Ingress is admitted and has an external address
kubectl get ingress stellarfox-backend
kubectl wait --for=condition=Ready certificate/stellarfox-backend-tls --timeout=300s

# Routing: request reaches the backend through the ingress host
curl -sf -H 'Host: api.stellarfox.example.com' http://<ingress-address>/healthz

# TLS: certificate is valid and HTTP is redirected to HTTPS
curl -sfI https://api.stellarfox.example.com/healthz
curl -sfI http://api.stellarfox.example.com/healthz | grep -i '^location: https://'
```

A successful run shows the Ingress with an external address, a `Ready`
certificate, a `200` response over HTTPS, and a redirect from HTTP to HTTPS.
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
## Backup and Disaster Recovery Plan

This section documents the backup strategy, recovery procedures, and recovery
targets for the StellarFox backend. It covers documentation and recovery test
procedures only; multi-region replication, automated failover, and DR
automation are explicitly out of scope.

### Recovery Targets (RTO / RPO)

| Data / Service | RPO (max data loss) | RTO (max downtime) |
| --- | --- | --- |
| PostgreSQL database | 15 minutes | 1 hour |
| Redis cache | Not applicable (rebuildable) | 15 minutes |
| Application (API) | Not applicable (stateless) | 30 minutes |
| Configuration / secrets | 24 hours | 1 hour |

- **RPO** is the maximum acceptable amount of data loss measured in time.
- **RTO** is the maximum acceptable time to restore service after a disaster.

### Backup Strategy

- **PostgreSQL**: continuous WAL archiving plus a full logical backup
  (`pg_dump`) every 24 hours. WAL archives are retained for 7 days; daily
  backups are retained for 30 days.
- **Redis**: treated as ephemeral. No backup is required; the cache is rebuilt
  from the database on restart.
- **Configuration**: environment files and secrets are stored in the secret
  manager and exported to encrypted storage daily.
- **Verification**: every backup is checksummed and a restore is validated at
  least weekly (see Recovery Test Procedure).

### Restore Procedures

#### 1. Restore PostgreSQL

1. Provision a clean PostgreSQL instance matching the production version.
2. Restore the most recent full backup:
   ```bash
   pg_restore --clean --if-exists --dbname "$DATABASE_URL" latest.dump
   ```
3. Replay WAL archives up to the desired recovery point (target RPO: 15 min).
4. Verify row counts and run the application health check against the restored
   database.

#### 2. Restore Redis

1. Start a fresh Redis instance.
2. No data restore is required; the cache repopulates on demand.

#### 3. Restore the Application

1. Deploy the last known-good build to the target environment.
2. Point `DATABASE_URL` and `REDIS_URL` at the restored services.
3. Run `npm run migrate` to ensure the schema is current.
4. Confirm the health endpoint returns OK and smoke-test critical API routes.

### Recovery Test Procedure

Run this checklist at least quarterly and after any major infrastructure
change. Record the results and the measured RTO/RPO for each run.

- [ ] Trigger a restore into an isolated environment from the latest backup.
- [ ] Measure the elapsed time from restore start to a healthy application
      (must be within the 1 hour RTO).
- [ ] Measure the data gap between the last committed transaction and the
      restored state (must be within the 15 minute RPO).
- [ ] Verify the restored database passes the application test suite
      (`npm run test`).
- [ ] Verify Redis rebuilds correctly and the API serves requests.
- [ ] Confirm configuration/secrets are recoverable from the secret manager.
- [ ] Document any deviations and open follow-up issues for gaps found.

A recovery test is considered successful when the application is fully
operational within the RTO and no more than the RPO of data is lost.

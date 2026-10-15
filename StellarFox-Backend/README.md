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

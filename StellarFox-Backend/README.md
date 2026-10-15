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

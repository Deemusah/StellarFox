import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const enabled = process.env.KUBERNETES_AUTOSCALING_TEST === 'true';
const clusterTest = enabled ? test : test.skip;
const namespace = process.env.AUTOSCALING_NAMESPACE ?? 'default';
const hpaName = process.env.AUTOSCALING_HPA ?? 'backend';
const baseUrl = process.env.AUTOSCALING_BASE_URL ?? 'http://localhost:3001';

interface HpaStatus {
  status?: {
    currentReplicas?: number;
    desiredReplicas?: number;
  };
  spec: {
    maxReplicas: number;
    minReplicas: number;
  };
}

function readHpa(): HpaStatus {
  const output = execFileSync(
    'kubectl',
    ['get', 'hpa', hpaName, '--namespace', namespace, '--output', 'json'],
    { encoding: 'utf8' },
  );
  return JSON.parse(output) as HpaStatus;
}

clusterTest(
  'scales the backend up under HTTP load within three minutes',
  async () => {
    const before = readHpa();
    const initialReplicas = before.status?.currentReplicas ?? before.spec.minReplicas;
    if (initialReplicas >= before.spec.maxReplicas) {
      throw new Error('The backend HPA is already at maxReplicas; scaling cannot be measured');
    }

    const load = spawn(
      'k6',
      ['run', 'tests/autoscaling/autoscaling.loadtest.js'],
      {
        cwd: process.cwd(),
        env: { ...process.env, BASE_URL: baseUrl },
        stdio: 'inherit',
      },
    );
    const loadFinished = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        load.once('error', reject);
        load.once('exit', (code, signal) => resolve({ code, signal }));
      },
    );

    let scaled = false;
    try {
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        const status = readHpa();
        if ((status.status?.currentReplicas ?? 0) > initialReplicas) {
          scaled = true;
          break;
        }
        if (load.exitCode !== null) break;
        await delay(5_000);
      }
      expect(scaled).toBe(true);

      const result = await loadFinished;
      expect(result.code).toBe(0);
    } finally {
      if (load.exitCode === null) {
        load.kill();
        await loadFinished;
      }
    }
  },
  240_000,
);

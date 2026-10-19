import fs from 'node:fs';
import path from 'node:path';
import { parseAllDocuments } from 'yaml';

interface Container {
  name: string;
  resources: {
    requests: { cpu: string; memory: string };
    limits: { cpu: string; memory: string };
  };
  readinessProbe: {
    httpGet: { path: string; port: string };
  };
}

type Deployment = {
  kind: 'Deployment';
  metadata: { name: string };
  spec: {
    replicas: number;
    selector: { matchLabels: Record<string, string> };
    template: { spec: { containers: Container[] } };
  };
};

type Service = {
  kind: 'Service';
  spec: { selector: Record<string, string> };
};

type Hpa = {
  kind: 'HorizontalPodAutoscaler';
  spec: {
    scaleTargetRef: { apiVersion: string; kind: string; name: string };
    minReplicas: number;
    maxReplicas: number;
    metrics: Array<{
      type: string;
      resource: {
        name: string;
        target: { type: string; averageUtilization: number };
      };
    }>;
    behavior: {
      scaleUp: {
        stabilizationWindowSeconds: number;
        policies: Array<{ type: string; value: number; periodSeconds: number }>;
      };
      scaleDown: { stabilizationWindowSeconds: number };
    };
  };
};

type KubernetesResource = Deployment | Service | Hpa;

const manifestPath = path.resolve(__dirname, '../../../k8s/backend.yaml');
const parsedDocuments = parseAllDocuments(fs.readFileSync(manifestPath, 'utf8'));
const parseErrors = parsedDocuments.flatMap((document) => document.errors);
if (parseErrors.length > 0) {
  throw new Error(`Invalid Kubernetes YAML: ${parseErrors.map((error) => error.message).join('; ')}`);
}
const documents = parsedDocuments.map((document) => document.toJSON() as KubernetesResource);

function resource<K extends KubernetesResource['kind']>(
  kind: K,
): Extract<KubernetesResource, { kind: K }> {
  const found = documents.find((document) => document.kind === kind);
  if (!found) throw new Error(`Missing ${kind} in ${manifestPath}`);
  return found as Extract<KubernetesResource, { kind: K }>;
}

describe('backend Kubernetes autoscaling configuration', () => {
  const deployment = resource('Deployment');
  const service = resource('Service');
  const hpa = resource('HorizontalPodAutoscaler');
  const container = deployment.spec.template.spec.containers[0];

  it('sets CPU requests so the HPA can calculate utilization', () => {
    expect(container.resources.requests.cpu).toBe('250m');
    expect(container.resources.limits.cpu).toBe('1');
  });

  it('scales the backend Deployment between two and six pods at 70% CPU', () => {
    expect(hpa.spec.scaleTargetRef).toEqual({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      name: deployment.metadata.name,
    });
    expect(hpa.spec.minReplicas).toBe(2);
    expect(hpa.spec.maxReplicas).toBe(6);
    expect(deployment.spec.replicas).toBe(hpa.spec.minReplicas);
    expect(hpa.spec.metrics).toContainEqual({
      type: 'Resource',
      resource: {
        name: 'cpu',
        target: { type: 'Utilization', averageUtilization: 70 },
      },
    });
  });

  it('uses fast scale-up and a five-minute scale-down stabilization window', () => {
    expect(hpa.spec.behavior.scaleUp.stabilizationWindowSeconds).toBe(0);
    expect(hpa.spec.behavior.scaleUp.policies).toEqual(
      expect.arrayContaining([
        { type: 'Percent', value: 100, periodSeconds: 60 },
        { type: 'Pods', value: 2, periodSeconds: 60 },
      ]),
    );
    expect(hpa.spec.behavior.scaleDown.stabilizationWindowSeconds).toBe(300);
  });

  it('routes the Service to the workload and checks backend readiness', () => {
    expect(service.spec.selector).toEqual(deployment.spec.selector.matchLabels);
    expect(container.readinessProbe.httpGet).toMatchObject({
      path: '/health',
      port: 'http',
    });
    expect(container.resources.requests.memory).toBe('256Mi');
  });
});

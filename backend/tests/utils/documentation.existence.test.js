/**
 * Test to verify that essential documentation files exist.
 * This test ensures that documentation completeness is maintained.
 */

const fs = require('fs');
const path = require('path');

describe('Documentation Existence', () => {
  const docsDir = path.resolve(__dirname, '../../docs');

  test('deployment guide exists', () => {
    const deploymentGuidePath = path.join(docsDir, 'deployment-guide.md');
    expect(fs.existsSync(deploymentGuidePath)).toBe(true);
  });

  test('troubleshooting guide exists', () => {
    const troubleshootingGuidePath = path.join(docsDir, 'troubleshooting-guide.md');
    expect(fs.existsSync(troubleshootingGuidePath)).toBe(true);
  });

  test('README contains documentation links', () => {
    const readmePath = path.resolve(__dirname, '../..', 'README.md');
    const readmeContent = fs.readFileSync(readmePath, 'utf8');
    expect(readmeContent).toContain('[Deployment Guide](docs/deployment-guide.md)');
    expect(readmeContent).toContain('[Troubleshooting Guide](docs/troubleshooting-guide.md)');
  });
});
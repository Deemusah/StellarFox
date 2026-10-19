# CI/CD Architecture

Visual architecture and data flow diagrams for the GitHub Actions CI/CD pipeline.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             DEVELOPER WORKFLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

    git push                  Create PR                   Merge
  ┌──────────┐              ┌─────────┐               ┌────────┐
  │ Feature  │─────────────▶│ GitHub  │──────────────▶│  Main  │
  │ Branch   │              │   PR    │               │        │
  └──────────┘              └────┬────┘               └────┬───┘
                                 │
                        ┌────────▼────────┐
                        │  CI Pipeline    │
                        │ (All Tests)     │
                        └────────┬────────┘
                                 │
                           ┌─────▼────────┐
                           │ Tests Pass?  │
                           └─────┬────────┘
                                 │
                        ┌────────▴─────────┐
                        │  Yes             │ No
                        ▼                  ▼
                    Deploy             Notification
                                      (Fix Required)
```

## Pipeline Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CI/CD PIPELINE EXECUTION                            │
└─────────────────────────────────────────────────────────────────────────────┘

TRIGGER: Push to main/develop OR Pull Request

    ┌──────────────────────────┐
    │  Detect Changed Files    │ (Parallel decision point)
    └──────────┬───────────────┘
               │
    ┌──────────┴────────────────────────────────────────┐
    │                                                    │
    ▼                                                    ▼
┌──────────────┐                              ┌──────────────┐
│ Backend      │                              │  Frontend    │
│ Changed?     │                              │  Changed?    │
└──────┬───────┘                              └──────┬───────┘
       │                                             │
       ▼                                             ▼
┌──────────────────────────┐             ┌──────────────────────┐
│   Backend CI Job         │             │  Frontend CI Job     │
│ ┌──────────────────────┐ │             │ ┌──────────────────┐ │
│ │ 1. Setup Node       │ │             │ │ 1. Setup Node    │ │
│ │ 2. Install deps     │ │             │ │ 2. Install deps  │ │
│ │ 3. Lint (eslint)    │ │             │ │ 3. Lint (eslint) │ │
│ │ 4. Validate OpenAPI │ │             │ │ 4. Type check    │ │
│ │ 5. Check migrations │ │             │ │ 5. Unit tests    │ │
│ │ 6. Verify schema    │ │             │ │ 6. Build app     │ │
│ │ 7. Build (tsc)      │ │             │ │ 7. Save artifacts│ │
│ │ 8. Unit tests       │ │             │ └──────────────────┘ │
│ │ 9. Integration      │ │             │                      │
│ │ 10. E2E tests       │ │             └──────────┬───────────┘
│ │ 11. k6 load test    │ │                        │
│ └──────────────────────┘ │                        ▼
└──────┬───────────────────┘             ┌──────────────────────┐
       │                                │  Frontend E2E Job    │
       │              ┌─────────────────┤ (Depends on CI pass) │
       │              │                 │ ┌──────────────────┐ │
       │              │                 │ │ 1. Download deps │ │
       │              │                 │ │ 2. Install PW    │ │
       │              │                 │ │ 3. Start server  │ │
       │              │                 │ │ 4. Wait for port │ │
       │              │                 │ │ 5. Run E2E tests │ │
       │              │                 │ │ 6. Upload logs   │ │
       │              │                 │ └──────────────────┘ │
       │              │                 └──────────┬───────────┘
       │              │                            │
       ▼              ▼                            ▼
    ┌──────────────────────────────────────────────────────┐
    │              CI SUCCESS CHECK                        │
    │  Verify all required jobs passed                     │
    └──────────────┬───────────────────────────────────────┘
                   │
    ┌──────────────▼───────────────────────────────────────┐
    │            Only for main/develop branches           │
    └──────────────┬───────────────────────────────────────┘
                   │
    ┌──────────────┴──────────────────┬───────────────────┐
    │                                 │                   │
    ▼                                 ▼                   ▼
┌──────────────┐             ┌──────────────┐    ┌──────────────┐
│ Backend      │             │ Frontend     │    │ Indexer      │
│ Docker Build │             │ Docker Build │    │ Docker Build │
│              │             │              │    │              │
│ • ghcr.io    │             │ • ghcr.io    │    │ • ghcr.io    │
│ • Bldx cache │             │ • Bldx cache │    │ • Bldx cache │
│ • Tag: dev   │             │ • Tag: dev   │    │ • Tag: dev   │
│ • Push image │             │ • Push image │    │ • Push image │
└──────┬───────┘             └──────┬───────┘    └──────┬───────┘
       │                            │                   │
       └────────────────┬───────────┴───────────────────┘
                        │
        ┌───────────────▼────────────────┐
        │  Docker Build Success Check    │
        │  All images pushed             │
        └───────────────┬────────────────┘
                        │
         ┌──────────────▼──────────────┐
         │   Branch Determination      │
         │ • develop → staging         │
         │ • main    → production      │
         └──────────────┬──────────────┘
                        │
        ┌───────────────┴──────────────┐
        │                              │
        ▼                              ▼
    ┌──────────────┐          ┌──────────────┐
    │    Deploy    │          │    Deploy    │
    │   Staging    │          │ Production   │
    └──────┬───────┘          └──────┬───────┘
           │                         │
    ┌──────▼───────────┐    ┌────────▼──────────┐
    │ 1. Pull images   │    │ 1. Pull images   │
    │ 2. Healthcheck   │    │ 2. Healthcheck   │
    │ 3. Deploy        │    │ 3. Deploy        │
    │ 4. Smoke tests   │    │ 4. Smoke tests   │
    │ 5. Notify        │    │ 5. Create issue  │
    │                  │    │ 6. Notify        │
    └──────────────────┘    └──────────────────┘
```

## Component Interactions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SERVICES & DEPENDENCIES                              │
└─────────────────────────────────────────────────────────────────────────────┘

GitHub Repository
    │
    ├─ Workflows (.github/workflows/)
    │  ├─ ci-cd.yml (CI pipeline)
    │  └─ deploy.yml (deployment)
    │
    ├─ Services
    │  ├─ backend/ (Express + TypeScript)
    │  │  └─ Tests: pg:5432, redis:6379
    │  │
    │  ├─ frontend/ (Next.js)
    │  │  └─ Tests: Jest, Playwright
    │  │
    │  ├─ indexer/ (Stellar indexer)
    │  │  └─ Tests: Jest
    │  │
    │  └─ contracts/ (Soroban)
    │     └─ Tests: Clippy, cargo audit
    │
    └─ Container Registry (GHCR)
       ├─ ghcr.io/.../backend:latest
       ├─ ghcr.io/.../frontend:latest
       └─ ghcr.io/.../indexer:latest
```

## Test Execution Parallelization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PARALLEL JOB EXECUTION                                 │
│              (All jobs run simultaneously where possible)                    │
└─────────────────────────────────────────────────────────────────────────────┘

Timeline:
0:00  ┌─ Detect Changes ─────────────────────────────┐
      │                                               │
0:30  │  ┌─ Backend CI ─┐   ┌─ Frontend CI ┐  ┌─ Contracts CI ─┐
      │  │              │   │              │  │                │
5:00  │  │ 4-5 min      │   │ 3-4 min      │  │ 2-3 min        │
      │  │              │   │              │  │                │
      │  └──────────────┘   └───────────┬──┘  └────────────────┘
      │                                │
      │                                ▼
      │                      ┌─ Frontend E2E ─┐
      │                      │ (depends on CI) │
6:00  │                      │ 2-3 min         │
      │                      └─────────────────┘
      │
7:00  │  ┌─ Backend Docker ──┐  ┌─ Frontend Docker ──┐  ┌─ Indexer Docker ─┐
      │  │ (depends on CI)    │  │ (depends on CI)    │  │ (depends on CI)   │
      │  │ 3-4 min            │  │ 3-4 min            │  │ 2-3 min           │
10:00 │  └────────────────────┘  └────────────────────┘  └───────────────────┘
      │
11:00 │  ┌─ Deploy Staging / Production ───────────────────┐
      │  │ 5-10 min (depending on deployment target)       │
      │  └────────────────────────────────────────────────┘
      │
15:00 └──────────────────────────────────────────────────────┘

Total time: ~12-15 minutes (with parallelization)
Without parallelization: ~25-30 minutes
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW                                          │
└─────────────────────────────────────────────────────────────────────────────┘

Developer
    │
    │ git push
    ▼
┌─────────────────────┐
│  GitHub Repository  │ ◀─── Webhook
└──────────┬──────────┘
           │
           │ Trigger
           ▼
┌─────────────────────────────────────────────┐
│  GitHub Actions Runner (ubuntu-latest)      │
├─────────────────────────────────────────────┤
│ • Checkout code                             │
│ • Install dependencies (npm ci)             │
│ • Run tests                                 │
│ • Build application                         │
│ • Run linters                               │
│ • Upload artifacts                          │
└──────────┬──────────────────────────────────┘
           │
           │ Test Results
           ├──────────────────────┐
           │                      ▼
           │            ┌──────────────────┐
           │            │ GitHub Checks    │
           │            │ (Green/Red)      │
           │            └──────────────────┘
           │
           │ If tests pass on main/develop
           │
           ▼
┌──────────────────────────────────┐
│  Docker Build (GitHub Actions)   │
│ • Multi-stage builds             │
│ • GHA cache layer                │
│ • Build context: service dir     │
└──────────┬───────────────────────┘
           │
           │ docker push
           ▼
┌──────────────────────────────────┐
│  GHCR (Container Registry)       │
│ • ghcr.io/org/repo/service:tag   │
└──────────┬───────────────────────┘
           │
           │ Docker image available
           │
           ▼
┌──────────────────────────────────┐
│  Deployment Workflow             │
│ • Pull image from GHCR           │
│ • Deploy to environment          │
│ • Run health checks              │
│ • Run smoke tests                │
└──────────┬───────────────────────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
┌────────┐   ┌───────────┐
│Staging │   │Production │
└────────┘   └───────────┘
    │             │
    │             ▼
    │      ┌──────────────┐
    │      │ Public Users │
    │      └──────────────┘
    │
    └──▶ Test Environment
```

## Caching Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CACHING LAYERS                                       │
└─────────────────────────────────────────────────────────────────────────────┘

npm Dependencies (Node.js)
┌──────────────────────────────────┐
│ Cache Key:                       │
│ ${{ runner.os }}-node-modules-   │
│ ${{ hashFiles('*/package-lock.json') }}
│                                  │
│ Hit Rate: 95%+ (on same branch)  │
│ Time Saved: ~30 sec per job      │
└──────────────────────────────────┘

Cargo Cache (Rust)
┌──────────────────────────────────┐
│ Cache Key:                       │
│ ${{ runner.os }}-cargo-          │
│ ${{ hashFiles('Cargo.lock') }}   │
│                                  │
│ Hit Rate: 90%+                   │
│ Time Saved: ~1-2 min per build   │
└──────────────────────────────────┘

Docker Layer Cache (via GHA)
┌──────────────────────────────────┐
│ Type: gha                        │
│                                  │
│ Hit Rate: 80%+ (multi-stage)     │
│ Time Saved: ~2-3 min per build   │
└──────────────────────────────────┘

Artifacts (Frontend build)
┌──────────────────────────────────┐
│ Artifact: .next/ directory       │
│                                  │
│ Usage: E2E tests                 │
│ Time Saved: ~1 min               │
│ Retention: 1 day                 │
└──────────────────────────────────┘
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SECURITY MEASURES                                       │
└─────────────────────────────────────────────────────────────────────────────┘

Authentication
├─ GITHUB_TOKEN: GitHub Actions generated token
│  └─ Scopes: contents:read, packages:write
│
├─ Container Registry: Authenticated push via GITHUB_TOKEN
│  └─ Images: ghcr.io (private by default)
│
└─ Deployment: Environment secrets (implemented in TODO)
   ├─ Staging secrets
   └─ Production secrets

Secret Scanning
├─ Gitleaks: On every push
│  └─ Fails job if secrets found
│
└─ Dependency Audit: cargo audit, npm audit
   └─ Fails on critical vulnerabilities

Code Quality
├─ Linting: ESLint, Clippy
├─ Type Checking: TypeScript
└─ Schema Validation: Drizzle check

Protected Branches
├─ Main: Requires all checks pass
├─ PR Review: Required (configured)
└─ Admin Review: Required for production (optional)
```

## Failure Recovery

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FAILURE RECOVERY PATHS                                    │
└─────────────────────────────────────────────────────────────────────────────┘

Test Failure
    │
    ▼
┌─────────────────────────┐
│ Workflow marked RED     │
│ Status check fails      │
└──────────┬──────────────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
Developer     PR Review
fixes code    required
    │             │
    └──────┬──────┘
           │
           ▼
    Re-run pipeline
           │
           ├─ Pass: Continue
           └─ Fail: Repeat

Deployment Failure
    │
    ▼
┌──────────────────────────┐
│ Deployment job fails     │
│ Automatic incident issue │
│ created on GitHub        │
└──────────┬───────────────┘
           │
    ┌──────┴──────────────────┐
    │                         │
    ▼                         ▼
Investigate              Rollback
    │                         │
    ▼                         ▼
Fix & re-push          git revert
    │                         │
    └──────────┬──────────────┘
               │
               ▼
        Auto re-deploy
```

## Environment Mapping

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BRANCH TO ENVIRONMENT MAPPING                             │
└─────────────────────────────────────────────────────────────────────────────┘

Branch: develop
├─ CI Tests: ✓ Required
├─ Docker Build: ✓ Required
├─ Tag: develop
├─ Deployment: → Staging
├─ URL: staging.bankerchanger.app
└─ Protection: Standard

Branch: main
├─ CI Tests: ✓ Required
├─ Docker Build: ✓ Required
├─ Tag: latest, main
├─ Deployment: → Production
├─ URL: bankerchanger.app
├─ Protection: Strict (require reviews)
└─ Deployment: Manual approval (TODO)

Branch: feature/*
├─ CI Tests: ✓ Required
├─ Docker Build: ✗ Skipped
├─ Deployment: ✗ Skipped
└─ Status: PR feedback only

Branch: hotfix/*
├─ CI Tests: ✓ Required
├─ Docker Build: ✓ If merged to main
├─ Deployment: ✓ If merged to main
└─ Fast-track: Main → Production
```

---

## Related Documents

- [CI/CD Pipeline Guide](./GITHUB_ACTIONS_CI_CD.md)
- [Quick Reference](./CI_CD_QUICK_REFERENCE.md)
- [Deployment Runbook](./DEPLOYMENT_RUNBOOK.md)

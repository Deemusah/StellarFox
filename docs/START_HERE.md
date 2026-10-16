# GitHub Actions CI/CD - Start Here

Quick start guide to the new automated CI/CD pipeline for StellarFox.

## What Was Built

A complete, production-ready GitHub Actions CI/CD pipeline that:
- ✅ Automatically tests code on every push
- ✅ Builds and pushes Docker images
- ✅ Deploys to staging and production
- ✅ Includes comprehensive documentation

## Files You Need to Know About

### Workflow Files (GitHub Actions)
```
.github/workflows/
├── ci-cd.yml      ← Main testing and building
└── deploy.yml     ← Deployment automation
```

### Documentation (in priority order)

**1. For Quick Start (5 min read)**
```
docs/CI_CD_QUICK_REFERENCE.md
- What gets tested
- Common commands
- Workflow status
```

**2. For Understanding the System (15 min read)**
```
docs/GITHUB_ACTIONS_CI_CD.md
- Complete architecture
- Detailed job documentation
- Troubleshooting guide
```

**3. For Deployments (10 min read)**
```
docs/DEPLOYMENT_RUNBOOK.md
- Step-by-step deployment
- Verification procedures
- Rollback instructions
```

**4. For Visual Understanding (5 min)**
```
docs/CI_CD_ARCHITECTURE.md
- System diagrams
- Data flows
- Component interactions
```

**5. For Implementation (Checklist)**
```
CI_CD_IMPLEMENTATION_CHECKLIST.md
- Setup tasks
- Testing procedures
- Verification steps
```

## How It Works in 30 Seconds

```
You push code
    ↓
Tests run automatically (backend, frontend, indexer, contracts)
    ↓
If tests pass:
    ├─ Docker images built
    ├─ Images pushed to registry (ghcr.io)
    ├─ Develop branch → Deploy to staging
    └─ Main branch → Deploy to production
    ↓
If tests fail:
    └─ Notification sent, deployment blocked
```

## Three Ways to Use It

### 1. Automatic (Just Push Code)
```bash
# Create feature branch
git checkout -b feature/my-feature
echo "code" > file.ts
git add .
git commit -m "feat: my feature"
git push

# That's it! CI runs automatically
# When ready to merge:
# - Create PR
# - Wait for tests to pass
# - Merge to develop (stages) or main (production)
```

### 2. Monitor Status
```
GitHub → Actions tab → See running tests
```

### 3. Manual Deployment (If needed)
```
GitHub → Actions → "Deploy to Environment"
→ Run workflow → Choose environment
```

## Key Commands

```bash
# View workflow status
# GitHub → Actions → CI/CD Pipeline

# View test logs
# GitHub → Actions → [Latest run] → [Job]

# Test locally (before pushing)
cd backend && npm run lint && npm test
cd frontend && npm run lint && npm test

# Pull docker image
docker pull ghcr.io/your-org/stellarfox/backend:latest
```

## Important Concepts

### Branches Matter
- **develop** → Triggers staging deployment
- **main** → Triggers production deployment
- **other** → Only runs tests, no deployment

### Tests Run On
- ✅ Every push
- ✅ Every pull request
- ✅ Can be manually triggered

### What Gets Built
- ✅ Backend service
- ✅ Frontend app
- ✅ Indexer service
- ✅ Smart contracts (audit only, not built)

### Where Images Go
```
ghcr.io/your-org/stellarfox/backend:latest
ghcr.io/your-org/stellarfox/frontend:latest
ghcr.io/your-org/stellarfox/indexer:latest
```

## Troubleshooting Quick Links

| Problem | Solution |
|---------|----------|
| Tests failing | See docs/CI_CD_QUICK_REFERENCE.md → Fix Common Failures |
| Don't understand pipeline | Read docs/GITHUB_ACTIONS_CI_CD.md |
| Need to deploy | See docs/DEPLOYMENT_RUNBOOK.md |
| Want to test locally | Use `act` tool (see docs) |

## Next Steps

### For Developers
1. ✅ Read this file (you're here!)
2. 📖 Skim CI_CD_QUICK_REFERENCE.md
3. 🚀 Push some code and watch it work

### For Operations/Devops
1. ✅ Read this file
2. 📖 Read GITHUB_ACTIONS_CI_CD.md (architecture)
3. 📋 Follow CI_CD_IMPLEMENTATION_CHECKLIST.md
4. 🚀 Set up deployment templates

### For Team Leads
1. ✅ Read this file
2. 📖 Skim all documentation
3. 👥 Share with team
4. 📚 Bookmark DEPLOYMENT_RUNBOOK.md for operations

## Success Indicators

After implementation, you should see:

✅ **Red checkmarks turn green** when code is pushed
✅ **Docker images appear** in GitHub Packages
✅ **No manual deployments** needed
✅ **Team runs tests faster** (automated)
✅ **Fewer bugs** reach production (comprehensive testing)

## FAQ

**Q: How long do tests take?**
A: ~10-12 minutes total (all services run in parallel)

**Q: Can I skip tests?**
A: No (by design). Force push requires branch protection bypass.

**Q: Where do I see deployment status?**
A: GitHub → Deployments tab

**Q: What if deployment fails?**
A: Automatic incident issue created. See DEPLOYMENT_RUNBOOK.md for steps.

**Q: Can I test this locally?**
A: Yes! Use `act` tool. See CI_CD_QUICK_REFERENCE.md

**Q: How do I rollback?**
A: See DEPLOYMENT_RUNBOOK.md → Rollback Procedures section

## Getting Help

1. **Check the docs** → docs/CI_CD_QUICK_REFERENCE.md
2. **Read full guide** → docs/GITHUB_ACTIONS_CI_CD.md
3. **Google it** → "GitHub Actions [your question]"
4. **Ask team** → Share docs/DEPLOYMENT_RUNBOOK.md

## Documentation Map

```
START_HERE.md (you are here)
    ↓
    ├─ Quick Questions?
    │  └─ CI_CD_QUICK_REFERENCE.md
    │
    ├─ Want to Understand?
    │  ├─ CI_CD_ARCHITECTURE.md (visual)
    │  └─ GITHUB_ACTIONS_CI_CD.md (detailed)
    │
    ├─ Need to Deploy?
    │  └─ DEPLOYMENT_RUNBOOK.md
    │
    └─ Setting Everything Up?
       └─ CI_CD_IMPLEMENTATION_CHECKLIST.md
```

## Important Files Reference

| File | Purpose | Read Time |
|------|---------|-----------|
| .github/workflows/ci-cd.yml | Main pipeline | - (code) |
| .github/workflows/deploy.yml | Deployment | - (code) |
| docs/CI_CD_QUICK_REFERENCE.md | Quick lookup | 5 min |
| docs/GITHUB_ACTIONS_CI_CD.md | Complete guide | 20 min |
| docs/CI_CD_ARCHITECTURE.md | Diagrams | 10 min |
| docs/DEPLOYMENT_RUNBOOK.md | Deployment steps | 15 min |
| CI_CD_IMPLEMENTATION_CHECKLIST.md | Setup checklist | 10 min |

---

## Ready to Go?

1. **Push some code** to see CI in action
2. **Check GitHub Actions** tab for results
3. **Read the relevant docs** for deeper understanding
4. **Bookmark DEPLOYMENT_RUNBOOK.md** for operations

That's it! The pipeline is ready to use.

---

**Questions?** Start with the relevant documentation above.
**Something broken?** Check the troubleshooting sections in the docs.
**Want to customize?** See GITHUB_ACTIONS_CI_CD.md → Maintenance section.

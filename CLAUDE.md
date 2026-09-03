## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec

## Deploy Configuration (configured by /setup-deploy)
- Platform: Fly.io (backend + agent), Vercel (frontend)
- Production URL:
  - backend: https://beet-health-backend.fly.dev
  - agent: internal worker, no public URL
  - frontend: assigned by `vercel --prod` on first deploy (set VITE_ env after)
- Deploy workflow: manual `fly deploy` per service (no auto-deploy configured); Vercel auto-deploys on push once linked
- Deploy status command:
  - `fly status -c backend.fly.toml`
  - `fly status -c agent.fly.toml`
  - `vercel ls --prod` (from `frontend/`)
- Merge method: n/a (deploy is manual per-service, not merge-triggered)
- Project type: 3 independent services — Express/Mongo API, LiveKit voice worker, React/Vite SPA
- Post-deploy health check: `curl -sf https://beet-health-backend.fly.dev/api/meals`

### Per-service deploy
Build context for backend/agent is the **repo root** (backend Dockerfile needs
root-level `foods.json`) — always run `fly deploy` from the repo root, not
from inside `backend/`/`agent/`.

```bash
export FLYCTL_INSTALL="$HOME/.fly" && export PATH="$FLYCTL_INSTALL/bin:$PATH"

# one-time app creation (first deploy only)
fly launch -c backend.fly.toml --no-deploy --copy-config
fly launch -c agent.fly.toml --no-deploy --copy-config

# secrets (one-time, per app)
fly secrets set -c backend.fly.toml MONGO_URI="<your Atlas or Mongo URI>" \
  CORS_ORIGIN="<frontend prod URL>"
fly secrets set -c agent.fly.toml LIVEKIT_URL="wss://<project>.livekit.cloud" \
  LIVEKIT_API_KEY="<key>" LIVEKIT_API_SECRET="<secret>" \
  BACKEND_URL="https://beet-health-backend.fly.dev"

# deploy
fly deploy -c backend.fly.toml
fly deploy -c agent.fly.toml

# frontend (from frontend/)
cd frontend && vercel --prod
# then set VITE_BACKEND_URL (or whatever the frontend .env key is) in the
# Vercel project settings to the backend's fly.dev URL, redeploy.
```

### Custom deploy hooks
- Pre-merge: none
- Deploy trigger: manual `fly deploy` / `vercel --prod` (see above)
- Deploy status: `fly status -c <service>.fly.toml`, `vercel ls --prod`
- Health check: `curl -sf https://beet-health-backend.fly.dev/api/meals`

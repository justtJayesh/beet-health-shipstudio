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
- Platform: Render (backend + agent, via `render.yaml` Blueprint), Vercel (frontend)
- Production URL:
  - backend: https://beet-health-backend.onrender.com
  - agent: background worker, no public URL
  - frontend: assigned by `vercel --prod` on first deploy (set VITE_ env after)
- Deploy workflow: Render auto-deploys both services on push to `main` once
  the Blueprint is connected (one-time dashboard step, see below); Vercel
  auto-deploys on push once linked
- Deploy status command:
  - `curl -sf https://beet-health-backend.onrender.com/api/meals` (backend)
  - Render dashboard → service → Events tab (no official deploy-status CLI)
  - `vercel ls --prod` (from `frontend/`)
- Merge method: auto-deploy on push to `main` (both Render services + Vercel)
- Project type: 3 independent services — Express/Mongo API (free Web
  Service), LiveKit voice worker (paid Background Worker, $7/mo min, free
  tier doesn't support non-HTTP workers), React/Vite SPA
- Post-deploy health check: `curl -sf https://beet-health-backend.onrender.com/api/meals`

### One-time setup (dashboard, can't be done via CLI/agent — needs your GitHub OAuth)
1. https://dashboard.render.com/blueprints → New Blueprint Instance → connect
   this repo → Render reads `render.yaml` and creates both services.
2. Fill in the `sync: false` env vars it prompts for:
   - backend: `MONGO_URI` (Atlas URI), `CORS_ORIGIN` (frontend Vercel URL,
     fill in after step 3)
   - agent: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (from
     `agent/.env`), `BACKEND_URL=https://beet-health-backend.onrender.com`
3. Frontend: `cd frontend && vercel --prod`, then set the backend URL as a
   `VITE_*` env var in Vercel project settings and redeploy.
4. Go back to Render, set backend's `CORS_ORIGIN` to the Vercel prod URL.

Build context for backend/agent is the **repo root** (backend Dockerfile
needs root-level `foods.json`) — `render.yaml`'s `dockerContext: .` already
handles this, no action needed.

### Custom deploy hooks
- Pre-merge: none
- Deploy trigger: automatic on push to `main` (Render + Vercel both watch the repo)
- Deploy status: Render dashboard Events tab; `vercel ls --prod`
- Health check: `curl -sf https://beet-health-backend.onrender.com/api/meals`

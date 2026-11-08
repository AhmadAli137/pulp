# Deployment

## Option A: Vercel (what is live now)

Live at **https://pulp-mu-six.vercel.app** (project `pulp`). One Vercel project serves the built frontend as static files and the FastAPI backend as a Python
serverless function (`api/index.py`). `vercel.json` rewrites `/api/*`, `/docs` and `/openapi.json` to the function
and every other path to the SPA. The summary CSVs are uploaded with the deployment from `./data` (not from git), and
`docs/findings.json` ships with it for the Insights screen.

```bash
npx vercel link --yes --project pulp     # once
npx vercel deploy --prod --yes           # every release (uploads ./data and builds frontend/ on Vercel)
```

Project settings to make in the Vercel dashboard (Project -> Settings):

| Setting | Value |
|---|---|
| Deployment Protection -> Vercel Authentication | **Disabled** (otherwise judges get a 401 login wall) |
| Environment Variables | `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.5-flash` (or `VULTR_INFERENCE_API_KEY` + `AI_PROVIDER=vultr`) |
| Storage (optional) | add Upstash Redis from the Marketplace; its `KV_REST_API_URL`/`KV_REST_API_TOKEN` make confirmed context durable. Without it, context lives in the function's `/tmp` and can reset between cold starts. |

Redeploy after changing environment variables. The summary CSVs are committed, so git-triggered deploys carry the data. Vercel cannot host the voice websocket or
long jobs; use it as a static mirror and demo from Vultr (Option B).

## Option B: Vultr, one instance for frontend, API, voice relay and the ADK council (recommended for the demo)

One Docker image serves the API and the built frontend; Caddy in front terminates HTTPS. This is the deployment
that supports everything: the Gemini Live voice relay is a websocket (Vercel's Python functions cannot hold one),
the browser only allows the microphone on HTTPS, and the Stage 3 council on Google ADK runs inside the same process.

```
GitHub (push to master) ──▶ Actions: pytest + npm build ──▶ ssh vultr: git reset --hard, docker compose up -d --build
                                                                  │
<ip>.sslip.io or your domain ──▶ Caddy :443 (Let's Encrypt) ──▶ app :8000 (FastAPI + dist + /api/voice websocket)
```

### 1. Create the instance

Vultr Cloud Compute, Ubuntu 24.04, Toronto, 2 vCPU / 4 GB (the population table, Monte Carlo and ADK are
in-memory and light). Add your SSH key when creating it and note the public IP.

### 2. Bootstrap in one command

As root on the server. No domain is needed: the script defaults to `<ip>.sslip.io`, a free hostname that resolves
to the server, and Caddy obtains a certificate for it.

```bash
curl -fsSL https://raw.githubusercontent.com/AhmadAli137/pulp/master/deploy/vultr-setup.sh | GEMINI_API_KEY=AQ.xxxx bash
```

The script installs Docker, opens 22/80/443, clones the repo (the summary CSVs are committed, so no upload step),
writes `/opt/pulp/.env`, builds the image, starts Caddy + app, waits for `/api/health`, and prints the URL.
Add `DOMAIN=yourdomain.tld` in front of `bash` once an A record points at the server.

### 3. Keys and models

Edit `/opt/pulp/.env` and rebuild (`cd /opt/pulp && docker compose up -d --build`). Relevant variables:

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY`, `GEMINI_MODEL` | text roles: companion, Strategist, Challenger (Google ADK uses the same key) |
| `GEMINI_LIVE_MODEL`, `GEMINI_LIVE_API_VERSION` | native-audio voice relay |
| `VULTR_INFERENCE_API_KEY` | optional fallback provider when Gemini is down or unkeyed |
| `AI_PROVIDER` | `auto` (Gemini, else Vultr, else offline) |

### 4. Deploy on every push

Repository settings: secrets `VULTR_HOST` (the IP), `VULTR_USER` (`root`), `VULTR_SSH_KEY` (private key), and the
variable `DEPLOY_ENABLED=true`. `.github/workflows/deploy.yml` then runs the tests, builds the frontend and redeploys
over SSH on each push to `master`, waiting for the health check before it reports success.

### 5. Verify

```bash
curl https://<ip>.sslip.io/api/health          # accounts: 4500, ai_provider: gemini
curl -X POST https://<ip>.sslip.io/api/agent/plan -H 'content-type: application/json'      -d '{"account_id": 47788, "income_fraction": 0.55, "use_ai": true}'   # mode: adk, two agents, ~12 s
```

Open the site, load an account, and test the microphone from the home screen: the websocket upgrades through Caddy.

## Local check of the production image

```bash
docker build -t pulp .
docker run --rm -p 8080:8000 -v "$(pwd)/data-20261107T180312Z-1-001/data:/app/data:ro" --env-file .env pulp
# http://127.0.0.1:8080
# On Windows Git Bash use a native path and disable path conversion, or the mount comes up empty:
#   MSYS_NO_PATHCONV=1 docker run --rm -p 8080:8000 -v "C:/path/to/data:/app/data:ro" --env-file .env pulp
```

## Notes

- Confirmed life context is stored in the `context` Docker volume so redeploys keep it; `docker compose down -v`
  wipes it.
- CORS allows the local dev origins plus `https://$DOMAIN`; add more with `PULP_ALLOWED_ORIGINS=a,b`.
- Browser speech recognition requires HTTPS on a real domain, which this setup provides.

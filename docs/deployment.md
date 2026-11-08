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

Redeploy after changing environment variables. Git-based deploys would lack the CSVs (they are git-ignored), so
deploy from a machine that has `./data`, or add a build step that downloads them from private storage.

## Option B: Vultr + GoDaddy domain + deploy on every push

One Docker image serves the API and the built frontend; Caddy in front terminates HTTPS for your domain.
Every push to `master` runs the tests, builds the frontend, and redeploys the server over SSH.

```
GitHub (push to master) ──▶ Actions: pytest + npm build ──▶ ssh vultr: git reset --hard, docker compose up -d --build
                                                                  │
GoDaddy DNS  A @ ──▶ Vultr instance IP ──▶ Caddy :443 (Let's Encrypt) ──▶ app :8000 (FastAPI + dist)
```

## 1. Vultr instance

Cloud Compute, Ubuntu 24.04, 2 vCPU / 4 GB is comfortable (the population table and Monte Carlo are in-memory
pandas/numpy). Add your SSH key when creating it. Then, on the server as root:

```bash
curl -fsSL https://raw.githubusercontent.com/AhmadAli137/pulp/master/deploy/vultr-setup.sh | DOMAIN=yourdomain.tld bash
```

This installs Docker, opens ports 22/80/443, clones the repo into `/opt/pulp` and writes a starter `.env`.

## 2. Data and secrets

The CSVs are not in git. From your laptop, in the repo root:

```bash
bash deploy/upload-data.sh root@<server-ip>
```

It uploads the summary CSVs (not the 100 MB transactions file, which the API never loads) and your local `.env`
(Gemini key). Keep `DOMAIN=yourdomain.tld` in the server's `.env`.

## 3. Domain (GoDaddy)

In GoDaddy DNS for the domain:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | @ | `<server-ip>` | 600 |
| CNAME | www | @ | 600 |

Caddy requests the certificate automatically on first start once DNS resolves (usually within minutes).
`pulp.ai` and `pulp.app` are already registered; pick an available name and set it as `DOMAIN`.

## 4. First start

```bash
cd /opt/pulp && DOMAIN=yourdomain.tld docker compose up -d --build
docker compose logs -f app      # wait for "Population table ready"
```

Open `https://yourdomain.tld`. The API docs are at `/docs`, health at `/api/health`.

## 5. Deploy on every push

In the GitHub repo, Settings → Secrets and variables → Actions, add:

| Secret | Value |
|---|---|
| `VULTR_HOST` | server IP or hostname |
| `VULTR_USER` | `root` (or a sudo-capable user that can run docker) |
| `VULTR_SSH_KEY` | private key whose public half is in the server's `~/.ssh/authorized_keys` |

Then add the repository **variable** `DEPLOY_ENABLED` = `true` (same page, Variables tab); until it exists the deploy job is skipped
and pushes only run tests. Optionally create a `production` environment with required reviewers to gate deploys. After that, every push to
`master` that passes tests redeploys within about two minutes; the workflow waits for `/api/health` and prints
container logs if it fails.

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

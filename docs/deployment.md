# Deployment and operations

## Primary deployment

**askpulp.com** is the primary application: React build, FastAPI, SSE conversation and the native Gemini Live WebSocket run together on Vultr behind Caddy. The deployment configuration redirects `askpulp.ca`, `www.askpulp.ca` and `www.askpulp.com` to the primary domain. Domain rules live in [`deploy/Caddyfile.askpulp`](../deploy/Caddyfile.askpulp).

The older Vercel configuration remains in the repository as a secondary/legacy deployment option. It is not the canonical voice-capable production host; do not use it to verify the complete experience or assume it is synchronized with Vultr.

## Stack and persistence

[`Dockerfile`](../Dockerfile) builds with Node 22 and runs Python 3.12 with one Uvicorn worker. [`docker-compose.yml`](../docker-compose.yml) defines:

- `app`: built frontend plus API; the host's `./data` is mounted read-only at `/app/data`.
- `caddy`: HTTPS and WebSocket/SSE proxying on ports 80/443.
- `context`: persistent per-account context at `/app/backend/app/storage/context`.
- `caddy_data` and `caddy_config`: certificate and proxy state.

The server checkout is `/opt/pulp`. Source data is mounted, not baked into the Docker image. Back up the context volume before destructive maintenance. `docker compose down -v` removes named volumes, including saved context; it is not a routine redeploy command.

## Configuration

Copy [.env.example](../.env.example) and provide real values privately. Never commit `.env` or private keys.

| Variable | Function |
|---|---|
| `DOMAIN`, `CADDYFILE` | Public host and proxy configuration; primary uses `askpulp.com` and `./deploy/Caddyfile.askpulp` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini extraction and ADK text roles |
| `GEMINI_LIVE_MODEL`, `GEMINI_LIVE_API_VERSION`, `GEMINI_LIVE_VOICE` | Native audio configuration; repository voice default is Aoede |
| `AI_PROVIDER` | Companion/extraction selection: auto, gemini, vultr or offline; does not turn Vultr into a Gemini Live replacement |
| `VULTR_INFERENCE_API_KEY`, `VULTR_INFERENCE_MODEL`, `VULTR_INFERENCE_BASE_URL` | Optional companion/extraction provider |
| `PULP_DATA_DIR` / `EVERPATH_DATA_DIR` | Data discovery outside the Compose-mounted default |
| `PULP_STORAGE_DIR`, `PULP_DERIVED_DIR` | Optional writable context and derived-artifact locations |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Optional Redis REST persistence; Upstash aliases are also recognized |
| `PULP_ALLOWED_ORIGINS` | Additional comma-separated CORS origins |

The committed model names are application defaults. Check availability with the configured provider when operating the app; do not copy old quota or latency claims into an SLA. Live audio requires microphone permission and a secure browser context (HTTPS in production, localhost in development).

For a new host, inspect [`deploy/vultr-setup.sh`](../deploy/vultr-setup.sh) before running it. It installs Docker, prepares the checkout and environment, and starts the stack. Point DNS at the intended host and choose the matching Caddyfile. Existing deployment credentials and server state are not part of the repository.

## Automated release

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) is authoritative:

1. Push/PR/manual dispatch runs the named backend regression subset, voice client test and frontend build.
2. Deployment requires a push or manual dispatch on `master`, repository variable `DEPLOY_ENABLED=true`, and the `production` environment.
3. Secrets are `VULTR_HOST`, `VULTR_USER`, and `VULTR_SSH_KEY`.
4. The runner uses native OpenSSH. It sends the exact tested `github.sha` to the server, fetches the branch, resets the dedicated deployment checkout to that commit and rebuilds Compose services.
5. A bounded internal `/api/health` check must succeed. Production deploy jobs are serialized; the runner removes its temporary private key on exit.

The server checkout must not contain uncommitted work: the release intentionally resets it. The workflow currently obtains host keys with `ssh-keyscan`; it does not pin an independently verified fingerprint in a secret.

### Why the SSH action 504 issue changed

The deploy job no longer downloads a third-party SSH action or its release binary. This removes that particular dependency and its download-504 failure path. GitHub availability, network failures, SSH access, image builds and provider outages can still fail. Start a new workflow run from the updated branch when replacing a historical failed workflow; retrying an old run can retain its old workflow definition.

## Verification and recovery

Read-only checks after a release:

```sh
curl -fsS https://askpulp.com/api/health
```

On the deployment host:

```sh
cd /opt/pulp
git rev-parse HEAD
docker compose ps
docker compose logs --tail=100 app
```

Confirm the expected frontend asset revision, open the planning room, and test microphone permission, a short voice turn, typed continuation, and the optional agent flow. Health alone does not prove model access or conversational quality. Do not use a production planning POST as a harmless health probe: it can publish an active plan.

If a release fails, inspect the Actions log and container logs. Rebuild only after identifying the failed step. To roll back, select a known-good commit and redeploy that exact revision through a reviewed release change; preserve context/data volumes. There is no automatic rollback in the current workflow.

## Local Docker check

From a checkout with `data/` and `.env` prepared:

```sh
docker compose build app
```

Starting the complete stack also binds HTTP/HTTPS ports and uses `DOMAIN` for certificates. For isolated UI regression work, prefer the temporary browser-test server described in [testing](testing.md).

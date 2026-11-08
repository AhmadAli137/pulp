#!/usr/bin/env bash
# One-command bootstrap for a fresh Ubuntu 22.04/24.04 Vultr instance: Docker, firewall, clone, .env, HTTPS, start.
#
# Run as root on the server (the Gemini key is optional; without it the companion runs offline):
#   curl -fsSL https://raw.githubusercontent.com/AhmadAli137/pulp/master/deploy/vultr-setup.sh \
#     | GEMINI_API_KEY=AQ.xxxx bash
#
# No domain needed: DOMAIN defaults to <public-ip>.sslip.io, a free hostname that resolves to this server, and Caddy
# obtains a Let's Encrypt certificate for it. Browsers only allow the microphone on HTTPS, so this matters for voice.
# Pass DOMAIN=yourdomain.tld once you point an A record at the server.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/AhmadAli137/pulp.git}"
APP_DIR="${APP_DIR:-/opt/pulp}"
PUBLIC_IP="$(curl -4fsSL https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
DOMAIN="${DOMAIN:-${PUBLIC_IP}.sslip.io}"
GEMINI_API_KEY="${GEMINI_API_KEY:-}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-3.5-flash}"

echo "==> Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "==> Firewall: allow SSH, HTTP, HTTPS"
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null || true
  ufw allow 80/tcp >/dev/null || true
  ufw allow 443/tcp >/dev/null || true
  ufw allow 443/udp >/dev/null || true
  ufw --force enable >/dev/null || true
fi

echo "==> Cloning repository into ${APP_DIR} (the summary CSVs are in the repo)"
if [ -d "${APP_DIR}/.git" ]; then
  git -C "${APP_DIR}" pull --ff-only
else
  git clone "${REPO_URL}" "${APP_DIR}"
fi

if [ ! -f "${APP_DIR}/.env" ]; then
  echo "==> Writing ${APP_DIR}/.env"
  cat > "${APP_DIR}/.env" <<EOF
DOMAIN=${DOMAIN}
GEMINI_API_KEY=${GEMINI_API_KEY}
GEMINI_MODEL=${GEMINI_MODEL}
GEMINI_LIVE_MODEL=gemini-3.8-live
GEMINI_LIVE_API_VERSION=v1alpha
AI_PROVIDER=auto
EOF
  chmod 600 "${APP_DIR}/.env"
else
  echo "==> Keeping existing ${APP_DIR}/.env"
fi

echo "==> Building and starting the stack for https://${DOMAIN}"
cd "${APP_DIR}"
DOMAIN="${DOMAIN}" docker compose up -d --build --remove-orphans

echo "==> Waiting for the app to report healthy"
for i in $(seq 1 40); do
  if docker compose exec -T app python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/api/health',timeout=3)" 2>/dev/null; then
    echo "healthy"; break
  fi
  sleep 5
done

cat <<EOF

PULP is up:  https://${DOMAIN}
  API health: https://${DOMAIN}/api/health
  Edit ${APP_DIR}/.env to change keys, then: cd ${APP_DIR} && DOMAIN=${DOMAIN} docker compose up -d --build
  Redeploy on every push: add GitHub secrets VULTR_HOST=${PUBLIC_IP}, VULTR_USER=root, VULTR_SSH_KEY (private key)
  and the repository variable DEPLOY_ENABLED=true.
EOF

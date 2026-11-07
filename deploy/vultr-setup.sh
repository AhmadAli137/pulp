#!/usr/bin/env bash
# One-time bootstrap for a fresh Ubuntu 22.04/24.04 Vultr instance.
# Run as root on the server:
#   curl -fsSL https://raw.githubusercontent.com/AhmadAli137/pulp/master/deploy/vultr-setup.sh | DOMAIN=yourdomain.tld bash
# Then copy the data and .env from your laptop (see deploy/upload-data.sh) and the GitHub Actions workflow
# redeploys on every push to master.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/AhmadAli137/pulp.git}"
APP_DIR="${APP_DIR:-/opt/pulp}"
DOMAIN="${DOMAIN:-}"

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

echo "==> Cloning repository into ${APP_DIR}"
if [ -d "${APP_DIR}/.git" ]; then
  git -C "${APP_DIR}" pull --ff-only
else
  git clone "${REPO_URL}" "${APP_DIR}"
fi
mkdir -p "${APP_DIR}/data"

if [ ! -f "${APP_DIR}/.env" ]; then
  echo "==> Writing ${APP_DIR}/.env (edit it to add GEMINI_API_KEY)"
  cat > "${APP_DIR}/.env" <<EOF
DOMAIN=${DOMAIN}
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
EOF
fi

cat <<EOF

Bootstrap done. Next steps:
  1. From your laptop, upload the Tangerine CSVs and your .env:
       bash deploy/upload-data.sh root@<server-ip>
  2. Point DNS at this server (GoDaddy: A record @ -> <server-ip>, CNAME www -> @).
  3. Start the stack on the server:
       cd ${APP_DIR} && DOMAIN=${DOMAIN:-yourdomain.tld} docker compose up -d --build
  4. Add the GitHub secrets VULTR_HOST, VULTR_USER, VULTR_SSH_KEY so pushes to master redeploy.
EOF

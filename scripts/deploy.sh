#!/bin/bash
set -e

DEPLOY_PATH="${DEPLOY_PATH:-/opt/planning}"
VERSION="$1"

if [ -z "$VERSION" ]; then
  echo "Usage: deploy.sh <version>"
  exit 1
fi

echo "Deploying v${VERSION}..."

cd "$DEPLOY_PATH/releases"

# 1. Telecharger la release depuis le tag GitHub
curl -L -o "planningcenter-${VERSION}.tar.gz" \
  "https://github.com/iccbretagne/planningcenter/archive/refs/tags/v${VERSION}.tar.gz"

# 2. Decompresser
tar xzf "planningcenter-${VERSION}.tar.gz"
rm "planningcenter-${VERSION}.tar.gz"

# 3. Lier le fichier .env
ln -sf "$DEPLOY_PATH/shared/.env" "$DEPLOY_PATH/releases/planningcenter-${VERSION}/.env"

# 4. Installer les dependances et construire
cd "$DEPLOY_PATH/releases/planningcenter-${VERSION}"
npm install --production=false
npx prisma migrate deploy
npm run build

# 5. Activer la release (basculer le symlink)
ln -sfn "$DEPLOY_PATH/releases/planningcenter-${VERSION}" "$DEPLOY_PATH/current"

# 6. Redemarrer le service
sudo systemctl restart planning

# 7. Nettoyage : garder les 3 dernieres releases
cd "$DEPLOY_PATH/releases"
ls -1dt planningcenter-*/ | tail -n +4 | xargs rm -rf || true

echo "Deploy v${VERSION} OK"

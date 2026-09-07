#!/usr/bin/env bash
# Cliquet chantier 1 (docs/roadmap-modularite.md) : le nombre de route handlers
# qui importent Prisma directement ne doit jamais remonter. Chaque route migree
# vers un service de module (chantier 2) fait baisser le seuil dans le meme
# commit — le seuil committe EST l'historique du progres.
set -euo pipefail

cd "$(dirname "$0")/.."

BASELINE_FILE="scripts/prisma-boundary-baseline.txt"
BASELINE=$(cat "$BASELINE_FILE")
CURRENT=$(grep -rlE 'from "@/lib/prisma"' src/app --include=route.ts | wc -l | tr -d ' ')

if [ "$CURRENT" -gt "$BASELINE" ]; then
  echo "::error::$CURRENT route handlers importent Prisma directement (seuil: $BASELINE)."
  echo "Nouvelle(s) route(s) important Prisma directement — deplacer la logique metier"
  echo "vers un service de module (src/modules/X/services/), voir docs/roadmap-modularite.md."
  echo "Fichiers concernes :"
  grep -rlE 'from "@/lib/prisma"' src/app --include=route.ts
  exit 1
fi

if [ "$CURRENT" -lt "$BASELINE" ]; then
  echo "::error::$CURRENT route handlers importent Prisma directement, seuil a $BASELINE."
  echo "Baisse le seuil dans $BASELINE_FILE pour verrouiller le progres : echo $CURRENT > $BASELINE_FILE"
  exit 1
fi

echo "OK: $CURRENT route handlers important Prisma directement (seuil: $BASELINE)."

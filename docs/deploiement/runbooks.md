# Runbooks manuels

Opérations **ponctuelles**, jamais lancées par la CI, `prisma migrate deploy` ni le déploiement :
elles se jouent à la main, dans l'ordre indiqué, avec leur retour arrière.

## Index

| Runbook | Quand | Où |
|---|---|---|
| Réécriture des adresses mémorisées (spec 092, lot 4) | Après le déploiement de la version qui change les adresses d'écran | [ci-dessous](#bascule-des-adresses-par-espace-spec-092-lot-4) |
| Restaurer une sauvegarde de la base | Incident de données | [exploitation.md](exploitation.md#procédure-de-restauration) |
| Revenir à la release précédente | Régression après déploiement | [README.md](README.md#retour-arrière-rollback) |
| Migration v0.19.x → v1.0.0 | Mise à niveau d'une très ancienne instance (historique) | [migration-v1.0.md](../migration-v1.0.md) |
| Jeu de données de formation sur la recette | Session de formation | [staging.md](../staging.md#jeu-de-données-de-formation) |
| Sauvegarde, purge et synchronisation S3 | Maintenance des buckets | [exploitation.md](exploitation.md#scripts-de-maintenance-s3) |
| Mettre à jour les captures du guide | Évolution de l'interface | [exploitation.md](exploitation.md#captures-du-guide-utilisateur) |
| Campagne de collecte F9 2026 | Bilan annuel (échéances décembre 2026) | [campagnes-f9-2026.md](../campagnes-f9-2026.md) |

Règle commune : **sauvegarder la base avant** (`sudo systemctl start koinonia-backup.service`,
voir [Sauvegardes](exploitation.md#sauvegardes-de-la-base-de-données)), jouer l'opération à blanc
quand le script le permet, et ne jamais l'enchaîner pendant un événement en direct.


## Bascule des adresses par espace (spec 092, lot 4)

Le lot 4 change l'adresse de la plupart des écrans connectés (`/events` → `/evenements`,
`/accounting/requests` → `/finances/demandes`, `/admin/churches` → `/plateforme/eglises`…). Les
anciennes adresses restent servies par une **redirection temporaire 307** du proxy (table fixe
`src/lib/legacy-paths.ts`, `GET`/`HEAD` seulement, requête conservée, jamais vers une autre
origine, jamais mise en cache). Aucune migration de schéma ; les liens déjà enregistrés en base
(notifications, messages système, fiches de l'assistant) sont réécrits par un **script manuel**.
Les liens publics (billets, réservations, partages média, formulaires publics, `/donner`…) et les
sites d'événement ne changent pas.

**Ne jamais basculer pendant un événement** : les écrans hors ligne de la billetterie
(`/evenements/billetterie/<id>/controle` et `…/restauration`, ex-`/billetterie/…`) changent
d'adresse. Un poste resté ouvert sur l'ancienne adresse garde sa file locale, mais doit être
rechargé une fois en ligne (le service worker passe à `koinonia-v7` et ne met en cache aucune
redirection). Choisir une fenêtre sans événement de billetterie ouvert ce jour-là.

1. **Recette d'abord** : déployer sur l'environnement de recette (`Deploy Staging`), parcourir
   les anciens favoris de chaque rôle (redirection vers la nouvelle adresse), un écran hors ligne
   de billetterie, et un module coupé (`ENABLED_MODULES`) : 404 à l'ancienne comme à la nouvelle
   adresse.
2. **Sauvegarde** de la base (procédure habituelle, ci-dessus).
3. **Déployer** la version (pipeline habituel).
4. **Script, à blanc** — rien n'est écrit, il compte les valeurs à changer et liste les réponses
   de l'assistant qui citent une ancienne adresse (à relire à la main) :
   ```bash
   cd /opt/koinonia/current
   sudo -u koinonia node --env-file=/opt/koinonia/shared/.env dist/092-rewrite-stored-paths.mjs \
     --origin "$APP_URL" --backup-dir /opt/koinonia/shared/backups-092
   ```
   Le paquet déployé ne contient ni `scripts/` ni `tsx` : le script est compilé par
   `npm run build:scripts` (enchaîné par `npm run build`, comme le worker) en un fichier unique
   `dist/092-rewrite-stored-paths.mjs`. La sauvegarde va dans `shared/`, qui survit au
   changement de release (retour arrière compris).
5. **Script, pour de bon** (sauvegarde JSON des valeurs d'avant dans `backups-092/`, lots de 500,
   chaque lot dans une transaction, écriture seulement si la valeur n'a pas changé depuis la
   lecture ; un second passage ne trouve plus rien) :
   ```bash
   sudo -u koinonia node --env-file=/opt/koinonia/shared/.env dist/092-rewrite-stored-paths.mjs \
     --origin "$APP_URL" --backup-dir /opt/koinonia/shared/backups-092 --apply
   ```
   Le script n'est **jamais** lancé par la CI, `prisma migrate deploy` ni le déploiement.
6. **Vérifier** : un second essai à blanc annonce 0 partout ; ouvrir une notification ancienne.
7. **Réponses de l'assistant signalées** : la liste des réponses qui citent une ancienne adresse
   (le script ne les modifie jamais) est transmise à l'Admin de l'église et au Super Admin, qui
   les relisent ; le Super Admin les corrige dans `/admin/assistant` (base d'instance).

**Retour arrière** :

- Code : repointer `current` vers la release précédente (section [Rollback](README.md#retour-arrière-rollback)). Les
  anciennes adresses redeviennent les vraies ; les nouvelles, inconnues de l'ancienne version,
  répondent 404.
- Données, si le script a été appliqué : restaurer **avant** de repointer le code, depuis la
  sauvegarde qu'il a écrite (valeurs exactes d'avant) :
  ```bash
  cd /opt/koinonia/current   # la release qui a appliqué le script, avant de repointer
  sudo -u koinonia node --env-file=/opt/koinonia/shared/.env dist/092-rewrite-stored-paths.mjs \
    --restore /opt/koinonia/shared/backups-092/<fichier>.json --apply
  ```
  À défaut de sauvegarde, `--reverse --apply` recalcule les anciennes adresses depuis la table
  (les préfixes d'aide élargis de l'assistant ne retrouvent pas toujours leur forme d'origine).
- La table de redirection est temporaire : elle sera retirée au lot 5, une fois les journaux sans
  hit sur les anciennes adresses.


## Ajouter un runbook

Un runbook manuel est un script `scripts/NNN-….ts` compilé par `npm run build:scripts` en
`dist/NNN-….mjs` (le paquet déployé ne contient ni `scripts/` ni `tsx`), avec : essai à blanc par
défaut, `--apply` explicite, sauvegarde des valeurs d'avant, idempotence et retour arrière. Le
décrire ici (index + procédure) dans la même PR.

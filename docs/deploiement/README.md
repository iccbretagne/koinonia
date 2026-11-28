# Guide de déploiement

Parcours de l'**opérateur** : installer un serveur Koinonia, publier une version, la déployer,
revenir en arrière, exploiter l'instance au quotidien. Pour travailler sur le code, voir
[CONTRIBUTING.md](../../CONTRIBUTING.md).

## Sommaire

- [Où trouver quoi](#où-trouver-quoi)
- [Vue d'ensemble](#vue-densemble)
- [Première installation](#première-installation)
- [Publier une version (release courante)](#publier-une-version-release-courante)
- [Déployer en recette](#déployer-en-recette)
- [Redéployer une version existante](#redéployer-une-version-existante)
- [Retour arrière (rollback)](#retour-arrière-rollback)
- [Opérations ponctuelles (runbooks)](#opérations-ponctuelles-runbooks)
- [Checklist de mise en production](#checklist-de-mise-en-production)
- [Dépannage](#dépannage)

## Où trouver quoi

| Besoin | Document |
|---|---|
| Installer le système, la base, systemd, Traefik | [serveur.md](serveur.md) |
| Variables d'environnement, SMTP, S3, modules, sites, CSP | [configuration.md](configuration.md) |
| Workflows GitHub, secrets, accès SSH de déploiement | [ci-cd.md](ci-cd.md) |
| Cron, worker audio, sauvegardes et restauration, scripts S3 | [exploitation.md](exploitation.md) |
| Opérations manuelles ponctuelles | [runbooks.md](runbooks.md) |
| Environnement de recette (VM, secrets, formation) | [../staging.md](../staging.md) |
| Poste de développement | [../dev-onboarding.md](../dev-onboarding.md) |
| Sécurité de l'infrastructure : exceptions, dette | [../security-exceptions.md](../security-exceptions.md), [../todo-separation-comptes-deploiement.md](../todo-separation-comptes-deploiement.md) |

## Vue d'ensemble

```
        branche (feat/…, fix/…)  ──▶  PR  ──▶  CI (typecheck, lint, tests, build…)  ──▶  main
                 │                                                                       │
                 │ Deploy Staging (manuel, n'importe quelle branche)                     │ PR « chore: release vX.Y.Z »
                 ▼                                                                       ▼
          VM de recette                                              Release (manuel) ──▶ tag vX.Y.Z + GitHub Release
                                                                                         │
                                                                                         ▼
                                                                  CI du tag : artefact koinonia-X.Y.Z
                                                                                         │
                                                                                         ▼
                                                                  Deploy ──▶ serveur de production
```

- **Un artefact, construit une seule fois** par la CI sur le tag, est promu tel quel en production.
  Aucune compilation sur le serveur.
- **La production exige une CI verte** ; la recette non (elle valide du travail en cours).
- Le serveur garde les **3 dernières releases** dans `/opt/koinonia/releases/` ; `current` pointe
  sur la release active.
- Le détail des workflows est dans [ci-cd.md](ci-cd.md).

| | Développement | Recette | Production |
|---|---|---|---|
| Machine | poste du contributeur (Docker) | VM dédiée | serveur dédié |
| Déploiement | `npm run dev:up` | workflow **Deploy Staging**, manuel | workflow **Deploy**, après un tag `v*` |
| Environnement GitHub | — | `staging` | `release` (tag) puis `production` (déploiement) |
| Connexion | comptes de test (`AUTH_DEV_LOGIN`) | Google OAuth | Google OAuth |
| Données | jeu fictif | copie anonymisée / formation | réelles |

## Première installation

À faire une fois par serveur (production ou recette ; la recette ajoute des garde-fous, voir
[staging.md](../staging.md)).

1. **Serveur** : Debian 11+/Ubuntu 22.04+, Node.js 22, MariaDB 10.11+, Traefik. Créer
   l'utilisateur `koinonia` et les dossiers `releases/` et `shared/` →
   [serveur.md](serveur.md#prérequis).
2. **Base de données** : créer la base et l'utilisateur dédié →
   [serveur.md § Base de données](serveur.md#base-de-données).
3. **Configuration** : écrire `/opt/koinonia/shared/.env` (secrets générés avec
   `openssl rand -base64 32`) → [configuration.md](configuration.md). Minimum : `DATABASE_URL`,
   `AUTH_*`, `GOOGLE_*`, `SUPER_ADMIN_EMAILS`, `CRON_SECRET`, `TURNSTILE_*`.
4. **Service** : unité systemd `koinonia`, durcissement →
   [serveur.md § Service systemd](serveur.md#service-systemd) ; reverse proxy Traefik, TLS et HSTS →
   [serveur.md § Traefik](serveur.md#configuration-traefik).
5. **OAuth Google** : ajouter l'URI de redirection
   `https://<domaine>/api/auth/callback/google` →
   [serveur.md](serveur.md#oauth-google-en-production).
6. **Accès de déploiement** : clé SSH dédiée, `sudoers`, secrets GitHub de l'environnement
   (`DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PATH`) →
   [ci-cd.md](ci-cd.md#accès-de-déploiement--serveur-et-secrets-github).
7. **Premier déploiement** : lancer le workflow **Deploy** sur une version déjà taguée (voir
   [Redéployer une version existante](#redéployer-une-version-existante)) ; il applique les
   migrations et démarre le service. À défaut de release déployée, les migrations s'appliquent à la
   main depuis une release extraite :
   ```bash
   cd /opt/koinonia/current
   ./node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma
   ```
   Ne jamais charger le jeu de démonstration (`db:seed`) en production.
8. **Services complémentaires** : timer cron (obligatoire : sans lui, aucune tâche planifiée) et
   timer de sauvegarde → [exploitation.md](exploitation.md) ; worker audio si le module `audio` est
   actif ; stockage S3 → [configuration.md](configuration.md#stockage-s3).
9. **Vérifier** : `curl https://<domaine>/api/health`, connexion d'un Super Admin
   (`SUPER_ADMIN_EMAILS`), puis **retirer `SUPER_ADMIN_EMAILS`** une fois l'onboarding initial
   terminé et redémarrer.

## Publier une version (release courante)

Prérequis : le secret `RELEASE_TOKEN` du dépôt et, recommandé, des *Required reviewers* sur les
environnements `release` et `production` ([ci-cd.md](ci-cd.md#garanties)).

1. **Valider sur la recette** (recommandé) : [Déployer en recette](#déployer-en-recette) la branche
   ou `main`, puis recetter.
2. **Préparer la release** sur une branche `chore/release-vX.Y.Z` (jamais directement sur `main`) :
   - `package.json` → `"version": "X.Y.Z"` ;
   - `CHANGELOG.md` → nouvelle section dont le titre commence par `## [vX.Y.Z]` (le workflow la
     cherche à cette forme exacte, et s'en sert comme notes de la GitHub Release) ;
   - commit `chore: release vX.Y.Z (#N)`, PR vers `main`, CI verte, merge.
3. **Attendre la CI de `main`** sur le commit de merge : le workflow Release la réclame verte
   (il attend jusqu'à 20 minutes qu'elle se termine).
4. **Lancer la release** : GitHub → *Actions* → **Release** → *Run workflow* (branche `main`) →
   version `X.Y.Z` (sans le `v`). Le workflow vérifie que `package.json` vaut `X.Y.Z`, que le
   CHANGELOG a sa section et que le tag n'existe pas, puis pousse le tag `vX.Y.Z` et crée la
   GitHub Release. Si l'environnement `release` exige une approbation, un relecteur la donne.
5. **La suite est automatique** : la CI du tag construit l'artefact, puis **Deploy** le promeut en
   production (approbation de l'environnement `production` s'il en a une). Suivre dans l'onglet
   *Actions*.
6. **Vérifier** : version dans le pied de page de l'application, `GET /api/health`, `sudo
   journalctl -u koinonia -n 50 --no-pager`. Si la version change des écrans ou des adresses,
   consulter les [runbooks](runbooks.md) et le CHANGELOG pour les opérations manuelles associées.

Sans le secret `RELEASE_TOKEN`, on peut tagger à la main — `git tag -a vX.Y.Z -m vX.Y.Z && git push
origin vX.Y.Z`, puis `gh release create vX.Y.Z --title vX.Y.Z --notes-file …` — le reste est
identique.

## Déployer en recette

GitHub → *Actions* → **Deploy Staging** → *Run workflow* → choisir la **branche** (ou le tag) →
champ `note` facultatif. Le workflow construit l'artefact depuis cette ref (version
`<package.json>-<sha court>`) puis le déploie sur la VM de recette. Pas de CI exigée.
Mise en place de la VM, garde-fous et jeu de données de formation : [staging.md](../staging.md).

## Redéployer une version existante

GitHub → *Actions* → **Deploy** → *Run workflow* → version `X.Y.Z`. Rien n'est recompilé : le
workflow retrouve le run CI **réussi** du tag `vX.Y.Z`, vérifie que le tag pointe sur le commit validé
et promeut l'artefact de ce run (l'artefact d'un run CI n'est conservé que **14 jours** ; au-delà, il faut
relancer la CI du tag).

## Retour arrière (rollback)

Deux voies, de la plus rapide à la plus propre :

**1. Repointer sur la release précédente** (serveur, quelques secondes) — possible tant qu'elle est
encore dans `releases/` (3 conservées) :

```bash
ls /opt/koinonia/releases/
ln -sfn /opt/koinonia/releases/koinonia-VERSION_PRECEDENTE /opt/koinonia/current
sudo systemctl restart koinonia
sudo systemctl restart koinonia-audio-worker   # si le worker audio est installé
```

**2. Redéployer** la version précédente par le workflow **Deploy** (voir ci-dessus).

À savoir avant de revenir en arrière :

- **Les migrations ne se défont pas.** `prisma migrate deploy` a déjà modifié le schéma ; l'ancien
  code doit être compatible avec le nouveau schéma, sinon restaurer la sauvegarde d'avant
  déploiement ([exploitation.md § Restauration](exploitation.md#procédure-de-restauration)) —
  ce qui perd les données écrites depuis.
- **Une opération manuelle déjà appliquée** (réécriture de données, voir [runbooks](runbooks.md))
  se défait **avant** de repointer le code, avec la procédure de retour arrière du runbook.
- Faire une sauvegarde juste avant toute release qui contient une migration :
  `sudo systemctl start koinonia-backup.service`.

## Opérations ponctuelles (runbooks)

Index complet et procédures : [runbooks.md](runbooks.md). Actuellement : réécriture des adresses
mémorisées après la bascule de navigation (spec 092, `node --env-file=… dist/092-rewrite-stored-paths.mjs`),
restauration de sauvegarde, jeu de données de formation, maintenance S3.

## Checklist de mise en production

- [ ] `shared/.env` complet ([configuration.md](configuration.md)) : `AUTH_SECRET` et `CRON_SECRET` générés avec `openssl rand -base64 32`, `AUTH_TRUST_HOST=true`, `AUTH_URL` en HTTPS
- [ ] Base de données créée avec un utilisateur dédié ; migrations appliquées par le pipeline
- [ ] Service `koinonia` actif et activé au démarrage ; `HOSTNAME=127.0.0.1` (vérifier avec `ss -ltnp`)
- [ ] Traefik : certificat TLS, en-têtes de sécurité, aucun `forwardedHeaders` permissif
- [ ] URI de redirection Google OAuth ajoutée
- [ ] Timer `koinonia-cron.timer` actif (appel de `/api/cron` toutes les 5 minutes)
- [ ] SMTP configuré (rappels et notifications par email)
- [ ] Sauvegardes : variables `BACKUP_S3_*`, timer `koinonia-backup.timer`, sauvegarde manuelle testée **et restauration testée sur un environnement de test**
- [ ] Médias : variables `MEDIA_S3_*` ; diagnostic S3 validé (`npx tsx prisma/scripts/debug-s3.ts`, en local)
- [ ] Fichiers sans S3 : `FILE_STORAGE_DIR` hors du dossier de la release
- [ ] Module audio : `ffmpeg`/`ffprobe` installés, unité `koinonia-audio-worker`, `AUDIO_CACHE_*` dimensionnés
- [ ] Turnstile et VAPID configurés (formulaires publics, notifications natives)
- [ ] `SUPER_ADMIN_EMAILS` retiré après l'onboarding initial
- [ ] Secrets GitHub de l'environnement `production` renseignés ; relecteurs requis sur `release` et `production`
- [ ] Accès HTTPS fonctionnel, `GET /api/health` répond

## Dépannage

| Symptôme | Cause probable | Que faire |
|---|---|---|
| Release : « Une release se lance depuis main » | Workflow lancé depuis une autre branche | Relancer en choisissant `main` |
| Release : « package.json sur main est en X » | PR de release non mergée ou mauvaise version saisie | Merger la PR `chore: release`, ressaisir la bonne version |
| Release : « CHANGELOG.md n'a pas de section `## [vX.Y.Z]` » | Titre de section absent ou différent | Corriger le CHANGELOG par une PR |
| Release : « Secret RELEASE_TOKEN absent » | Secret du dépôt non défini | [ci-cd.md](ci-cd.md#secret-release_token) |
| Release : « La CI de main a échoué » | Commit de `main` rouge | Corriger `main`, attendre la CI verte |
| Deploy : « Aucun run CI reussi pour le tag » | CI du tag rouge ou non terminée | Voir le run CI du tag ; corriger (nouvelle release) |
| Deploy : « Le tag … ne correspond pas au commit valide » | Tag déplacé après la CI | Ne jamais déplacer un tag ; publier une nouvelle version |
| Deploy : échec SSH/SCP | Secrets de l'environnement, clé non autorisée, pare-feu | [ci-cd.md](ci-cd.md#accès-de-déploiement--serveur-et-secrets-github) |
| Deploy : `prisma migrate deploy` échoue | Base inaccessible, migration en conflit | `journalctl`, `DATABASE_URL` du `shared/.env`, [exploitation.md](exploitation.md#troubleshooting) |
| `sudo: a password is required` pendant le déploiement | `sudoers` incomplet | Autoriser `systemctl restart` du service **et** du worker ([ci-cd.md](ci-cd.md#accès-de-déploiement--serveur-et-secrets-github)) |
| 502 / site injoignable | Service arrêté ou mauvais `PORT` côté Traefik | `systemctl status koinonia`, comparer `PORT` et l'URL du service Traefik |
| Formulaires publics « temporairement indisponibles » | `TURNSTILE_*` absentes | [configuration.md](configuration.md#formulaires-publics-et-liens) |
| Aucun email de rappel / aucune relance | Timer cron inactif ou SMTP absent | `systemctl list-timers koinonia-cron.timer`, `SELECT … FROM cron_task_runs` ([exploitation.md](exploitation.md#cron--tâches-planifiées)) |
| Fichiers déposés disparus après un déploiement | `FILE_STORAGE_DIR` dans la release | Le placer hors de la release ([configuration.md](configuration.md)) |
| Un module répond 404 pour tous | Absent de `ENABLED_MODULES` | [configuration.md](configuration.md#modules-optionnels) |

# Environnement de recette (staging)

Guide de mise en place d'une VM de recette dédiée pour valider un déploiement avant la bascule en production.

## Objectif

L'environnement de recette est une **VM dédiée, distincte du serveur de production**, mais configurée de manière identique (mêmes chemins, même service systemd `koinonia`, même Traefik, même MariaDB). Elle permet de déployer et valider une branche **avant** de la tagger et de la mettre en production.

Flux de travail :

1. On déploie une branche sur la recette **manuellement** (workflow `Deploy Staging`, `workflow_dispatch`)
2. On valide fonctionnellement sur `https://recette.votre-domaine.com`
3. Une fois validé, on tagge (`git tag vX.Y.Z && git push origin vX.Y.Z`)
4. La production se déploie automatiquement via le pipeline habituel (`deploy.yml`, voir [docs/production.md](production.md))

La recette n'intervient jamais dans le pipeline de production : ce sont deux workflows, deux VMs et deux jeux de secrets totalement indépendants.

## Provisionnement de la VM

L'installation de base (utilisateur système, structure Capistrano-like `/opt/koinonia`, service systemd `koinonia`, durcissement, Node.js 22, MariaDB) est **identique** à la production. Suivre intégralement [docs/production.md](production.md) sections "Prérequis" à "Service systemd", puis appliquer uniquement les différences ci-dessous.

### Sous-domaine dédié

Utiliser un sous-domaine distinct, par exemple `recette.votre-domaine.com` :

- Ajouter une entrée DNS `recette.votre-domaine.com` pointant vers l'IP de la VM de recette
- Créer un router Traefik dédié (fichier séparé, ex. `/etc/traefik/dynamic/koinonia-staging.yml`) pointant vers le port local de l'instance de recette :

```yaml
http:
  routers:
    koinonia-staging:
      rule: "Host(`recette.votre-domaine.com`)"
      entryPoints:
        - websecure
      service: koinonia-staging
      tls:
        certResolver: letsencrypt

  services:
    koinonia-staging:
      loadBalancer:
        servers:
          - url: "http://127.0.0.1:3001" # adapter selon PORT dans shared/.env de la recette
```

### `shared/.env` propre à la recette

Ne jamais réutiliser le `.env` de production. Créer un fichier `/opt/koinonia/shared/.env` dédié sur la VM de recette avec :

```bash
DATABASE_URL=mysql://koinonia_staging:MOT_DE_PASSE@localhost:3306/koinonia_staging
AUTH_SECRET=GENERER_AVEC_OPENSSL_DISTINCT_DE_LA_PROD
AUTH_URL=https://recette.votre-domaine.com
AUTH_TRUST_HOST=true
PORT=3001
GOOGLE_CLIENT_ID=votre-google-client-id
GOOGLE_CLIENT_SECRET=votre-google-client-secret
SUPER_ADMIN_EMAILS=admin-test@votre-eglise.com
```

Points d'attention :

- **Base de données dédiée** : `koinonia_staging`, avec un utilisateur MariaDB dédié (`CREATE DATABASE`/`CREATE USER` comme en production, voir section "Base de données" de production.md, en adaptant les noms)
- **`AUTH_SECRET` distinct** de celui de production : `openssl rand -base64 32`
- **`SUPER_ADMIN_EMAILS`** doit pointer vers des adresses de test, pas les vrais super admins de production

### Bucket S3 média séparé

**Ne jamais pointer la recette sur le bucket S3 de production.** Créer un bucket dédié, par exemple `koinonia-media-staging`, avec ses propres credentials S3 :

```bash
MEDIA_S3_ENDPOINT=https://s3.gra.io.cloud.ovh.net
MEDIA_S3_REGION=gra
MEDIA_S3_BUCKET=koinonia-media-staging
MEDIA_S3_ACCESS_KEY_ID=<access-key-media-staging>
MEDIA_S3_SECRET_ACCESS_KEY=<secret-key-media-staging>
```

Si les backups S3 sont activés sur la recette (voir garde-fous ci-dessous), utiliser de même un bucket `koinonia-backups-staging` distinct, avec ses propres credentials.

### URI de redirection Google OAuth

Dans la [console Google Cloud](https://console.cloud.google.com/apis/credentials), ajouter l'URI de redirection de recette en plus de celle de production :

```
https://recette.votre-domaine.com/api/auth/callback/google
```

### Timers cron/backup — garde-fou non négociable

Les timers systemd `koinonia-cron.timer` (rappels email) et `koinonia-backup.timer` (backup BDD) **ne doivent pas être activés tels quels sur la recette**, sous peine de :

- Envoyer de **vrais emails** de rappel de service à de vrais STAR (si la base de recette contient des données réelles restaurées depuis la production)
- **Écraser les backups de production** si le bucket S3 backups n'est pas correctement séparé

Deux options, à choisir selon le besoin :

1. **Ne pas activer les timers** sur la VM de recette (`sudo systemctl disable --now koinonia-cron.timer koinonia-backup.timer` ou simplement ne jamais les créer) — recommandé si la recette sert uniquement à valider un déploiement technique
2. **Rediriger le SMTP vers un catch-all de test** (ex. [Mailtrap](https://mailtrap.io)) dans le `shared/.env` de la recette, si l'on souhaite quand même valider les emails :

```bash
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<user-mailtrap>
SMTP_PASS=<pass-mailtrap>
SMTP_FROM=Koinonia Recette <noreply@recette.votre-domaine.com>
```

Dans tous les cas, le bucket `BACKUP_S3_*` de la recette (si utilisé) doit être distinct de celui de production — jamais de partage.

## Configuration GitHub — Environment `staging`

Le workflow `Deploy Staging` utilise une [GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) nommée `staging` pour injecter les secrets propres à la VM de recette.

1. Aller dans les **Settings** du repository GitHub → **Environments** → **New environment** → nommer `staging`
2. Ajouter les secrets suivants (propres à la VM de recette, distincts des secrets `production`) :

| Secret | Description |
|--------|-------------|
| `DEPLOY_HOST` | Adresse IP ou domaine de la VM de recette |
| `DEPLOY_PORT` | Port SSH de la VM de recette |
| `DEPLOY_USER` | `koinonia` |
| `DEPLOY_SSH_KEY` | Clé privée SSH dédiée à la VM de recette (ne pas réutiliser la clé de production) |
| `DEPLOY_PATH` | `/opt/koinonia` |

3. Optionnel : ajouter des règles de protection sur l'Environment (ex. reviewers requis avant exécution) si l'on souhaite restreindre qui peut déclencher un déploiement de recette

## Déclencher un déploiement recette

1. GitHub → onglet **Actions** → workflow **"Deploy Staging"**
2. **"Run workflow"**
3. Sélectionner la branche (ou le tag) à valider dans le menu "Use workflow from"
4. Renseigner éventuellement le champ `note` (raison du déploiement, libre)
5. **Run workflow**

Le pipeline :

1. Construit l'artefact (`build`) depuis la ref choisie — pas d'exigence de correspondance de version avec `package.json`, la version est calculée automatiquement (`<version-package.json>-<sha-court>`, ex. `1.9.2-abc1234`). Cette version est injectée dans le bundle via `NEXT_PUBLIC_BUILD_VERSION` et **s'affiche dans le footer** : c'est le code réellement déployé qui est identifié, et non le `package.json` de la branche, figé sur la dernière version publiée. En production la variable est absente et `package.json` reprend la main — sa version y correspond au tag déployé.
2. Déploie (`deploy`) sur la VM de recette en utilisant les secrets de l'Environment `staging` : transfert de l'artefact, extraction, assemblage du bundle standalone, migrations Prisma, bascule du symlink `current`, redémarrage du service `koinonia`, nettoyage (3 dernières releases conservées)

### Pourquoi la recette compile, alors que la production promeut l'artefact de la CI

La production ne recompile jamais : `deploy.yml` télécharge l'artefact du run CI du tag déployé
(voir [docs/production.md](production.md)). La recette, elle, **construit son propre artefact**.
Ce n'est pas une incohérence :

- la CI n'empaquette un artefact que **sur un tag `v*`** ; une branche en cours de validation
  n'en a donc aucun à promouvoir ;
- le job `build` de ce workflow n'a **pas** de clé `environment:` — seul le job `deploy` porte
  `environment: staging`. La compilation n'a donc accès à aucun secret de recette (clé SSH,
  empreinte d'hôte, `DEPLOY_HOST`). La propriété recherchée — ne pas compiler dans un contexte
  privilégié — est préservée.

**Le build de recette ne lance ni `typecheck`, ni `lint`, ni les tests.** C'est **volontaire** :
la recette sert à valider un travail en cours, y compris avant que la CI ne soit verte. Exiger
une CI réussie interdirait précisément l'usage auquel elle est destinée.

La contrepartie doit être connue : **on peut déployer en recette du code dont les tests
échouent**. Devant un comportement inattendu sur la recette, vérifier l'état de la CI de la
branche déployée fait partie du diagnostic — l'anomalie peut venir d'une régression que la CI
signalait déjà. La production, elle, reste inaccessible sans CI verte : c'est là qu'est
l'exigence, et elle n'est pas négociable.

## Données de recette

Pour tester dans des conditions réalistes, il est recommandé de restaurer périodiquement un backup de production dans la base `koinonia_staging`, en **anonymisant les données personnelles** (emails des STAR, noms si nécessaire) avant ou après restauration.

La machinerie de backup/restauration S3 (endpoints `/api/admin/backups`, `/api/admin/backups/restore`) est déjà disponible et documentée dans la section ["Procédure de restauration"](production.md#procédure-de-restauration) de `docs/production.md` — s'y référer directement pour la marche à suivre technique, en l'appliquant sur la base et l'environnement de recette.

## Jeu de données de formation

Pour animer une formation auprès des ministres et responsables de département, la recette peut être
régénérée avec la **structure et les comptes réels**, mais un **contenu métier entièrement fabriqué** :
les participants retrouvent leurs ministères, leurs départements et leur propre compte Google, sans
qu'aucune donnée personnelle (membres, familles, demandes d'intégration, comptabilité) ne soit exposée.

### 1. Exporter la configuration depuis la production

Dans l'application : **Administration → Sauvegardes → Exporter la configuration**. Le fichier JSON
obtenu contient la structure, les comptes et leurs rôles. Il contient aussi les fiches membres
réelles — l'étape suivante les ignore volontairement.

### 2. Construire la fixture

```bash
npm run fixture:training -- ~/Downloads/koinonia-config-<date>.json
```

Produit `prisma/fixtures/training-real.json` : églises, ministères, départements, comptes et rôles.
Ce fichier contient les emails des participants — il est **gitignore** et ne doit jamais être commité.

Ce qui est volontairement laissé de côté : les fiches membres, les liaisons membre-compte, et les
adresses de notification (secrétariat, comptabilité) — qu'on ne veut surtout pas voir servir depuis
un environnement de formation.

### 3. Régénérer la base de recette — depuis votre poste, via un tunnel SSH

**Le seed ne peut pas s'exécuter sur la VM de recette.** L'artefact déployé est élagué de ses
devDependencies (`npm prune --omit=dev`) : ni `tsx` ni `@faker-js/faker` n'y survivent, et le tar
exclut explicitement `prisma/scripts`. On exécute donc le seed **depuis un poste de développement**,
où tout est installé, en pointant la base de recette à travers un tunnel SSH — MariaDB y écoute sur
`localhost:3306` et n'est pas joignable autrement.

```bash
# Terminal 1 — ouvrir le tunnel (le laisser tourner)
ssh -N -L 3307:127.0.0.1:3306 <hote-de-recette>

# Terminal 2 — depuis le depot, sur le meme commit que la recette
DATABASE_URL="mysql://koinonia_staging:MOT_DE_PASSE@127.0.0.1:3307/koinonia_staging" \
  npm run db:seed:training
```

Le mot de passe est celui de `DATABASE_URL` dans le `shared/.env` de la recette.

**Ce script vide intégralement la base avant de la régénérer** — comptes et sessions compris, donc
toute personne connectée à la recette est déconnectée. Il affiche la base visée avant de la vider :

```
Cible : 127.0.0.1:3307/koinonia_staging — la base va être VIDÉE puis régénérée.
```

**Lire cette ligne avant de laisser faire.** `import "dotenv/config"` n'écrase pas une variable déjà
posée (vérifié), donc le `DATABASE_URL` de la ligne de commande gagne sur celui du `.env` local — mais
une faute de frappe sur le port renverrait sur la base locale.

Se placer sur le **même commit que la recette** : le client Prisma généré localement doit correspondre
au schéma appliqué sur la VM par `migrate deploy`.

Le seed fabrique membres, plannings, événements, absences, tâches, salles, comptes rendus, discipolat
et demandes sur la structure réelle.

> **Si le seed de formation devient récurrent**, la bonne réponse n'est plus le tunnel mais un bundle :
> `npm run build:worker` bundle déjà le worker audio avec esbuild pour qu'il n'ait besoin ni de `src/`
> ni de `tsx` sur le serveur (ADR-0007). Le même traitement appliqué au seed produirait un
> `dist/seed.mjs` exécutable par `node` sur la VM — `dist/` est déjà embarqué dans l'artefact. Non fait
> ici : cela alourdirait chaque déploiement de recette pour un besoin ponctuel.

### Ce que le jeu de données couvre

| Sujet | Données générées |
|---|---|
| Planning | 15 événements (6 passés, 6 à venir), plannings par département |
| Gestion des STAR | ~200 fiches membres réparties sur tous les départements |
| Connexion STAR / adjoint | chaque compte STAR est lié à une fiche membre ; les départements à plusieurs responsables ont un principal et des adjoints |
| Absences | absences avec backup désigné |
| Tâches | tâches par département, affectées sur les prochains cultes |
| Salles | salle, réservations et main courante |
| Comptes rendus | comptes rendus des cultes passés, avec sections par département |
| Bergers de famille | affectation de berger |

### Limites connues

- L'export de configuration ne porte pas `isDeputy` : la qualité d'adjoint est **reconstruite** (sur un
  département tenu par plusieurs responsables, le premier déclaré est principal, les suivants adjoints).
  Ce n'est pas l'organisation réelle — à ajuster depuis l'application si la formation s'y attarde.
- Les noms d'affichage des comptes sont déduits de l'adresse email : l'export ne porte pas les noms.
  Google renseigne le vrai nom à la première connexion du participant.
- Le seed génère peu d'absences et de demandes (de quoi montrer l'écran, pas de quoi le remplir) ;
  les participants en créent eux-mêmes pendant la formation.

### Après la formation

Redéployer la recette depuis `main` et rejouer le seed habituel, ou restaurer un backup — la base de
formation n'a pas vocation à survivre à la session.

## Garde-fous

> **À respecter systématiquement lors de toute manipulation sur la recette :**
>
> - La recette ne doit **jamais** écrire dans les buckets S3 de production (`koinonia-media`, `koinonia-backups`) — toujours utiliser des buckets `*-staging` distincts
> - La recette ne doit **jamais** envoyer de vrais emails aux STAR — désactiver les timers cron/backup ou rediriger le SMTP vers un catch-all de test (Mailtrap)
> - Tous les secrets (`AUTH_SECRET`, `DEPLOY_SSH_KEY`, credentials S3, `CRON_SECRET`) doivent être **distincts** de ceux de production

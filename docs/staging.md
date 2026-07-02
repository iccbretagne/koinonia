# Environnement de recette (staging)

Guide de mise en place d'une VM de recette dediee pour valider un deploiement avant la bascule en production.

## Objectif

L'environnement de recette est une **VM dediee, distincte du serveur de production**, mais configuree de maniere identique (memes chemins, meme service systemd `koinonia`, meme Traefik, meme MariaDB). Elle permet de deployer et valider une branche **avant** de la tagger et de la mettre en production.

Flux de travail :

1. On deploie une branche sur la recette **manuellement** (workflow `Deploy Staging`, `workflow_dispatch`)
2. On valide fonctionnellement sur `https://recette.votre-domaine.com`
3. Une fois valide, on tagge (`git tag vX.Y.Z && git push origin vX.Y.Z`)
4. La production se deploie automatiquement via le pipeline habituel (`deploy.yml`, voir [docs/production.md](production.md))

La recette n'intervient jamais dans le pipeline de production : ce sont deux workflows, deux VMs et deux jeux de secrets totalement independants.

## Provisionnement de la VM

L'installation de base (utilisateur systeme, structure Capistrano-like `/opt/koinonia`, service systemd `koinonia`, durcissement, Node.js 22, MariaDB) est **identique** a la production. Suivre integralement [docs/production.md](production.md) sections "Prerequis" a "Service systemd", puis appliquer uniquement les differences ci-dessous.

### Sous-domaine dedie

Utiliser un sous-domaine distinct, par exemple `recette.votre-domaine.com` :

- Ajouter une entree DNS `recette.votre-domaine.com` pointant vers l'IP de la VM de recette
- Creer un router Traefik dedie (fichier separe, ex. `/etc/traefik/dynamic/koinonia-staging.yml`) pointant vers le port local de l'instance de recette :

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

### `shared/.env` propre a la recette

Ne jamais reutiliser le `.env` de production. Creer un fichier `/opt/koinonia/shared/.env` dedie sur la VM de recette avec :

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

- **Base de donnees dediee** : `koinonia_staging`, avec un utilisateur MariaDB dedie (`CREATE DATABASE`/`CREATE USER` comme en production, voir section "Base de donnees" de production.md, en adaptant les noms)
- **`AUTH_SECRET` distinct** de celui de production : `openssl rand -base64 32`
- **`SUPER_ADMIN_EMAILS`** doit pointer vers des adresses de test, pas les vrais super admins de production

### Bucket S3 media separe

**Ne jamais pointer la recette sur le bucket S3 de production.** Creer un bucket dedie, par exemple `koinonia-media-staging`, avec ses propres credentials S3 :

```bash
MEDIA_S3_ENDPOINT=https://s3.gra.io.cloud.ovh.net
MEDIA_S3_REGION=gra
MEDIA_S3_BUCKET=koinonia-media-staging
MEDIA_S3_ACCESS_KEY_ID=<access-key-media-staging>
MEDIA_S3_SECRET_ACCESS_KEY=<secret-key-media-staging>
```

Si les backups S3 sont actives sur la recette (voir garde-fous ci-dessous), utiliser de meme un bucket `koinonia-backups-staging` distinct, avec ses propres credentials.

### URI de redirection Google OAuth

Dans la [console Google Cloud](https://console.cloud.google.com/apis/credentials), ajouter l'URI de redirection de recette en plus de celle de production :

```
https://recette.votre-domaine.com/api/auth/callback/google
```

### Timers cron/backup — garde-fou non negociable

Les timers systemd `koinonia-cron.timer` (rappels email) et `koinonia-backup.timer` (backup BDD) **ne doivent pas etre actives tels quels sur la recette**, sous peine de :

- Envoyer de **vrais emails** de rappel de service a de vrais STAR (si la base de recette contient des donnees reelles restaurees depuis la production)
- **Ecraser les backups de production** si le bucket S3 backups n'est pas correctement separe

Deux options, a choisir selon le besoin :

1. **Ne pas activer les timers** sur la VM de recette (`sudo systemctl disable --now koinonia-cron.timer koinonia-backup.timer` ou simplement ne jamais les creer) — recommande si la recette sert uniquement a valider un deploiement technique
2. **Rediriger le SMTP vers un catch-all de test** (ex. [Mailtrap](https://mailtrap.io)) dans le `shared/.env` de la recette, si l'on souhaite quand meme valider les emails :

```bash
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<user-mailtrap>
SMTP_PASS=<pass-mailtrap>
SMTP_FROM=Koinonia Recette <noreply@recette.votre-domaine.com>
```

Dans tous les cas, le bucket `BACKUP_S3_*` de la recette (si utilise) doit etre distinct de celui de production — jamais de partage.

## Configuration GitHub — Environment `staging`

Le workflow `Deploy Staging` utilise une [GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) nommee `staging` pour injecter les secrets propres a la VM de recette.

1. Aller dans les **Settings** du repository GitHub → **Environments** → **New environment** → nommer `staging`
2. Ajouter les secrets suivants (propres a la VM de recette, distincts des secrets `production`) :

| Secret | Description |
|--------|-------------|
| `DEPLOY_HOST` | Adresse IP ou domaine de la VM de recette |
| `DEPLOY_PORT` | Port SSH de la VM de recette |
| `DEPLOY_USER` | `koinonia` |
| `DEPLOY_SSH_KEY` | Cle privee SSH dediee a la VM de recette (ne pas reutiliser la cle de production) |
| `DEPLOY_PATH` | `/opt/koinonia` |

3. Optionnel : ajouter des regles de protection sur l'Environment (ex. reviewers requis avant execution) si l'on souhaite restreindre qui peut declencher un deploiement de recette

## Declencher un deploiement recette

1. GitHub → onglet **Actions** → workflow **"Deploy Staging"**
2. **"Run workflow"**
3. Selectionner la branche (ou le tag) a valider dans le menu "Use workflow from"
4. Renseigner eventuellement le champ `note` (raison du deploiement, libre)
5. **Run workflow**

Le pipeline :

1. Construit l'artefact (`build`) depuis la ref choisie — pas d'exigence de correspondance de version avec `package.json`, la version est calculee automatiquement (`<version-package.json>-<sha-court>`, ex. `1.9.2-abc1234`)
2. Deploie (`deploy`) sur la VM de recette en utilisant les secrets de l'Environment `staging` : transfert de l'artefact, extraction, assemblage du bundle standalone, migrations Prisma, bascule du symlink `current`, redemarrage du service `koinonia`, nettoyage (3 dernieres releases conservees)

## Donnees de recette

Pour tester dans des conditions realistes, il est recommande de restaurer periodiquement un backup de production dans la base `koinonia_staging`, en **anonymisant les donnees personnelles** (emails des STAR, noms si necessaire) avant ou apres restauration.

La machinerie de backup/restauration S3 (endpoints `/api/admin/backups`, `/api/admin/backups/restore`) est deja disponible et documentee dans la section ["Procedure de restauration"](production.md#procedure-de-restauration) de `docs/production.md` — s'y referer directement pour la marche a suivre technique, en l'appliquant sur la base et l'environnement de recette.

## Garde-fous

> **A respecter systematiquement lors de toute manipulation sur la recette :**
>
> - La recette ne doit **jamais** ecrire dans les buckets S3 de production (`koinonia-media`, `koinonia-backups`) — toujours utiliser des buckets `*-staging` distincts
> - La recette ne doit **jamais** envoyer de vrais emails aux STAR — desactiver les timers cron/backup ou rediriger le SMTP vers un catch-all de test (Mailtrap)
> - Tous les secrets (`AUTH_SECRET`, `DEPLOY_SSH_KEY`, credentials S3, `CRON_SECRET`) doivent etre **distincts** de ceux de production

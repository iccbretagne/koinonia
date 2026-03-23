# Deploiement en production

Guide de deploiement de Koinonia sur un serveur Debian avec Traefik, MariaDB et systemd.

## Prerequis

- Debian 11+ (ou Ubuntu 22.04+)
- Node.js 20+ (via [NodeSource](https://github.com/nodesource/distributions))
- MariaDB 10.11+
- Traefik configure avec terminaison TLS (Let's Encrypt)

## Utilisateur systeme

Creer un utilisateur dedie :

```bash
sudo useradd -r -m -d /opt/koinonia -s /bin/bash koinonia
```

## Structure des dossiers

L'application utilise une structure Capistrano-like :

```
/opt/koinonia/
├── current -> releases/koinonia-0.1.0   # symlink vers la release active
├── releases/
│   ├── koinonia-0.1.0/
│   ├── koinonia-0.0.9/
│   └── ...
└── shared/
    └── .env               # variables d'environnement (persistant)
```

Creer la structure :

```bash
sudo -u koinonia mkdir -p /opt/koinonia/{releases,shared}
```

## Variables d'environnement

Creer le fichier `/opt/koinonia/shared/.env` :

```bash
DATABASE_URL=mysql://koinonia:MOT_DE_PASSE@localhost:3306/koinonia
AUTH_SECRET=GENERER_AVEC_OPENSSL
AUTH_URL=https://votre-domaine.com
AUTH_TRUST_HOST=true
PORT=3000
GOOGLE_CLIENT_ID=votre-google-client-id
GOOGLE_CLIENT_SECRET=votre-google-client-secret
SUPER_ADMIN_EMAILS=admin@votre-eglise.com
```

Generer le secret NextAuth :

```bash
openssl rand -base64 32
```

`AUTH_TRUST_HOST=true` est obligatoire derriere un reverse proxy (Traefik).

## Base de donnees

Creer la base et l'utilisateur MariaDB :

```sql
CREATE DATABASE koinonia CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'koinonia'@'localhost' IDENTIFIED BY 'MOT_DE_PASSE';
GRANT ALL PRIVILEGES ON koinonia.* TO 'koinonia'@'localhost';
FLUSH PRIVILEGES;
```

## Deploiement

### Premiere installation

```bash
# 1. Telecharger la release depuis GitHub
cd /opt/koinonia/releases
VERSION=0.1.0
curl -L -o koinonia-${VERSION}.tar.gz \
  https://github.com/iccbretagne/koinonia/archive/refs/tags/v${VERSION}.tar.gz

# 2. Decompresser
tar xzf koinonia-${VERSION}.tar.gz
rm koinonia-${VERSION}.tar.gz

# 3. Lier le fichier .env
ln -s /opt/koinonia/shared/.env /opt/koinonia/releases/koinonia-${VERSION}/.env

# 4. Installer les dependances et construire
cd /opt/koinonia/releases/koinonia-${VERSION}
npm install --production=false
npm run build

# 5. Appliquer le schema
npm run db:push
npm run db:seed    # optionnel : charge les donnees de demo ICC Rennes

# 6. Activer la release
ln -sfn /opt/koinonia/releases/koinonia-${VERSION} /opt/koinonia/current

# 7. Demarrer le service (voir section systemd ci-dessous)
sudo systemctl start koinonia
```

### Mises a jour

```bash
cd /opt/koinonia/releases
VERSION=X.Y.Z
curl -L -o koinonia-${VERSION}.tar.gz \
  https://github.com/iccbretagne/koinonia/archive/refs/tags/v${VERSION}.tar.gz
tar xzf koinonia-${VERSION}.tar.gz
rm koinonia-${VERSION}.tar.gz

ln -s /opt/koinonia/shared/.env /opt/koinonia/releases/koinonia-${VERSION}/.env

cd /opt/koinonia/releases/koinonia-${VERSION}
npm install --production=false
npm run build
npm run db:push

ln -sfn /opt/koinonia/releases/koinonia-${VERSION} /opt/koinonia/current
sudo systemctl restart koinonia
```

## Service systemd

Creer `/etc/systemd/system/koinonia.service` :

```ini
[Unit]
Description=Koinonia
After=network.target mariadb.service

[Service]
Type=simple
User=koinonia
Group=koinonia
WorkingDirectory=/opt/koinonia/current
EnvironmentFile=/opt/koinonia/shared/.env
ExecStart=/usr/bin/node /opt/koinonia/current/node_modules/.bin/next start -p 3000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Activer et demarrer :

```bash
sudo systemctl daemon-reload
sudo systemctl enable koinonia
sudo systemctl start koinonia
```

Commandes utiles :

```bash
sudo systemctl status koinonia    # statut
sudo journalctl -u koinonia -f    # logs en temps reel
```

## Configuration Traefik

Ajouter un fichier de configuration dynamique (ex: `/etc/traefik/dynamic/koinonia.yml`) :

```yaml
http:
  routers:
    koinonia:
      rule: "Host(`votre-domaine.com`)"
      entryPoints:
        - websecure
      service: koinonia
      tls:
        certResolver: letsencrypt

  services:
    koinonia:
      loadBalancer:
        servers:
          - url: "http://127.0.0.1:3000"
```

Traefik gere automatiquement le certificat TLS via Let's Encrypt.

## Rollback

Pour revenir a une release precedente :

```bash
# Lister les releases disponibles
ls /opt/koinonia/releases/

# Repointer le symlink
ln -sfn /opt/koinonia/releases/koinonia-VERSION_PRECEDENTE /opt/koinonia/current

# Redemarrer
sudo systemctl restart koinonia
```

## OAuth Google en production

Dans la [console Google Cloud](https://console.cloud.google.com/apis/credentials), ajouter l'URI de redirection de production :

```
https://votre-domaine.com/api/auth/callback/google
```

## Deploiement automatise (CD)

Le deploiement est automatise via GitHub Actions. Un push de tag `v*` declenche le workflow de deploiement apres validation du CI.

### Prerequis serveur

1. **Cle SSH dediee** : generer une paire Ed25519 pour l'utilisateur `koinonia` :

```bash
sudo -u koinonia ssh-keygen -t ed25519 -C "deploy@koinonia" -f /home/koinonia/.ssh/id_deploy
```

2. **Autoriser la cle** : ajouter la cle publique dans `/home/koinonia/.ssh/authorized_keys` :

```bash
sudo -u koinonia bash -c 'cat /home/koinonia/.ssh/id_deploy.pub >> /home/koinonia/.ssh/authorized_keys'
```

3. **Sudo restreint** : creer `/etc/sudoers.d/koinonia` :

```
koinonia ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart koinonia
```

### GitHub Secrets a configurer

| Secret | Description |
|--------|-------------|
| `DEPLOY_SSH_KEY` | Cle privee Ed25519 (`/home/koinonia/.ssh/id_deploy`) |
| `DEPLOY_HOST` | Adresse IP ou domaine du serveur |
| `DEPLOY_PORT` | Port SSH personnalise |
| `DEPLOY_USER` | `koinonia` |
| `DEPLOY_PATH` | `/opt/koinonia` |

### Fonctionnement

1. Push d'un tag `v*` (ex: `git tag v0.6.0 && git push origin v0.6.0`)
2. Le CI s'execute (typecheck, tests, verification version)
3. Si le CI passe, le workflow deploy se connecte en SSH au serveur
4. Le script telecharge la release, installe les dependances, construit, migre la BDD, bascule le symlink et redemarre le service
5. Les anciennes releases sont nettoyees (3 dernieres conservees)

Un script `scripts/deploy.sh` est egalement disponible pour les deploiements manuels depuis le serveur :

```bash
DEPLOY_PATH=/opt/koinonia bash scripts/deploy.sh 0.6.0
```

## Webcron — rappels de service

La route `POST /api/cron/reminders` envoie les rappels J-3 et J-1 (email + notification in-app). Elle doit être appelée **une fois par jour** par un service externe.

### Variables d'environnement requises

Ajouter dans `shared/.env` :

```bash
CRON_SECRET=GENERER_AVEC_OPENSSL   # openssl rand -base64 32
```

### Option 1 — crontab système (recommandé)

```bash
# Editer la crontab de l'utilisateur koinonia
sudo -u koinonia crontab -e
```

Ajouter la ligne suivante (exécution chaque jour à 7h00) :

```
0 7 * * * curl -s -X POST https://votre-domaine.com/api/cron/reminders \
  -H "Authorization: Bearer VOTRE_CRON_SECRET" \
  >> /opt/koinonia/logs/cron.log 2>&1
```

### Option 2 — service webcron externe

Configurer un service type [cron-job.org](https://cron-job.org) ou EasyCron :

- **URL** : `https://votre-domaine.com/api/cron/reminders`
- **Méthode** : `POST`
- **Header** : `Authorization: Bearer VOTRE_CRON_SECRET`
- **Fréquence** : 1 fois par jour (ex : 7h00)

## Captures du guide utilisateur

Les captures d'ecran de la page `/guide` sont hebergees sur une **release GitHub dediee** (`guide-assets`) et non dans le code source. Elles sont chargees depuis :

```
https://github.com/iccbretagne/koinonia/releases/download/guide-assets/<fichier>.png
```

### Mettre a jour les captures

```bash
# 1. Supprimer l'ancienne release
gh release delete guide-assets --yes

# 2. Recreer la release
gh release create guide-assets --title "Guide - Assets images" --notes "Captures d'ecran pour la page /guide" --latest=false

# 3. Uploader les nouvelles captures
gh release upload guide-assets guide-*.png
```

### Fichiers attendus

| Fichier | Page source |
|---------|-------------|
| `guide-planning-view.png` | `/dashboard?dept=<id>` — grille planning |
| `guide-planning-edit.png` | `/dashboard?dept=<id>` — edition statut |
| `guide-members-list.png` | `/admin/members` — tableau des STAR |
| `guide-members-manage.png` | `/admin/members` — formulaire ajout/edition |
| `guide-events-list.png` | `/events` — liste des evenements |
| `guide-events-manage.png` | `/admin/events` — formulaire evenement |
| `guide-admin-departments.png` | `/admin/departments` — tableau departements |
| `guide-admin-church.png` | `/admin/churches` — parametres eglise |
| `guide-admin-users.png` | `/admin/users` — gestion utilisateurs |

> Les captures doivent etre prises en **1280x800** pour un ratio 16:9 coherent.

## Sauvegardes S3

Koinonia peut sauvegarder automatiquement la base de donnees vers un stockage S3-compatible (AWS S3, MinIO, Scaleway, OVH, Backblaze B2...).

### Configuration

Ajouter les variables suivantes dans `shared/.env` :

```bash
S3_ENDPOINT=https://s3.fr-par.scw.cloud    # endpoint S3-compatible
S3_REGION=fr-par                             # region
S3_BUCKET=koinonia-backups                   # bucket (doit exister)
S3_ACCESS_KEY_ID=SCWXXXXXXXXX                # cle d'acces
S3_SECRET_ACCESS_KEY=xxxxxxxx                # secret
BACKUP_RETENTION_DAYS=30                     # retention en jours (defaut: 30)
```

### Crontab

Ajouter une entree crontab pour un backup quotidien a 2h du matin :

```bash
0 2 * * * curl -sf -X POST https://votre-domaine.com/api/cron/backup \
  -H "Authorization: Bearer $CRON_SECRET" \
  >> /opt/koinonia/logs/backup.log 2>&1
```

### Endpoints

| Methode | URL | Auth | Description |
|---------|-----|------|-------------|
| `POST` | `/api/cron/backup` | Bearer token (`CRON_SECRET`) | Backup automatique + nettoyage retention |
| `GET` | `/api/admin/backups` | Session (SUPER_ADMIN) | Lister les backups disponibles |
| `POST` | `/api/admin/backups` | Session (SUPER_ADMIN) | Declencher un backup manuel |
| `POST` | `/api/admin/backups/restore` | Session (SUPER_ADMIN) | Restaurer un backup (`{"key":"backups/..."}`) |

### Exemples curl

```bash
# Backup manuel
curl -X POST https://votre-domaine.com/api/admin/backups \
  -H "Cookie: authjs.session-token=..."

# Lister les backups
curl https://votre-domaine.com/api/admin/backups \
  -H "Cookie: authjs.session-token=..."

# Restaurer un backup (ATTENTION: operation destructive)
curl -X POST https://votre-domaine.com/api/admin/backups/restore \
  -H "Content-Type: application/json" \
  -H "Cookie: authjs.session-token=..." \
  -d '{"key":"backups/2026-03-22T02-00-00Z/db.sql.gz"}'
```

### Convention de nommage

Les backups sont stockes sous la cle `backups/YYYY-MM-DDTHH-mm-ssZ/db.sql.gz`. Le dump est compresse en gzip.

## Checklist de production

- [ ] Variables d'environnement configurees dans `shared/.env`
- [ ] `AUTH_SECRET` genere avec `openssl rand -base64 32`
- [ ] `CRON_SECRET` genere avec `openssl rand -base64 32`
- [ ] Webcron configure (crontab ou service externe) pour appeler `/api/cron/reminders` quotidiennement
- [ ] Variables S3 configurees pour les backups (optionnel)
- [ ] Crontab backup configure pour appeler `/api/cron/backup` quotidiennement (optionnel)
- [ ] `AUTH_TRUST_HOST=true` present
- [ ] `AUTH_URL` pointe vers le domaine de production (HTTPS)
- [ ] Base de donnees creee avec utilisateur dedie
- [ ] Schema applique (`npm run db:push`)
- [ ] Application construite (`npm run build`)
- [ ] Service systemd actif et active au boot
- [ ] Traefik configure avec certificat TLS
- [ ] URI de redirection Google OAuth ajoutee
- [ ] Acces HTTPS fonctionnel

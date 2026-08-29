# Deploiement en production

Guide de deploiement de Koinonia sur un serveur Debian avec Traefik, MariaDB et systemd.

## Prerequis

- Debian 11+ (ou Ubuntu 22.04+)
- Node.js 22+ (via [NodeSource](https://github.com/nodesource/distributions))
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
├── current -> releases/koinonia-1.0.0   # symlink vers la release active
├── releases/
│   ├── koinonia-1.0.0/
│   ├── koinonia-0.19.7/
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

> **Important** : le deploiement se fait exclusivement via GitHub Actions (artefact pre-compile en CI).
> Aucune compilation ne doit avoir lieu sur le serveur de production.
> Le `workflow_dispatch` permet de re-deployer une version existante en cas d'urgence. Il ne recompile pas : il exige un run CI **reussi** pour le tag `v<version>` demande et promeut l'artefact de ce run. Un tag sans CI verte, ou dont le commit ne correspond pas a celui valide par la CI, est refuse — il n'existe donc aucun chemin de deploiement qui contourne la CI.

### Premiere installation

La premiere release est deployee automatiquement apres le premier push de tag `v*` une fois les secrets GitHub configures (voir section "Deploiement automatise").

Pour initialiser uniquement la base de donnees avant la premiere release :

```bash
# Appliquer les migrations (depuis le repertoire de la release deployee)
cd /opt/koinonia/current
./node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma

# Optionnel : charger les donnees de demo ICC Rennes
# (uniquement en environnement de test, jamais en production)
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
WorkingDirectory=/opt/koinonia/current/.next/standalone
EnvironmentFile=/opt/koinonia/shared/.env
Environment=NODE_ENV=production
Environment=HOSTNAME=0.0.0.0
ExecStart=/usr/bin/node /opt/koinonia/current/.next/standalone/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

> Le build utilise `output: "standalone"`. Le point d'entree est `server.js` dans le repertoire standalone — ne pas utiliser `next start` ni `npm start`.

Activer et demarrer :

```bash
sudo systemctl daemon-reload
sudo systemctl enable koinonia
sudo systemctl start koinonia
```

### Durcissement systemd (recommande)

Ajouter ces directives dans la section `[Service]` pour limiter la surface d'attaque :

```ini
# Isolation reseau et systeme de fichiers
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
NoNewPrivileges=true
ReadWritePaths=/opt/koinonia

# Restrictions noyau
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true

# Restrictions systeme
RestrictSUIDSGID=true
RemoveIPC=true
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
          - url: "http://127.0.0.1:3001"   # adapter selon PORT dans shared/.env
```

Traefik gere automatiquement le certificat TLS via Let's Encrypt.

## Cache disque des renditions audio (ADR-0008)

Le module audio (spec 021 — bibliotheque d'ecoute) sert les renditions MP3 depuis un cache
disque local, alimente au premier acces depuis le stockage S3 media. Sur l'infra actuelle
(Traefik attaque directement le process Node, port 3001), le process Node sert lui-meme ces
fichiers en `Range` HTTP natif — aucune configuration supplementaire n'est necessaire.

```bash
AUDIO_CACHE_DIR=/opt/koinonia/shared/audio-cache   # defaut : <tmpdir>/koinonia-audio-cache
AUDIO_CACHE_MAX_BYTES=5368709120                   # defaut : 5 Go, eviction LRU au-dela
```

Dimensionner `AUDIO_CACHE_MAX_BYTES` selon l'espace disque disponible et le volume de cultes
publies conserves activement — une rendition non consultee depuis longtemps est evincee
automatiquement (LRU), le culte reste disponible, seul le prochain acces redeclenche un
telechargement S3.

### Delegation nginx (X-Accel-Redirect) — annexe optionnelle, non activee

Si un nginx est un jour insere devant Koinonia (aujourd'hui Traefik sert Node directement, voir
ADR-0008), le service peut deleguer la livraison du fichier a nginx via `X-Accel-Redirect`
plutot que de le streamer lui-meme (`sendfile`, moins de charge sur le process Node) :

```bash
AUDIO_XACCEL_LOCATION=/protected/audio
```

Configuration nginx correspondante :

```nginx
location /protected/audio/ {
    internal;                                   # jamais atteint directement par un client
    alias /opt/koinonia/shared/audio-cache/;
}
```

Ne definir `AUDIO_XACCEL_LOCATION` que si ce nginx existe reellement devant Koinonia — sinon les
requetes audio echoueront (le fichier ne sera jamais servi par personne).

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

Le deploiement est automatise via GitHub Actions. Un push de tag `v*` declenche le CI, et le workflow de deploiement ne s'execute que si le CI passe integralement (typecheck, lint, tests). L'application est construite **une seule fois** par le CI (artefact immutable, attache au run CI du tag) puis promue telle quelle par le workflow de deploiement, qui se contente de la transferer sur le serveur : aucune compilation n'a lieu ni au deploiement ni en production.

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
2. Le CI s'execute (typecheck, tests, verification version) et, sur un tag, **empaquette l'artefact de release** puis le publie comme artefact du run
3. Si le CI passe, le workflow deploy **telecharge cet artefact depuis le run CI** — il ne recompile rien et ne fait aucun checkout — puis se connecte en SSH au serveur
4. L'artefact pre-compile est transfere par SCP, extrait, les assets statiques assembles — aucune compilation n'a lieu en production. L'artefact inclut `prisma.config.ts` (requis par Prisma 7 pour la configuration CLI)
5. Les migrations Prisma sont appliquees, le symlink `current` est bascule, le service redemarre
6. Les anciennes releases sont nettoyees (3 dernieres conservees)

## Configuration SMTP

Les emails de rappel (J-3 et J-1 avant un événement) sont envoyés via un serveur SMTP. Ajouter dans `shared/.env` :

```bash
SMTP_HOST=smtp.votre-domaine.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@votre-domaine.com
SMTP_PASS=mot-de-passe
SMTP_FROM=Koinonia <noreply@votre-domaine.com>
```

> **Important** : ne pas mettre de commentaires inline sur ces lignes dans `.env` — systemd inclurait le commentaire dans la valeur.

### Ports courants

| Port | Protocole | `SMTP_SECURE` |
|------|-----------|---------------|
| 587 | STARTTLS (recommandé) | `false` |
| 465 | SSL/TLS natif | `true` |
| 25 | Sans chiffrement (local) | `false` |

### Sans authentification (relais local)

Si vous utilisez un relais SMTP local (ex : Postfix sur le même serveur), laisser `SMTP_USER` et `SMTP_PASS` vides :

```bash
SMTP_HOST=localhost
SMTP_PORT=25
SMTP_SECURE=false
SMTP_FROM=Koinonia <noreply@votre-domaine.com>
```

### Test de la configuration

Déclencher un backup manuel depuis l'interface admin ou appeler directement le cron de rappels après avoir configuré un événement de test.

## Cron — tâches planifiées

La route `POST /api/cron` orchestre toutes les tâches planifiées. Elle doit être appelée **toutes les heures**. Chaque tâche gère sa propre fréquence en interne :

| Tâche | Fréquence effective | Description |
|-------|--------------------|--------------------------------------------|
| Rappels de service | 1 fois/jour par église | Emails + notifications in-app J-3 et J-1 |
| Digest planning | Horaire si changements | Email récapitulatif des modifications au secrétariat |

### Variables d'environnement requises

Ajouter dans `shared/.env` :

```bash
CRON_SECRET=GENERER_AVEC_OPENSSL
```

Générer une valeur sécurisée : `openssl rand -base64 32`

> **Important** : ne pas mettre de commentaire inline sur cette ligne dans `.env` — systemd inclurait le commentaire dans la valeur.

### Option 1 — timer systemd (recommandé)

Plus fiable que crontab : journalisation native, gestion des échecs, exécution rattrapée après un reboot.

**1. Créer le service** `/etc/systemd/system/koinonia-cron.service` :

```ini
[Unit]
Description=Koinonia — tâches cron
After=network-online.target koinonia.service
Wants=network-online.target
Requires=koinonia.service

[Service]
Type=oneshot
User=koinonia
EnvironmentFile=/opt/koinonia/shared/.env
ExecStart=/bin/sh -c 'curl -sf -X POST http://127.0.0.1:${PORT:-3000}/api/cron -H "Authorization: Bearer $CRON_SECRET"'
StandardOutput=journal
StandardError=journal
SyslogIdentifier=koinonia-cron
```

> On appelle `127.0.0.1:$PORT` en local plutôt que le domaine public pour éviter de passer par Traefik/TLS.

**2. Créer le timer** `/etc/systemd/system/koinonia-cron.timer` :

```ini
[Unit]
Description=Tâches cron Koinonia — toutes les heures

[Timer]
OnCalendar=hourly
Persistent=true
RandomizedDelaySec=60

[Install]
WantedBy=timers.target
```

- `Persistent=true` : si le serveur était éteint, la tâche sera exécutée au prochain démarrage.
- `RandomizedDelaySec=60` : délai aléatoire de 0 à 60s pour éviter les pics de charge.

**3. Activer le timer** :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now koinonia-cron.timer
```

**4. Vérifier** :

```bash
# Etat du timer
sudo systemctl status koinonia-cron.timer

# Prochaine exécution
sudo systemctl list-timers koinonia-cron.timer

# Lancer manuellement pour tester
sudo systemctl start koinonia-cron.service

# Consulter les logs
sudo journalctl -u koinonia-cron -n 20
```

> Si vous aviez l'ancien timer `koinonia-reminders.timer`, désactivez-le : `sudo systemctl disable --now koinonia-reminders.timer`

### Option 2 — crontab système

```bash
sudo -u koinonia crontab -e
```

Ajouter la ligne suivante (exécution toutes les heures) :

```
0 * * * * . /opt/koinonia/shared/.env && curl -sf -X POST http://127.0.0.1:${PORT:-3000}/api/cron -H "Authorization: Bearer $CRON_SECRET" >> /opt/koinonia/logs/cron.log 2>&1
```

### Option 3 — service webcron externe

Configurer un service type [cron-job.org](https://cron-job.org) ou EasyCron :

- **URL** : `https://votre-domaine.com/api/cron`
- **Méthode** : `POST`
- **Header** : `Authorization: Bearer VOTRE_CRON_SECRET`
- **Fréquence** : toutes les heures

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

## Stockage S3

Koinonia utilise **deux buckets S3 distincts** avec des credentials séparés :

| Bucket | Usage | Rétention |
|--------|-------|-----------|
| `koinonia-backups` | Sauvegardes BDD (`backups/{timestamp}/`) | `BACKUP_RETENTION_DAYS` (défaut 30j) |
| `koinonia-media` | Photos (`media-events/{id}/photos/`), fichiers (`media-events/{id}/files/`, `media-projects/{id}/`) | indéfinie |

La séparation est obligatoire en production : les buckets ont des règles de lifecycle et des permissions différentes.

### Configuration

Ajouter dans `shared/.env` :

```bash
# ─── Backups BDD ───────────────────────────────────────────────
BACKUP_S3_ENDPOINT=https://s3.gra.io.cloud.ovh.net
BACKUP_S3_REGION=gra
BACKUP_S3_BUCKET=koinonia-backups
BACKUP_S3_ACCESS_KEY_ID=<access-key-backups>
BACKUP_S3_SECRET_ACCESS_KEY=<secret-key-backups>
BACKUP_RETENTION_DAYS=30

# ─── Médias (photos, visuels, vidéos) ─────────────────────────
MEDIA_S3_ENDPOINT=https://s3.gra.io.cloud.ovh.net
MEDIA_S3_REGION=gra
MEDIA_S3_BUCKET=koinonia-media
MEDIA_S3_ACCESS_KEY_ID=<access-key-media>
MEDIA_S3_SECRET_ACCESS_KEY=<secret-key-media>
```

> **Important** : ne pas mettre de commentaires inline sur ces lignes dans `.env` — systemd inclurait le commentaire dans la valeur.

Les variables `MEDIA_S3_*` sont **obligatoires** — aucun fallback sur `BACKUP_S3_*`. Configurer les deux buckets séparément.

### Paramétrage OVH Object Storage

Pour un bucket OVH (Standard à Gravelines) :

1. **Créer deux buckets** dans le Control Panel → Public Cloud → Object Storage
2. **Créer deux utilisateurs S3 dédiés** (un par bucket) : Object Storage → S3 Users → "Créer un utilisateur S3"
   - Le secret n'est affiché **qu'une seule fois** à la création — le noter immédiatement
3. **Assigner les droits** sur chaque bucket : `GetObject`, `PutObject`, `DeleteObject`, `ListBucket`
4. **Garder les buckets privés** — Koinonia génère des URLs signées, aucun accès public nécessaire

**CORS** — nécessaire pour afficher les photos depuis le navigateur :

```json
[{
  "AllowedOrigins": ["https://votre-domaine.com"],
  "AllowedMethods": ["GET"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3600
}]
```

### Sécurité du bucket

- **Chiffrement SSE** : activer AES-256 par défaut sur les deux buckets
- **Versioning** : activer sur le bucket backups (protection contre la corruption)
- **Lifecycle backups** : règle d'expiration sur le préfixe `backups/` uniquement (ne pas appliquer sur `media-*`)
- **Credentials minimum** : chaque utilisateur S3 n'a accès qu'à son propre bucket

### Planification — timer systemd (recommande)

Le backup est declenche via un appel HTTP a l'API Koinonia. Un timer systemd est plus fiable qu'un crontab (journalisation, gestion des echecs, persistance apres reboot).

**1. Creer le service** `/etc/systemd/system/koinonia-backup.service` :

```ini
[Unit]
Description=Koinonia — backup BDD vers S3
After=network-online.target koinonia.service
Wants=network-online.target
Requires=koinonia.service

[Service]
Type=oneshot
User=koinonia
EnvironmentFile=/opt/koinonia/shared/.env
ExecStart=/bin/sh -c 'curl -sf -X POST http://127.0.0.1:${PORT:-3000}/api/cron/backup -H "Authorization: Bearer $CRON_SECRET"'

# Journalisation
StandardOutput=journal
StandardError=journal
SyslogIdentifier=koinonia-backup
```

> On appelle `127.0.0.1:$PORT` en local plutot que le domaine public pour eviter de passer par Traefik/TLS.

**2. Creer le timer** `/etc/systemd/system/koinonia-backup.timer` :

```ini
[Unit]
Description=Backup quotidien Koinonia a 2h00

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
```

- `Persistent=true` : si le serveur etait eteint a 2h00, le backup sera execute au prochain demarrage.
- `RandomizedDelaySec=300` : delai aleatoire de 0 a 5 min pour eviter les pics de charge.

**3. Activer le timer** :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now koinonia-backup.timer
```

**4. Verifier** :

```bash
# Etat du timer
sudo systemctl status koinonia-backup.timer

# Prochaine execution
sudo systemctl list-timers koinonia-backup.timer

# Lancer manuellement pour tester
sudo systemctl start koinonia-backup.service

# Consulter les logs
sudo journalctl -u koinonia-backup -n 20
```

### Alternative — crontab

Si vous preferez crontab :

```bash
sudo -u koinonia crontab -e
```

```
0 2 * * * . /opt/koinonia/shared/.env && curl -sf -X POST http://127.0.0.1:${PORT:-3000}/api/cron/backup \
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

### Convention de nommage

Les backups sont stockes sous la cle `backups/YYYY-MM-DDTHH-mm-ssZ/db.sql.gz`. Le dump est compresse en gzip (mysqldump `--single-transaction --quick --routines --triggers`).

### Procedure de restauration

> **ATTENTION** : la restauration ecrase integralement la base de donnees. Toutes les donnees inserees depuis le backup seront perdues.

#### Prerequis

- Acces SSH au serveur (ou role SUPER_ADMIN dans l'interface)
- `mysqldump` et `mysql` installes sur le serveur
- Acces au bucket S3 configure

#### Obtenir le cookie de session

Les endpoints `/api/admin/backups` et `/api/admin/backups/restore` requièrent une session SUPER_ADMIN. Pour les appeler via curl, récupérez le cookie depuis votre navigateur :

1. Connectez-vous à Koinonia dans votre navigateur
2. Ouvrez les DevTools → Onglet **Application** (Chrome) ou **Stockage** (Firefox)
3. Rubrique **Cookies** → sélectionnez votre domaine
4. Copiez la valeur du cookie :
   - En production (HTTPS) : `__Secure-authjs.session-token`
   - En développement (HTTP) : `authjs.session-token`

Utilisez ce cookie dans vos commandes curl :

```bash
# Production
COOKIE="__Secure-authjs.session-token=VALEUR_COPIEE"

# Développement
COOKIE="authjs.session-token=VALEUR_COPIEE"
```

#### Etape 1 — Identifier le backup a restaurer

**Via l'API** :

```bash
# Lister les backups disponibles (du plus recent au plus ancien)
curl -s https://votre-domaine.com/api/admin/backups \
  -H "Cookie: $COOKIE" | jq '.[] | {key, lastModified, sizeMB: (.sizeBytes/1048576 | round)}'
```

**Via la CLI S3** (si vous avez `aws` ou `mc` configure) :

```bash
aws --endpoint-url https://s3.fr-par.scw.cloud s3 ls s3://koinonia-backups/backups/ --recursive
```

Notez la cle du backup souhaite, par exemple : `backups/2026-03-24T02-00-00Z/db.sql.gz`

#### Etape 2 — Arreter l'application

```bash
sudo systemctl stop koinonia
```

Cela empeche les ecritures en base pendant la restauration.

#### Etape 3 — Creer un backup de securite

Avant de restaurer, sauvegardez l'etat actuel au cas ou :

```bash
sudo -u koinonia bash -c '. /opt/koinonia/shared/.env && \
  MYSQL_PWD=$(echo $DATABASE_URL | sed "s|.*://[^:]*:\([^@]*\)@.*|\1|") \
  mysqldump --single-transaction --quick \
    -u $(echo $DATABASE_URL | sed "s|.*://\([^:]*\):.*|\1|") \
    $(echo $DATABASE_URL | sed "s|.*/||") | gzip > /opt/koinonia/shared/pre-restore-backup.sql.gz'
```

#### Etape 4 — Restaurer

**Option A — Via l'API** (recommande) :

```bash
curl -X POST https://votre-domaine.com/api/admin/backups/restore \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{"key":"backups/2026-03-24T02-00-00Z/db.sql.gz"}'
```

> Note : l'application doit etre demarree pour cette option. Si vous l'avez arretee, redemarrez-la temporairement (`sudo systemctl start koinonia`), lancez la restauration, puis passez a l'etape 5.

**Option B — En ligne de commande** (si l'application est inaccessible) :

```bash
# 1. Telecharger le backup depuis S3
aws --endpoint-url https://s3.fr-par.scw.cloud \
  s3 cp s3://koinonia-backups/backups/2026-03-24T02-00-00Z/db.sql.gz /tmp/restore.sql.gz

# 2. Decompresser et injecter dans MySQL
sudo -u koinonia bash -c '. /opt/koinonia/shared/.env && \
  DB_USER=$(echo $DATABASE_URL | sed "s|.*://\([^:]*\):.*|\1|") && \
  DB_PASS=$(echo $DATABASE_URL | sed "s|.*://[^:]*:\([^@]*\)@.*|\1|") && \
  DB_NAME=$(echo $DATABASE_URL | sed "s|.*/||") && \
  gunzip -c /tmp/restore.sql.gz | MYSQL_PWD=$DB_PASS mysql -u $DB_USER $DB_NAME'

# 3. Nettoyer
rm /tmp/restore.sql.gz
```

**Option C — Avec MinIO Client** (`mc`) :

```bash
# Configurer mc (une seule fois)
mc alias set koinonia https://s3.fr-par.scw.cloud VOTRE_ACCESS_KEY VOTRE_SECRET_KEY

# Telecharger et restaurer
mc cp koinonia/koinonia-backups/backups/2026-03-24T02-00-00Z/db.sql.gz /tmp/restore.sql.gz
# Puis suivre l'etape 2 de l'option B
```

#### Etape 5 — Redemarrer l'application

```bash
sudo systemctl start koinonia
```

#### Etape 6 — Verifier

1. Acceder a l'application et verifier que les donnees sont coherentes
2. Controler les logs :

```bash
sudo journalctl -u koinonia -n 50 --no-pager
```

3. Si la restauration est mauvaise, restaurer le backup de securite de l'etape 3 :

```bash
sudo systemctl stop koinonia
sudo -u koinonia bash -c '. /opt/koinonia/shared/.env && \
  DB_USER=$(echo $DATABASE_URL | sed "s|.*://\([^:]*\):.*|\1|") && \
  DB_PASS=$(echo $DATABASE_URL | sed "s|.*://[^:]*:\([^@]*\)@.*|\1|") && \
  DB_NAME=$(echo $DATABASE_URL | sed "s|.*/||") && \
  gunzip -c /opt/koinonia/shared/pre-restore-backup.sql.gz | MYSQL_PWD=$DB_PASS mysql -u $DB_USER $DB_NAME'
sudo systemctl start koinonia
```

### Troubleshooting

| Symptome | Cause probable | Solution |
|----------|----------------|----------|
| Timer n'execute pas | Timer pas active | `sudo systemctl enable --now koinonia-backup.timer` |
| `curl: (7) Failed to connect` | Koinonia pas demarre | Verifier `systemctl status koinonia` |
| `mysqldump: command not found` | mariadb-client manquant | `sudo apt install mariadb-client` |
| `Access denied for user` | Mot de passe incorrect dans DATABASE_URL | Verifier `/opt/koinonia/shared/.env` |
| Backup vide (0 octets) | Base inaccessible | Verifier `systemctl status mariadb` |
| Restore echoue `ERROR 1049` | Base inexistante | Recreer la base (voir section BDD) |
| S3 `AccessDenied` | Cle S3 invalide ou bucket inexistant | Verifier les variables `BACKUP_S3_*` et creer le bucket |

## Scripts de maintenance S3

Ces scripts s'exécutent **uniquement en local** (jamais sur le serveur — exclus du build via `--exclude='prisma/scripts'` dans le pipeline CI). Ils lisent le `.env` local ou acceptent des credentials en arguments.

```bash
# Prérequis : être dans le répertoire du projet avec le .env rempli
cd /chemin/vers/koinonia
```

### Diagnostic (`debug-s3.ts`)

Teste la connectivité, les droits d'accès et liste un aperçu du bucket.

```bash
# Tester les deux buckets
npx tsx prisma/scripts/debug-s3.ts

# Tester uniquement le bucket média
npx tsx prisma/scripts/debug-s3.ts --media

# Tester uniquement le bucket backups
npx tsx prisma/scripts/debug-s3.ts --backup
```

Vérifie successivement : `HeadBucket` (accès), `ListObjectsV2` (listing), `PutObject` + `GetObject` + `DeleteObject` (lecture/écriture).

### Synchronisation (`sync-s3.ts`)

Copie les objets d'un bucket source vers un bucket destination. Idempotent (compare les ETags).

```bash
# Mediaflow → bucket média Koinonia (raccourci --from-mediaflow)
MEDIAFLOW_S3_ENDPOINT=https://s3.gra.io.cloud.ovh.net \
MEDIAFLOW_S3_BUCKET=mediaflow \
MEDIAFLOW_S3_ACCESS_KEY=xxx \
MEDIAFLOW_S3_SECRET_KEY=yyy \
npx tsx prisma/scripts/sync-s3.ts --from-mediaflow --dry-run

# Exécution réelle, seulement le préfixe media-events/
npx tsx prisma/scripts/sync-s3.ts --from-mediaflow --prefix=media-events/

# Mode générique (source et destination explicites)
SRC_ENDPOINT=... SRC_BUCKET=source SRC_ACCESS_KEY=... SRC_SECRET_KEY=... \
DST_ENDPOINT=... DST_BUCKET=dest   DST_ACCESS_KEY=... DST_SECRET_KEY=... \
npx tsx prisma/scripts/sync-s3.ts [--prefix=...] [--force] [--dry-run]
```

Options : `--prefix=<préfixe>`, `--force` (recopie même si déjà présent), `--concurrency=<n>` (défaut : 8).

### Purge (`purge-s3.ts`)

Supprime des objets S3. **Irréversible** — toujours faire un `--dry-run` d'abord. Bloqué si `NODE_ENV=production`.

```bash
# Aperçu — bucket média du .env
npx tsx prisma/scripts/purge-s3.ts --media --dry-run

# Purger les objets vieux de plus de 180 jours
npx tsx prisma/scripts/purge-s3.ts --media --older-than=180 --dry-run
npx tsx prisma/scripts/purge-s3.ts --media --older-than=180

# Cibler un bucket arbitraire (Mediaflow, migration, etc.)
npx tsx prisma/scripts/purge-s3.ts \
  --endpoint=https://s3.gra.io.cloud.ovh.net \
  --bucket=ancien-bucket \
  --access-key=xxx \
  --secret-key=yyy \
  --region=gra \
  --prefix=media-events/ \
  --dry-run
```

Options : `--prefix=<préfixe>`, `--older-than=<n>` (jours), `--yes` (sans confirmation interactive).

## Worker audio (module `audio`)

Le module de publication audio des cultes traite le rendu (`ffmpeg`) et le sondage
(`ffprobe`) des fichiers déposés dans un **process séparé du serveur web**, pas dans une route
Next.js — en production c'est le bundle `dist/worker.mjs` (en développement, `npm run worker`
exécute les mêmes sources via `tsx`). Voir
[ADR-0007](adr/0007-worker-hors-nextjs-table-jobs.md). Le canal entre l'application et le
worker est uniquement la table `audio_jobs` (`SELECT … FOR UPDATE SKIP LOCKED`), sans broker
externe.

### Dépendance système

`ffmpeg` et `ffprobe` doivent être installés sur le serveur (paquet `ffmpeg` sur Debian/Ubuntu,
qui fournit les deux binaires) :

```bash
sudo apt install ffmpeg
ffmpeg -version && ffprobe -version
```

### Service systemd

Créer `/etc/systemd/system/koinonia-audio-worker.service` :

```ini
[Unit]
Description=Koinonia — worker audio (probe/render)
After=network.target mariadb.service koinonia.service
Requires=koinonia.service

[Service]
Type=simple
User=koinonia
Group=koinonia
WorkingDirectory=/opt/koinonia/current
EnvironmentFile=/opt/koinonia/shared/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/koinonia/current/dist/worker.mjs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

> Le worker est **bundlé par esbuild** au moment du build (`npm run build:worker`, enchaîné
> automatiquement par `npm run build`) en un fichier unique `dist/worker.mjs`. Il ne nécessite
> donc ni `src/` ni `tsx` sur le serveur : seul le `node_modules` de production est requis pour
> ses dépendances externes (`@prisma/adapter-mariadb`, `mariadb`, `@aws-sdk/client-s3`), toutes
> classées en `dependencies` et donc préservées par le `npm prune --omit=dev` du pipeline.

> **Redémarrage** : le worker est une unité distincte du serveur web ; le pipeline de
> déploiement la redémarre automatiquement si elle est installée sur l'hôte. Sur un hôte où
> l'unité n'existe pas encore, le déploiement l'ignore sans échouer.
>
> Un `SIGTERM` reçu en plein rendu remet le job courant en `PENDING` : l'instance qui redémarre
> le reprend aussitôt. Filet de sécurité en cas de mort brutale (OOM, `SIGKILL`) : le bail
> (`leasedUntil`, 5 min, renouvelé chaque minute pendant le traitement) expire et le job est
> repris automatiquement — voir l'amendement « le bail ne tenait pas sa promesse de reprise »
> de [ADR-0007](adr/0007-worker-hors-nextjs-table-jobs.md).

Activer et démarrer :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now koinonia-audio-worker
```

Commandes utiles :

```bash
sudo systemctl status koinonia-audio-worker    # statut
sudo journalctl -u koinonia-audio-worker -f    # logs en temps reel
```

### Lire les logs du worker

Le worker trace chaque transition de job et chaque étape longue (téléchargement S3, mesure
`loudnorm`, encodage ffmpeg, envoi du rendu), avec leur durée. Un culte publié normalement
produit une trace de ce type :

```
[audio-worker] job cm3x… RENDER pris (tentative 1/3)
[audio-worker] rendu seg-1 « Prédication » (culte cm2y…) — début
[audio-worker] rendu seg-1 : source téléchargée (58.2 Mo) en 4.1 s
[audio-worker] rendu seg-1 : mesure loudnorm en 22.8 s (-19.34 LUFS)
[audio-worker] rendu seg-1 : encodage MP3 en 41.2 s (24.7 Mo produits)
[audio-worker] rendu seg-1 : rendu envoyé vers audio-services/…/seg-1.mp3 en 3.3 s
[audio-worker] culte cm2y… : toutes les séquences sont prêtes — passé à PUBLISHED
[audio-worker] job cm3x… RENDER terminé en 1 min 12 s
```

Lignes à surveiller :

| Ligne | Signification |
|---|---|
| `repris après expiration du bail — le worker précédent a été interrompu` | Un worker est mort en plein rendu (redéploiement brutal, OOM). Normal après un `SIGKILL` ; répété, c'est un symptôme. |
| `toujours en cours (N min) — bail prolongé` | Preuve de vie sur un rendu long, une ligne par minute. Son absence pendant un rendu signale un worker figé. |
| `en échec … sera réessayé` | Échec transitoire, nouvelle tentative automatique (3 au total). |
| `en échec DÉFINITIF après 3 tentatives` | Le job ne repartira pas seul ; l'écran de la régie affiche le bandeau rouge correspondant. |
| `N séquence(s) encore à rendre` | Publication en attente d'autres jobs — normal tant que d'autres rendus tournent. |

> **Silence prolongé** : le worker ne journalise rien quand il n'a rien à faire (un sondage
> toutes les 5 s remplirait le journal). Un worker actif mais silencieux signifie donc « aucun
> job en attente ». Si l'écran de la régie affiche « rendu en cours » alors que le journal est
> muet, l'incohérence est réelle et mérite d'inspecter la table `audio_jobs`.

## Mise à jour depuis une version précédente

Pour mettre à jour une instance existante, consulter le guide de migration correspondant :

- [Migration v0.19.x → v1.0.0](migration-v1.0.md)

## Environnement de recette

Avant de tagger une version et de la deployer en production, il est recommande de la valider sur un **environnement de recette dedie** (VM separee, identique a la production). Le deploiement s'y fait manuellement via le workflow GitHub Actions `Deploy Staging` (`workflow_dispatch`), independamment du pipeline de production decrit ci-dessus.

Voir [docs/staging.md](staging.md) pour la mise en place complete (provisionnement, secrets, declenchement).

## Checklist de production

- [ ] Variables d'environnement configurees dans `shared/.env`
- [ ] `AUTH_SECRET` genere avec `openssl rand -base64 32`
- [ ] `CRON_SECRET` genere avec `openssl rand -base64 32`
- [ ] Variables SMTP configurees dans `shared/.env` (optionnel, pour les rappels email)
- [ ] Timer systemd `koinonia-cron.timer` activé (ou crontab/webcron externe) pour appeler `/api/cron` toutes les heures
- [ ] Variables `BACKUP_S3_*` configurées pour les backups BDD (optionnel)
- [ ] Variables `MEDIA_S3_*` configurées pour le bucket média (optionnel)
- [ ] `AUDIO_CACHE_DIR`/`AUDIO_CACHE_MAX_BYTES` dimensionnés pour le cache des renditions audio (optionnel, valeurs par défaut sinon)
- [ ] Diagnostic S3 validé : `npx tsx prisma/scripts/debug-s3.ts` (en local)
- [ ] Timer systemd `koinonia-backup.timer` activé (ou crontab) pour backup quotidien (optionnel)
- [ ] Backup testé : déclencher manuellement et vérifier la présence dans S3
- [ ] Restore testé : restaurer un backup sur un environnement de test
- [ ] `AUTH_TRUST_HOST=true` present
- [ ] `AUTH_URL` pointe vers le domaine de production (HTTPS)
- [ ] Base de donnees creee avec utilisateur dedie
- [ ] Migrations appliquees via le pipeline CD (automatique)
- [ ] Service systemd actif et active au boot
- [ ] Traefik configure avec certificat TLS
- [ ] URI de redirection Google OAuth ajoutee
- [ ] Acces HTTPS fonctionnel

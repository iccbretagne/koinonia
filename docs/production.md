# Déploiement en production

Guide de déploiement de Koinonia sur un serveur Debian avec Traefik, MariaDB et systemd.

## Prérequis

- Debian 11+ (ou Ubuntu 22.04+)
- Node.js 22+ (via [NodeSource](https://github.com/nodesource/distributions))
- MariaDB 10.11+
- Traefik configuré avec terminaison TLS (Let's Encrypt)

## Utilisateur système

Créer un utilisateur dédié :

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

Créer la structure :

```bash
sudo -u koinonia mkdir -p /opt/koinonia/{releases,shared}
```

## Variables d'environnement

Créer le fichier `/opt/koinonia/shared/.env` :

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

Générer le secret NextAuth :

```bash
openssl rand -base64 32
```

`AUTH_TRUST_HOST=true` est obligatoire derrière un reverse proxy (Traefik).

## Base de données

Créer la base et l'utilisateur MariaDB :

```sql
CREATE DATABASE koinonia CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'koinonia'@'localhost' IDENTIFIED BY 'MOT_DE_PASSE';
GRANT ALL PRIVILEGES ON koinonia.* TO 'koinonia'@'localhost';
FLUSH PRIVILEGES;
```

## Déploiement

> **Important** : le déploiement se fait exclusivement via GitHub Actions (artefact pré-compilé en CI).
> Aucune compilation ne doit avoir lieu sur le serveur de production.
> Le `workflow_dispatch` permet de re-déployer une version existante en cas d'urgence. Il ne recompile pas : il exige un run CI **réussi** pour le tag `v<version>` demandé et promeut l'artefact de ce run. Un tag sans CI verte, ou dont le commit ne correspond pas à celui validé par la CI, est refusé — il n'existe donc aucun chemin de déploiement qui contourne la CI.

### Première installation

La première release est déployée automatiquement après le premier push de tag `v*` une fois les secrets GitHub configurés (voir section "Déploiement automatisé").

Pour initialiser uniquement la base de données avant la première release :

```bash
# Appliquer les migrations (depuis le repertoire de la release deployee)
cd /opt/koinonia/current
./node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma

# Optionnel : charger les donnees de demo ICC Rennes
# (uniquement en environnement de test, jamais en production)
```

## Service systemd

Créer `/etc/systemd/system/koinonia.service` :

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

> Le build utilise `output: "standalone"`. Le point d'entrée est `server.js` dans le répertoire standalone — ne pas utiliser `next start` ni `npm start`.

Activer et démarrer :

```bash
sudo systemctl daemon-reload
sudo systemctl enable koinonia
sudo systemctl start koinonia
```

### Durcissement systemd (recommandé)

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

Traefik gère automatiquement le certificat TLS via Let's Encrypt.

## Cache disque des renditions audio (ADR-0008)

Le module audio (spec 021 — bibliothèque d'écoute) sert les renditions MP3 depuis un cache
disque local, alimenté au premier accès depuis le stockage S3 media. Sur l'infra actuelle
(Traefik attaque directement le process Node, port 3001), le process Node sert lui-même ces
fichiers en `Range` HTTP natif — aucune configuration supplémentaire n'est nécessaire.

```bash
AUDIO_CACHE_DIR=/opt/koinonia/shared/audio-cache   # defaut : <tmpdir>/koinonia-audio-cache
AUDIO_CACHE_MAX_BYTES=5368709120                   # defaut : 5 Go, eviction LRU au-dela
```

Dimensionner `AUDIO_CACHE_MAX_BYTES` selon l'espace disque disponible et le volume de cultes
publiés conservés activement — une rendition non consultée depuis longtemps est évincée
automatiquement (LRU), le culte reste disponible, seul le prochain accès redéclenche un
téléchargement S3.

### Délégation nginx (X-Accel-Redirect) — annexe optionnelle, non activée

Si un nginx est un jour inséré devant Koinonia (aujourd'hui Traefik sert Node directement, voir
ADR-0008), le service peut déléguer la livraison du fichier à nginx via `X-Accel-Redirect`
plutôt que de le streamer lui-même (`sendfile`, moins de charge sur le process Node) :

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

Ne définir `AUDIO_XACCEL_LOCATION` que si ce nginx existe réellement devant Koinonia — sinon les
requêtes audio échoueront (le fichier ne sera jamais servi par personne).

Le service ne délègue à nginx qu'après s'être assuré que la rendition est présente dans
`AUDIO_CACHE_DIR` (téléchargement depuis S3 au besoin) : nginx sert le fichier tel quel et ne
sait pas le récupérer. Si le cache est indisponible, la délégation est ignorée et le flux est
servi directement par Node — l'écoute reste possible.

## Rollback

Pour revenir à une release précédente :

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

## Déploiement automatisé (CD)

Le déploiement est automatisé via GitHub Actions. Un push de tag `v*` déclenche le CI, et le workflow de déploiement ne s'exécute que si le CI passe intégralement (typecheck, lint, tests). L'application est construite **une seule fois** par le CI (artefact immutable, attaché au run CI du tag) puis promue telle quelle par le workflow de déploiement, qui se contente de la transférer sur le serveur : aucune compilation n'a lieu ni au déploiement ni en production.

### Prérequis serveur

1. **Clé SSH dédiée** : générer une paire Ed25519 pour l'utilisateur `koinonia` :

```bash
sudo -u koinonia ssh-keygen -t ed25519 -C "deploy@koinonia" -f /home/koinonia/.ssh/id_deploy
```

2. **Autoriser la clé** : ajouter la clé publique dans `/home/koinonia/.ssh/authorized_keys` :

```bash
sudo -u koinonia bash -c 'cat /home/koinonia/.ssh/id_deploy.pub >> /home/koinonia/.ssh/authorized_keys'
```

3. **Sudo restreint** : créer `/etc/sudoers.d/koinonia` :

```
koinonia ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart koinonia
```

### GitHub Secrets à configurer

| Secret | Description |
|--------|-------------|
| `DEPLOY_SSH_KEY` | Clé privée Ed25519 (`/home/koinonia/.ssh/id_deploy`) |
| `DEPLOY_HOST` | Adresse IP ou domaine du serveur |
| `DEPLOY_PORT` | Port SSH personnalisé |
| `DEPLOY_USER` | `koinonia` |
| `DEPLOY_PATH` | `/opt/koinonia` |

Ces secrets sont à définir **par environnement** (`Settings > Environments`), la recette et la
production étant deux machines distinctes.

### Identité SSH de l'hôte — risque accepté (audit M-08)

> **État** : non corrigé, **risque formellement accepté** le 2026-08-29.
> **Propriétaire** : responsable technique du projet.
> **Réexamen** : à la prochaine montée de version des actions de déploiement, et au plus tard
> le 2027-02-28.

Les actions de déploiement n'épinglent pas l'empreinte de la clé d'hôte SSH : elles acceptent
donc la clé présentée, quelle qu'elle soit. Un détournement DNS ou réseau sur le trajet
GitHub → serveur permettrait à une machine tierce de recevoir l'artefact **et la clé privée de
déploiement**.

#### Pourquoi ce n'est pas corrigé

L'épinglage a été implémenté puis **retiré** : il ne peut pas fonctionner en l'état. Les deux
étapes du déploiement embarquent des versions différentes de `golang.org/x/crypto`, qui ne
classent pas les algorithmes de clé d'hôte dans le même ordre :

| Étape | Binaire | `x/crypto` | Clé négociée |
|---|---|---|---|
| `appleboy/scp-action@v0.1.7` | drone-scp 1.6.14 | v0.17.0 | **ECDSA** |
| `appleboy/ssh-action@v1.2.5` | drone-ssh 1.8.2 | v0.45.0 | **RSA** |

Jusqu'à `x/crypto` v0.37 l'ordre est `ECDSA…, RSA…, ED25519` ; à partir de v0.45 il devient
`RSA…, ECDSA…, ED25519`. Les deux étapes négocient donc **deux clés d'hôte différentes**, et
une empreinte unique ne peut satisfaire que l'une des deux. Monter `scp-action` en v1.0.0 ne
change rien : drone-scp 1.8.0 utilise `x/crypto` v0.37.0, encore côté ECDSA.

#### Mesures compensatoires en place

- Clé de déploiement **dédiée**, distincte entre recette et production, sans autre usage.
- `sudo` du compte de déploiement restreint au seul `systemctl restart` des services Koinonia.
- Le déploiement de production ne transporte que l'artefact **déjà construit et testé par la
  CI**, dont le tag et le commit sont vérifiés avant transfert : un attaquant en position
  d'interception ne peut pas faire construire un artefact différent par la chaîne.
- Aucun secret applicatif ne transite par ce canal : `shared/.env` vit sur le serveur.

Ces mesures **ne couvrent pas** le risque principal — la capture de la clé privée de
déploiement par un hôte usurpé. Elles en limitent la portée, elles ne l'annulent pas.

#### Conditions de levée

Deux sorties possibles, à instruire au réexamen :

1. **Ne faire offrir qu'un seul type de clé d'hôte par le serveur** (`HostKey` unique dans
   `sshd_config`, ed25519 en pratique). Les deux clients négocient alors la même clé quelle que
   soit leur version, et une empreinte unique redevient possible. Coût : une modification
   `sshd` par machine, et une nouvelle acceptation de clé pour les connexions humaines.
2. **Remplacer les actions tierces par `scp`/`ssh` d'OpenSSH** avec un `known_hosts` épinglé.
   OpenSSH accepte toutes les clés listées : la question de l'ordre disparaît, et le job
   privilégié n'exécute plus de code tiers. Coût : réécriture des deux étapes, à valider en
   recette.

L'option 2 est la cible souhaitable ; elle rejoint la reduction de surface du chemin de
deploiement traitee par [le TODO H-10](todo-separation-comptes-deploiement.md).

### Fonctionnement

1. Push d'un tag `v*` (ex: `git tag v0.6.0 && git push origin v0.6.0`)
2. Le CI s'exécute (typecheck, tests, vérification version) et, sur un tag, **empaquette l'artefact de release** puis le publie comme artefact du run
3. Si le CI passe, le workflow deploy **télécharge cet artefact depuis le run CI** — il ne recompile rien et ne fait aucun checkout — puis se connecte en SSH au serveur
4. L'artefact pré-compilé est transféré par SCP, extrait, les assets statiques assemblés — aucune compilation n'a lieu en production. L'artefact inclut `prisma.config.ts` (requis par Prisma 7 pour la configuration CLI)
5. Les migrations Prisma sont appliquées, le symlink `current` est basculé, le service redémarre
6. Les anciennes releases sont nettoyées (3 dernières conservées)

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

Les captures d'écran de la page `/guide` sont hébergées sur une **release GitHub dédiée** (`guide-assets`) et non dans le code source. Elles sont chargées depuis :

```
https://github.com/iccbretagne/koinonia/releases/download/guide-assets/<fichier>.png
```

### Mettre à jour les captures

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
| `guide-planning-edit.png` | `/dashboard?dept=<id>` — édition statut |
| `guide-members-list.png` | `/admin/members` — tableau des STAR |
| `guide-members-manage.png` | `/admin/members` — formulaire ajout/édition |
| `guide-events-list.png` | `/events` — liste des événements |
| `guide-events-manage.png` | `/admin/events` — formulaire événement |
| `guide-admin-departments.png` | `/admin/departments` — tableau départements |
| `guide-admin-church.png` | `/admin/churches` — paramètres église |
| `guide-admin-users.png` | `/admin/users` — gestion utilisateurs |

> Les captures doivent être prises en **1280x800** pour un ratio 16:9 cohérent.

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

### Planification — timer systemd (recommandé)

Le backup est déclenché via un appel HTTP à l'API Koinonia. Un timer systemd est plus fiable qu'un crontab (journalisation, gestion des échecs, persistance après reboot).

**1. Créer le service** `/etc/systemd/system/koinonia-backup.service` :

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

> On appelle `127.0.0.1:$PORT` en local plutôt que le domaine public pour éviter de passer par Traefik/TLS.

**2. Créer le timer** `/etc/systemd/system/koinonia-backup.timer` :

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

- `Persistent=true` : si le serveur était éteint à 2h00, le backup sera exécuté au prochain démarrage.
- `RandomizedDelaySec=300` : délai aléatoire de 0 à 5 min pour éviter les pics de charge.

**3. Activer le timer** :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now koinonia-backup.timer
```

**4. Vérifier** :

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

Si vous préférez crontab :

```bash
sudo -u koinonia crontab -e
```

```
0 2 * * * . /opt/koinonia/shared/.env && curl -sf -X POST http://127.0.0.1:${PORT:-3000}/api/cron/backup \
  -H "Authorization: Bearer $CRON_SECRET" \
  >> /opt/koinonia/logs/backup.log 2>&1
```

### Endpoints

| Méthode | URL | Auth | Description |
|---------|-----|------|-------------|
| `POST` | `/api/cron/backup` | Bearer token (`CRON_SECRET`) | Backup automatique + nettoyage retention |
| `GET` | `/api/admin/backups` | Session (SUPER_ADMIN) | Lister les backups disponibles |
| `POST` | `/api/admin/backups` | Session (SUPER_ADMIN) | Déclencher un backup manuel |
| `POST` | `/api/admin/backups/restore` | Session (SUPER_ADMIN) | Restaurer un backup (`{"key":"backups/..."}`) |

### Convention de nommage

Les backups sont stockés sous la clé `backups/YYYY-MM-DDTHH-mm-ssZ/db.sql.gz`. Le dump est compressé en gzip (mysqldump `--single-transaction --quick --routines --triggers`).

### Procédure de restauration

> **ATTENTION** : la restauration écrase intégralement la base de données. Toutes les données insérées depuis le backup seront perdues.

#### Prérequis

- Accès SSH au serveur (ou rôle SUPER_ADMIN dans l'interface)
- `mysqldump` et `mysql` installés sur le serveur
- Accès au bucket S3 configuré

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

#### Étape 1 — Identifier le backup à restaurer

**Via l'API** :

```bash
# Lister les backups disponibles (du plus recent au plus ancien)
curl -s https://votre-domaine.com/api/admin/backups \
  -H "Cookie: $COOKIE" | jq '.[] | {key, lastModified, sizeMB: (.sizeBytes/1048576 | round)}'
```

**Via la CLI S3** (si vous avez `aws` ou `mc` configuré) :

```bash
aws --endpoint-url https://s3.fr-par.scw.cloud s3 ls s3://koinonia-backups/backups/ --recursive
```

Notez la clé du backup souhaité, par exemple : `backups/2026-03-24T02-00-00Z/db.sql.gz`

#### Étape 2 — Arrêter l'application

```bash
sudo systemctl stop koinonia
```

Cela empêche les écritures en base pendant la restauration.

#### Étape 3 — Créer un backup de sécurité

Avant de restaurer, sauvegardez l'état actuel au cas où :

```bash
sudo -u koinonia bash -c '. /opt/koinonia/shared/.env && \
  MYSQL_PWD=$(echo $DATABASE_URL | sed "s|.*://[^:]*:\([^@]*\)@.*|\1|") \
  mysqldump --single-transaction --quick \
    -u $(echo $DATABASE_URL | sed "s|.*://\([^:]*\):.*|\1|") \
    $(echo $DATABASE_URL | sed "s|.*/||") | gzip > /opt/koinonia/shared/pre-restore-backup.sql.gz'
```

#### Étape 4 — Restaurer

**Option A — Via l'API** (recommandé) :

```bash
curl -X POST https://votre-domaine.com/api/admin/backups/restore \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{"key":"backups/2026-03-24T02-00-00Z/db.sql.gz"}'
```

> Note : l'application doit être démarrée pour cette option. Si vous l'avez arrêtée, redémarrez-la temporairement (`sudo systemctl start koinonia`), lancez la restauration, puis passez à l'étape 5.

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

#### Étape 5 — Redémarrer l'application

```bash
sudo systemctl start koinonia
```

#### Étape 6 — Vérifier

1. Accéder à l'application et vérifier que les données sont cohérentes
2. Contrôler les logs :

```bash
sudo journalctl -u koinonia -n 50 --no-pager
```

3. Si la restauration est mauvaise, restaurer le backup de sécurité de l'étape 3 :

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

| Symptôme | Cause probable | Solution |
|----------|----------------|----------|
| Timer n'exécute pas | Timer pas activé | `sudo systemctl enable --now koinonia-backup.timer` |
| `curl: (7) Failed to connect` | Koinonia pas démarré | Vérifier `systemctl status koinonia` |
| `mysqldump: command not found` | mariadb-client manquant | `sudo apt install mariadb-client` |
| `Access denied for user` | Mot de passe incorrect dans DATABASE_URL | Vérifier `/opt/koinonia/shared/.env` |
| Backup vide (0 octets) | Base inaccessible | Vérifier `systemctl status mariadb` |
| Restore échoue `ERROR 1049` | Base inexistante | Recréer la base (voir section BDD) |
| S3 `AccessDenied` | Clé S3 invalide ou bucket inexistant | Vérifier les variables `BACKUP_S3_*` et créer le bucket |

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

Avant de tagger une version et de la déployer en production, il est recommandé de la valider sur un **environnement de recette dédié** (VM séparée, identique à la production). Le déploiement s'y fait manuellement via le workflow GitHub Actions `Deploy Staging` (`workflow_dispatch`), indépendamment du pipeline de production décrit ci-dessus.

Voir [docs/staging.md](staging.md) pour la mise en place complète (provisionnement, secrets, déclenchement).

## Checklist de production

- [ ] Variables d'environnement configurées dans `shared/.env`
- [ ] `AUTH_SECRET` généré avec `openssl rand -base64 32`
- [ ] `CRON_SECRET` généré avec `openssl rand -base64 32`
- [ ] Variables SMTP configurées dans `shared/.env` (optionnel, pour les rappels email)
- [ ] Timer systemd `koinonia-cron.timer` activé (ou crontab/webcron externe) pour appeler `/api/cron` toutes les heures
- [ ] Variables `BACKUP_S3_*` configurées pour les backups BDD (optionnel)
- [ ] Variables `MEDIA_S3_*` configurées pour le bucket média (optionnel)
- [ ] `AUDIO_CACHE_DIR`/`AUDIO_CACHE_MAX_BYTES` dimensionnés pour le cache des renditions audio (optionnel, valeurs par défaut sinon)
- [ ] Diagnostic S3 validé : `npx tsx prisma/scripts/debug-s3.ts` (en local)
- [ ] Timer systemd `koinonia-backup.timer` activé (ou crontab) pour backup quotidien (optionnel)
- [ ] Backup testé : déclencher manuellement et vérifier la présence dans S3
- [ ] Restore testé : restaurer un backup sur un environnement de test
- [ ] `AUTH_TRUST_HOST=true` présent
- [ ] `AUTH_URL` pointe vers le domaine de production (HTTPS)
- [ ] Base de données créée avec utilisateur dédié
- [ ] Migrations appliquées via le pipeline CD (automatique)
- [ ] Service systemd actif et activé au boot
- [ ] Traefik configuré avec certificat TLS
- [ ] URI de redirection Google OAuth ajoutée
- [ ] Accès HTTPS fonctionnel

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

> **Important** : le deploiement se fait exclusivement via GitHub Actions (artefact pre-compile en CI).
> Aucune compilation ne doit avoir lieu sur le serveur de production.
> Le `workflow_dispatch` permet de re-deployer une version existante en cas d'urgence — il execute le meme pipeline CI que le deploiement automatique.

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

Le deploiement est automatise via GitHub Actions. Un push de tag `v*` declenche le CI, et le workflow de deploiement ne s'execute que si le CI passe integralement (typecheck, lint, tests). L'application est construite en CI (artefact immutable) puis deployee sur le serveur sans etape de build.

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

## Stockage S3 (backups + module Media)

Les memes variables S3 servent a deux usages distincts dans le meme bucket, separes par prefixe :

| Usage | Prefixe | Retention |
|---|---|---|
| Sauvegardes BDD | `backups/{timestamp}/` | `BACKUP_RETENTION_DAYS` (defaut 30j) |
| Photos evenements media | `media-events/{id}/photos/` | indefinie |
| Fichiers media (visuels, videos) | `media-events/{id}/files/`, `media-projects/{id}/` | indefinie |

> **Recommandation production** : utiliser des buckets separes pour les backups et les medias afin d'appliquer des regles de lifecycle differentes. Un bucket media ne doit pas avoir de suppression automatique des objets.

### Configuration

Ajouter les variables suivantes dans `shared/.env` :

```bash
S3_ENDPOINT=https://s3.fr-par.scw.cloud    # endpoint S3-compatible
S3_REGION=fr-par                             # region
S3_BUCKET=koinonia-storage                   # bucket (doit exister)
S3_ACCESS_KEY_ID=SCWXXXXXXXXX                # cle d'acces
S3_SECRET_ACCESS_KEY=xxxxxxxx                # secret
BACKUP_RETENTION_DAYS=30                     # retention backups en jours (defaut: 30)
```

### Securite du bucket (recommande)

Appliquer ces mesures sur le bucket S3 :

- **Chiffrement cote serveur (SSE)** : activer le chiffrement par defaut (AES-256 ou SSE-KMS) sur le bucket. Tous les objets seront chiffres au repos.
- **Versioning** : activer le versioning du bucket pour conserver les versions precedentes en cas de corruption ou suppression accidentelle.
- **Acces restreint** : la cle S3 utilisee par Koinonia doit avoir uniquement les permissions `s3:PutObject`, `s3:GetObject`, `s3:ListBucket`, `s3:DeleteObject` sur le bucket cible. Ne pas utiliser une cle admin.
- **Verification d'integrite** : avant restauration, verifier que le fichier se decompresse correctement (`gunzip -t backup.sql.gz`).
- **Lifecycle backups** : configurer une regle de lifecycle sur le prefixe `backups/` uniquement pour supprimer automatiquement les objets de plus de N jours. Ne pas appliquer de suppression automatique sur les prefixes `media-*`.

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
| S3 `AccessDenied` | Cle S3 invalide ou bucket inexistant | Verifier les variables `S3_*` et creer le bucket |

## Checklist de production

- [ ] Variables d'environnement configurees dans `shared/.env`
- [ ] `AUTH_SECRET` genere avec `openssl rand -base64 32`
- [ ] `CRON_SECRET` genere avec `openssl rand -base64 32`
- [ ] Variables SMTP configurees dans `shared/.env` (optionnel, pour les rappels email)
- [ ] Timer systemd `koinonia-cron.timer` activé (ou crontab/webcron externe) pour appeler `/api/cron` toutes les heures
- [ ] Variables S3 configurees pour les backups (optionnel)
- [ ] Timer systemd `koinonia-backup.timer` active (ou crontab) pour backup quotidien (optionnel)
- [ ] Backup teste : declencher manuellement et verifier la presence dans S3
- [ ] Restore teste : restaurer un backup sur un environnement de test
- [ ] `AUTH_TRUST_HOST=true` present
- [ ] `AUTH_URL` pointe vers le domaine de production (HTTPS)
- [ ] Base de donnees creee avec utilisateur dedie
- [ ] Migrations appliquees via le pipeline CD (automatique)
- [ ] Service systemd actif et active au boot
- [ ] Traefik configure avec certificat TLS
- [ ] URI de redirection Google OAuth ajoutee
- [ ] Acces HTTPS fonctionnel

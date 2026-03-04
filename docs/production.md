# Deploiement en production

Guide de deploiement de PlanningCenter sur un serveur Debian avec Traefik, MariaDB et systemd.

## Prerequis

- Debian 11+ (ou Ubuntu 22.04+)
- Node.js 20+ (via [NodeSource](https://github.com/nodesource/distributions))
- MariaDB 10.11+
- Traefik configure avec terminaison TLS (Let's Encrypt)

## Utilisateur systeme

Creer un utilisateur dedie :

```bash
sudo useradd -r -m -d /opt/planning -s /bin/bash planning
```

## Structure des dossiers

L'application utilise une structure Capistrano-like :

```
/opt/planning/
├── current -> releases/planningcenter-0.1.0   # symlink vers la release active
├── releases/
│   ├── planningcenter-0.1.0/
│   ├── planningcenter-0.0.9/
│   └── ...
└── shared/
    └── .env               # variables d'environnement (persistant)
```

Creer la structure :

```bash
sudo -u planning mkdir -p /opt/planning/{releases,shared}
```

## Variables d'environnement

Creer le fichier `/opt/planning/shared/.env` :

```bash
DATABASE_URL=mysql://planning:MOT_DE_PASSE@localhost:3306/planning
NEXTAUTH_SECRET=GENERER_AVEC_OPENSSL
NEXTAUTH_URL=https://votre-domaine.com
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
CREATE DATABASE planning CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'planning'@'localhost' IDENTIFIED BY 'MOT_DE_PASSE';
GRANT ALL PRIVILEGES ON planning.* TO 'planning'@'localhost';
FLUSH PRIVILEGES;
```

## Deploiement

### Premiere installation

```bash
# 1. Telecharger la release depuis GitHub
cd /opt/planning/releases
VERSION=0.1.0
curl -L -o planningcenter-${VERSION}.tar.gz \
  https://github.com/iccbretagne/planningcenter/archive/refs/tags/v${VERSION}.tar.gz

# 2. Decompresser
tar xzf planningcenter-${VERSION}.tar.gz
rm planningcenter-${VERSION}.tar.gz

# 3. Lier le fichier .env
ln -s /opt/planning/shared/.env /opt/planning/releases/planningcenter-${VERSION}/.env

# 4. Installer les dependances et construire
cd /opt/planning/releases/planningcenter-${VERSION}
npm install --production=false
npm run build

# 5. Appliquer le schema
npm run db:push
npm run db:seed    # optionnel : charge les donnees de demo ICC Rennes

# 6. Activer la release
ln -sfn /opt/planning/releases/planningcenter-${VERSION} /opt/planning/current

# 7. Demarrer le service (voir section systemd ci-dessous)
sudo systemctl start planning
```

### Mises a jour

```bash
cd /opt/planning/releases
VERSION=X.Y.Z
curl -L -o planningcenter-${VERSION}.tar.gz \
  https://github.com/iccbretagne/planningcenter/archive/refs/tags/v${VERSION}.tar.gz
tar xzf planningcenter-${VERSION}.tar.gz
rm planningcenter-${VERSION}.tar.gz

ln -s /opt/planning/shared/.env /opt/planning/releases/planningcenter-${VERSION}/.env

cd /opt/planning/releases/planningcenter-${VERSION}
npm install --production=false
npm run build
npm run db:push

ln -sfn /opt/planning/releases/planningcenter-${VERSION} /opt/planning/current
sudo systemctl restart planning
```

## Service systemd

Creer `/etc/systemd/system/planning.service` :

```ini
[Unit]
Description=PlanningCenter
After=network.target mariadb.service

[Service]
Type=simple
User=planning
Group=planning
WorkingDirectory=/opt/planning/current
EnvironmentFile=/opt/planning/shared/.env
ExecStart=/usr/bin/node /opt/planning/current/node_modules/.bin/next start -p 3000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Activer et demarrer :

```bash
sudo systemctl daemon-reload
sudo systemctl enable planning
sudo systemctl start planning
```

Commandes utiles :

```bash
sudo systemctl status planning    # statut
sudo journalctl -u planning -f    # logs en temps reel
```

## Configuration Traefik

Ajouter un fichier de configuration dynamique (ex: `/etc/traefik/dynamic/planning.yml`) :

```yaml
http:
  routers:
    planning:
      rule: "Host(`votre-domaine.com`)"
      entryPoints:
        - websecure
      service: planning
      tls:
        certResolver: letsencrypt

  services:
    planning:
      loadBalancer:
        servers:
          - url: "http://127.0.0.1:3000"
```

Traefik gere automatiquement le certificat TLS via Let's Encrypt.

## Rollback

Pour revenir a une release precedente :

```bash
# Lister les releases disponibles
ls /opt/planning/releases/

# Repointer le symlink
ln -sfn /opt/planning/releases/planningcenter-VERSION_PRECEDENTE /opt/planning/current

# Redemarrer
sudo systemctl restart planning
```

## OAuth Google en production

Dans la [console Google Cloud](https://console.cloud.google.com/apis/credentials), ajouter l'URI de redirection de production :

```
https://votre-domaine.com/api/auth/callback/google
```

## Deploiement automatise (CD)

Le deploiement est automatise via GitHub Actions. Un push de tag `v*` declenche le workflow de deploiement apres validation du CI.

### Prerequis serveur

1. **Cle SSH dediee** : generer une paire Ed25519 pour l'utilisateur `planning` :

```bash
sudo -u planning ssh-keygen -t ed25519 -C "deploy@planningcenter" -f /home/planning/.ssh/id_deploy
```

2. **Autoriser la cle** : ajouter la cle publique dans `/home/planning/.ssh/authorized_keys` :

```bash
sudo -u planning bash -c 'cat /home/planning/.ssh/id_deploy.pub >> /home/planning/.ssh/authorized_keys'
```

3. **Sudo restreint** : creer `/etc/sudoers.d/planning` :

```
planning ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart planning
```

### GitHub Secrets a configurer

| Secret | Description |
|--------|-------------|
| `DEPLOY_SSH_KEY` | Cle privee Ed25519 (`/home/planning/.ssh/id_deploy`) |
| `DEPLOY_HOST` | Adresse IP ou domaine du serveur |
| `DEPLOY_PORT` | Port SSH personnalise |
| `DEPLOY_USER` | `planning` |
| `DEPLOY_PATH` | `/opt/planning` |

### Fonctionnement

1. Push d'un tag `v*` (ex: `git tag v0.6.0 && git push origin v0.6.0`)
2. Le CI s'execute (typecheck, tests, verification version)
3. Si le CI passe, le workflow deploy se connecte en SSH au serveur
4. Le script telecharge la release, installe les dependances, construit, migre la BDD, bascule le symlink et redemarre le service
5. Les anciennes releases sont nettoyees (3 dernieres conservees)

Un script `scripts/deploy.sh` est egalement disponible pour les deploiements manuels depuis le serveur :

```bash
DEPLOY_PATH=/opt/planning bash scripts/deploy.sh 0.6.0
```

## Checklist de production

- [ ] Variables d'environnement configurees dans `shared/.env`
- [ ] `NEXTAUTH_SECRET` genere avec `openssl rand -base64 32`
- [ ] `AUTH_TRUST_HOST=true` present
- [ ] `NEXTAUTH_URL` pointe vers le domaine de production (HTTPS)
- [ ] Base de donnees creee avec utilisateur dedie
- [ ] Schema applique (`npm run db:push`)
- [ ] Application construite (`npm run build`)
- [ ] Service systemd actif et active au boot
- [ ] Traefik configure avec certificat TLS
- [ ] URI de redirection Google OAuth ajoutee
- [ ] Acces HTTPS fonctionnel

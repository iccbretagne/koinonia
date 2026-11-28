# Installer le serveur

Installation système d'un serveur Koinonia (production ou recette) : utilisateur, dossiers, base
de données, service systemd et reverse proxy. L'ordre complet des opérations est dans le
[guide de déploiement](README.md#première-installation) ; la configuration applicative
(`shared/.env`) est dans [configuration.md](configuration.md).

## Sommaire

- [Prérequis](#prérequis)
- [Utilisateur système](#utilisateur-système)
- [Structure des dossiers](#structure-des-dossiers)
- [Base de données](#base-de-données)
- [Service systemd](#service-systemd) (dont le [durcissement](#durcissement-systemd-recommandé))
- [Configuration Traefik](#configuration-traefik) (dont [IP client, port, HSTS](#durcissement--ip-client-port-applicatif-hsts))
- [OAuth Google en production](#oauth-google-en-production)
- [Unités systemd associées](#unités-systemd-associées)


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

## Base de données

Créer la base et l'utilisateur MariaDB :

```sql
CREATE DATABASE koinonia CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'koinonia'@'localhost' IDENTIFIED BY 'MOT_DE_PASSE';
GRANT ALL PRIVILEGES ON koinonia.* TO 'koinonia'@'localhost';
FLUSH PRIVILEGES;
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
Environment=HOSTNAME=127.0.0.1
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

### Durcissement : IP client, port applicatif, HSTS

**Le process Node n'écoute que sur la boucle locale** (`HOSTNAME=127.0.0.1` dans l'unité systemd
ci-dessus) : Traefik, sur le même hôte, est le seul point d'entrée. Avec `0.0.0.0`, le port
applicatif répondait aussi depuis Internet si aucun pare-feu ne le fermait, en contournant TLS,
les en-têtes de sécurité et la réécriture de `X-Forwarded-For`. Vérifier après redémarrage :

```bash
sudo ss -ltnp | grep node          # doit afficher 127.0.0.1:<PORT>, jamais 0.0.0.0 ni *
curl -m 3 http://<IP-publique>:<PORT>/ || echo "fermé (attendu)"
```

**IP client fiable** — le limiteur de débit (`src/lib/rate-limit.ts`, `getClientIp`) lit le
premier élément de `X-Forwarded-For`. Traefik ne fait confiance aux en-têtes `X-Forwarded-*`
entrants que pour les IP listées dans `forwardedHeaders.trustedIPs` de l'entrypoint, et les
remplace sinon par l'IP réellement vue. Dans la configuration **statique** de Traefik
(`/etc/traefik/traefik.yml`), l'entrypoint `websecure` ne doit donc avoir **ni**
`forwardedHeaders.insecure: true`, **ni** de `trustedIPs` couvrant Internet :

```yaml
entryPoints:
  websecure:
    address: ":443"
    # forwardedHeaders absent : aucun en-tête X-Forwarded-* client n'est cru (comportement voulu).
    # Seulement si un CDN/load balancer est placé devant Traefik :
    # forwardedHeaders:
    #   trustedIPs: ["<plages du CDN>"]
```

Contrôle : `curl -H "X-Forwarded-For: 1.2.3.4" https://votre-domaine.com/...` ne doit pas faire
apparaître `1.2.3.4` comme IP client dans les journaux de l'application.

**HSTS d'un an** — en-tête posé par un middleware Traefik (configuration dynamique), à
référencer depuis le router `koinonia` (`middlewares: [koinonia-security-headers]`) :

```yaml
http:
  middlewares:
    koinonia-security-headers:
      headers:
        stsSeconds: 31536000          # 1 an (anciennement 86400)
        stsIncludeSubdomains: false   # n'engage pas les autres services du domaine
        stsPreload: false
        contentTypeNosniff: true
        referrerPolicy: "strict-origin-when-cross-origin"
```

Ne passer à `31536000` qu'une fois le HTTPS validé de bout en bout (certificat renouvelé
automatiquement, aucune ressource en HTTP) : un navigateur qui a reçu l'en-tête refusera le
site en HTTP pendant toute sa durée. `stsIncludeSubdomains` reste à `false` tant que tous les
sous-domaines ne sont pas eux aussi servis en HTTPS.

## OAuth Google en production

Dans la [console Google Cloud](https://console.cloud.google.com/apis/credentials), ajouter l'URI de redirection de production :

```
https://votre-domaine.com/api/auth/callback/google
```


## Unités systemd associées

Trois unités s'ajoutent au service principal `koinonia`, chacune décrite à l'endroit où elle sert :

| Unité | Rôle | Documentation |
|---|---|---|
| `koinonia-cron.service` + `.timer` | Appelle `POST /api/cron` toutes les 5 minutes | [Cron](exploitation.md#cron--tâches-planifiées) |
| `koinonia-backup.service` + `.timer` | Sauvegarde quotidienne de la base vers S3 | [Sauvegardes](exploitation.md#sauvegardes-de-la-base-de-données) |
| `koinonia-audio-worker.service` | Rendu et sondage audio (`ffmpeg`/`ffprobe`), process séparé | [Worker audio](exploitation.md#worker-audio-module-audio) |

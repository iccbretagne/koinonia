# Configuration et variables d'environnement

Tout ce qui se règle sur un serveur Koinonia vit dans **un seul fichier**,
`/opt/koinonia/shared/.env` (persistant d'une release à l'autre, lié dans chaque release par le
pipeline). Ce document est la référence des variables, suivie des procédures de configuration
propres à chaque fonction.

> **Règles du fichier `.env`** : pas de commentaire en fin de ligne (systemd, via
> `EnvironmentFile`, l'inclurait dans la valeur) ; un changement n'est pris en compte qu'au
> redémarrage (`sudo systemctl restart koinonia`) ; ne jamais réutiliser le `.env` de production sur
> la recette (voir [staging.md](../staging.md)). Les variables sont **lues à l'exécution**, sauf
> mention « build » : une variable de build est figée dans l'artefact par la CI et ne se règle pas
> sur le serveur.

## Sommaire

- [Référence des variables](#référence-des-variables)
- [Exemple de `shared/.env` (production)](#exemple-de-sharedenv-production)
- [Modules optionnels](#modules-optionnels)
- [Configuration SMTP](#configuration-smtp)
- [Stockage S3](#stockage-s3)
- [Sites d'événement : sous-domaines et domaines dédiés](#sites-dévénement--sous-domaines-et-domaines-dédiés-spec-084-adr-0031)
- [Politique de sécurité du contenu](#politique-de-sécurité-du-contenu-adr-0022)
- [Cache disque des renditions audio](#cache-disque-des-renditions-audio-adr-0008)

## Référence des variables

Source : `.env.example` (modèle versionné) et le code (`process.env.*`). « Oblig. » = l'instance ne
fonctionne pas correctement sans elle.

### Socle

| Variable | Oblig. | Rôle |
|---|---|---|
| `DATABASE_URL` | oui | Connexion MariaDB, `mysql://utilisateur:mot-de-passe@hôte:3306/base` |
| `AUTH_SECRET` | oui | Secret des sessions (`openssl rand -base64 32`). Sert aussi de repli aux secrets de liens publics ci-dessous |
| `AUTH_URL` | oui | URL publique de l'instance (https). Sert aussi de repli à `APP_URL` |
| `AUTH_TRUST_HOST` | oui | `true` derrière un reverse proxy (Traefik) |
| `PORT` | oui | Port d'écoute local ; Traefik pointe dessus (3001 dans les exemples de ce guide) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | oui | Client OAuth Google ([URI de redirection](serveur.md#oauth-google-en-production)) |
| `SUPER_ADMIN_EMAILS` | oui | Emails (séparés par des virgules) reconnus Super Admin sans vérification en base. **À retirer une fois l'onboarding initial terminé** puis redémarrer |
| `CRON_SECRET` | oui | Jeton porteur de `POST /api/cron` et `/api/cron/backup` (`openssl rand -base64 32`) |
| `ENABLED_MODULES` | non | Liste blanche de modules, [voir ci-dessous](#modules-optionnels). Vide : tous actifs |
| `APP_URL` | non | URL publique pour les liens absolus (partages, emails) ; à défaut `AUTH_URL`, puis `NEXTAUTH_URL` |
| `LOG_LEVEL` | non | Niveau de journalisation (défaut `info`) |
| `NODE_ENV` | — | Posé à `production` par l'unité systemd, jamais dans `.env` |

### Formulaires publics et liens

| Variable | Oblig. | Rôle |
|---|---|---|
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | oui pour les formulaires publics | Cloudflare Turnstile (`/agenda-public`, `/rejoindre`, `/servir`, `/inscription`, `/f`). Sans elles : « Formulaire temporairement indisponible » (fail-closed) |
| `TICKETING_TOKEN_SECRET` | non | Jetons de billets, réservations, badges (repli `AUTH_SECRET`) |
| `FORMS_TOKEN_SECRET` | non | « Gérer ma réponse », empreintes d'anonymat (repli `AUTH_SECRET`) |
| `SERVING_TOKEN_SECRET` | non | Lien « mon rendez-vous » d'entretien (repli `AUTH_SECRET`) |
| `CAMPAIGNS_TOKEN_SECRET` | non | Lien personnel de collecte `/collecte/<jeton>` (repli `AUTH_SECRET`) |

Changer l'un de ces secrets **invalide les liens déjà envoyés**.

### Emails et notifications

| Variable | Oblig. | Rôle |
|---|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | non | Serveur d'envoi ([détail](#configuration-smtp)). Sans SMTP, les emails échouent (journalisé) ; les notifications dans l'application restent actives |
| `SMTP_IGNORE_TLS`, `SMTP_TLS_REJECT_UNAUTHORIZED` | non | Relais local annonçant STARTTLS avec un certificat auto-signé ; certificat distant auto-signé |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | non | Notifications natives (spec 068). Une paire **par environnement** (`npx web-push generate-vapid-keys`) ; la changer invalide tous les abonnements. Sans elles, le canal est indisponible |

### Stockage de fichiers

| Variable | Oblig. | Rôle |
|---|---|---|
| `MEDIA_S3_ENDPOINT`, `MEDIA_S3_REGION`, `MEDIA_S3_BUCKET`, `MEDIA_S3_ACCESS_KEY_ID`, `MEDIA_S3_SECRET_ACCESS_KEY` | oui pour photos, visuels, audio | Bucket média. **Aucun repli sur `BACKUP_S3_*`** (le commentaire de `.env.example` qui l'évoque est périmé) |
| `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | non | Bucket des sauvegardes BDD, distinct du bucket média |
| `BACKUP_RETENTION_DAYS` | non | Rétention des sauvegardes (défaut 30) |
| `ACCOUNTING_S3_BUCKET`, `ACCOUNTING_S3_ENDPOINT`, `ACCOUNTING_S3_REGION`, `ACCOUNTING_S3_ACCESS_KEY` (ou `_ID`), `ACCOUNTING_S3_SECRET_KEY` (ou `_SECRET_ACCESS_KEY`) | non | Pièces jointes de la comptabilité, de la navette, de la trésorerie et images des sites d'événement. À défaut : disque |
| `FILE_STORAGE_DIR` | non | Dossier de ces fichiers sans S3. **Doit être hors du dossier de la release** (ex. `/opt/koinonia/shared/uploads`), sinon ils disparaissent au déploiement suivant |
| `AUDIO_CACHE_DIR`, `AUDIO_CACHE_MAX_BYTES` | non | Cache disque des renditions audio ([détail](#cache-disque-des-renditions-audio-adr-0008)) |
| `AUDIO_XACCEL_LOCATION` | non | Délégation nginx, **inutile** sur l'infra actuelle |

### Sécurité et sites d'événement

| Variable | Oblig. | Rôle |
|---|---|---|
| `CSP_ENFORCE` | non | `true` : CSP bloquante ; vide : Report-Only ([procédure](#politique-de-sécurité-du-contenu-adr-0022)) |
| `TICKETING_SITES_ENABLED` | non | Drapeau d'instance des sites d'événement, coupé par défaut en production |
| `SITE_BASE_DOMAIN` | non | Domaine dont les sous-domaines servent les sites |
| `SITE_TARGET_HOST` | non | Cible DNS des domaines dédiés |
| `TRAEFIK_PROVIDER_TOKEN` | non | Active les domaines dédiés (jeton de `/api/internal/*`) |
| `TRAEFIK_APP_SERVICE_URL` | non | URL du service renvoyée à Traefik (défaut `http://127.0.0.1:$PORT`) |

### Autres

| Variable | Rôle |
|---|---|
| `FAMILLES_URL` | Service externe de géolocalisation des familles (module intégration), défaut `https://familles.iccrennes.fr` |
| `ASSISTANT_MODEL_DIR` | Dossier du modèle de sens de l'assistant (défaut `models`, embarqué dans l'artefact) |

### Variables qui n'appartiennent pas au serveur

| Variable | Où | Rôle |
|---|---|---|
| `AUTH_DEV_LOGIN` | développement et job `e2e` de la CI | Connexion par compte de test. **Jamais en production ni en recette** : ignorée si `NODE_ENV=production`, mais ne doit pas y figurer |
| `NEXT_PUBLIC_BUILD_VERSION` | build de recette | Version affichée dans le pied de page et bandeau « Environnement de recette » |
| `NEXT_PUBLIC_TICKETING_SITES_ENABLED` | build de recette | Active les sites d'événement dans l'interface |
| `ASSISTANT_MODEL_REVISION` | `npm run assistant:model` | Révision Hugging Face du modèle (défaut `main`) |
| `SEED_FIXTURE_FILE` | `db:seed:training` | Fixture de formation ([staging.md](../staging.md#jeu-de-données-de-formation)) |
| `SRC_*`, `DST_*`, `MEDIAFLOW_*` | scripts `prisma/scripts/*` | Credentials des scripts de maintenance S3 ([exploitation.md](exploitation.md#scripts-de-maintenance-s3)) |


## Exemple de `shared/.env` (production)

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
ENABLED_MODULES=
TURNSTILE_SITE_KEY=cle-publique-turnstile
TURNSTILE_SECRET_KEY=cle-secrete-turnstile
# Facultatifs (à défaut AUTH_SECRET) : secrets des liens de billetterie, des formulaires et des
# rendez-vous d'entretien des candidats
TICKETING_TOKEN_SECRET=
FORMS_TOKEN_SECRET=
SERVING_TOKEN_SECRET=
VAPID_PUBLIC_KEY=cle-publique-vapid
VAPID_PRIVATE_KEY=cle-privee-vapid
VAPID_SUBJECT=mailto:contact@votre-domaine.com
```

`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` activent les notifications natives
sur les appareils (Web Push, spec 068, ADR-0024). Générer **une paire par environnement**, une
seule fois :

```bash
npx web-push generate-vapid-keys
```

La clé privée est un secret (même traitement que `AUTH_SECRET`). Les clés sont lues à
l'exécution, pas au build. **Changer de paire invalide tous les abonnements** : chaque appareil
devra réactiver les notifications dans « Mes notifications » (les anciens abonnements sont
supprimés au premier refus du service push). Sans ces trois variables, le canal est simplement
indisponible et « Mes notifications » l'indique.

`TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` (Cloudflare → Turnstile, widget déclarant le
domaine de l'instance) protègent les pages publiques `/agenda-public`, `/rejoindre`, `/servir`, `/inscription` (billetterie) et `/f` (formulaires)
(spec 030). Elles sont lues au démarrage de chaque requête, pas au build : un changement prend
effet au redémarrage du service. Sans les deux, ces formulaires affichent « Formulaire
temporairement indisponible » et une erreur `Turnstile non configuré` est journalisée.

Générer le secret NextAuth :

```bash
openssl rand -base64 32
```

`AUTH_TRUST_HOST=true` est obligatoire derrière un reverse proxy (Traefik).

## Modules optionnels

`ENABLED_MODULES` restreint l'instance à une liste de modules, séparés par des virgules (ex.
`core,planning,agenda`) — absente ou vide, tous les modules sont actifs. Un module qui n'est pas
dans la liste est **absent de l'instance** : ses pages et son API répondent 404, pour tous les
rôles, y compris le Super Admin. Ses données restent en base, intactes — les réactiver revient à
réactiver le module et redémarrer.

Points d'attention avant de désactiver un module en production :

- `core` est le seul module non désactivable — il porte la gestion des églises, des comptes et
  des accès. Son absence de `ENABLED_MODULES` fait échouer le démarrage (fail-fast).
- Une dépendance manquante (un module activé qui dépend d'un module absent de la liste) ou un
  nom de module inconnu (faute de frappe) fait aussi échouer le démarrage, avec un message qui
  nomme le problème — jamais de désactivation silencieuse.
- Le Super Admin perd l'accès applicatif aux données du module désactivé (404, comme tout autre
  rôle) — ce n'est pas une perte de données, seulement d'accès, et c'est réversible.
- Les suppressions en cascade qui nettoient les données liées à un module désactivé (ex.
  discipolat → événement) continuent de s'exécuter normalement ; seules les créations de
  nouvelles données dépendant d'un module désactivé sont coupées.

Voir [ADR-0012](../adr/0012-manifeste-declare-surface-http.md) pour le mécanisme.

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

## Sites d'événement : sous-domaines et domaines dédiés (spec 084, ADR-0031)

**Activation en production** (le build de la CI ne pose pas de drapeau) : dans `shared/.env`,
`TICKETING_SITES_ENABLED=true` et `SITE_BASE_DOMAIN=evenements.iccbzh.fr`, puis redémarrer le
service (`sudo systemctl restart koinonia`) — aucune reconstruction. Ensuite DNS joker et certificat
ci-dessous, puis activation par l'Admin de l'église (Paramètres de l'église › Sites d'événement).

Variables (lues à l'exécution, par environnement) :

| Variable | Rôle |
|---|---|
| `SITE_BASE_DOMAIN` | Domaine dont les sous-domaines servent les sites (`<slug>.evenements.iccbzh.fr`). Sans lui, aucun hôte n'est reconnu comme site. |
| `SITE_TARGET_HOST` | Nom d'hôte vers lequel un domaine dédié doit pointer (CNAME, ou mêmes adresses A/AAAA) ; sert à la vérification DNS. |
| `TRAEFIK_PROVIDER_TOKEN` | Jeton porteur de `/api/internal/traefik` et `/api/internal/site-hosts`. **Sans lui, les domaines dédiés sont désactivés** (les deux adresses répondent 404 et le proxy sert l'application sur tout hôte, comme avant). |
| `TRAEFIK_APP_SERVICE_URL` | Facultative : URL du service applicatif dans la configuration renvoyée à Traefik (défaut `http://127.0.0.1:$PORT`). |

**Sous-domaines** : enregistrement DNS joker `*.evenements.iccbzh.fr` vers le serveur et
certificat joker obtenu par **défi DNS** (un joker ne s'obtient pas par défi HTTP) : résolveur
Traefik dédié (`dnsChallenge`, fournisseur DNS de la zone) référencé par le routeur
`Host(`evenements.iccbzh.fr`) || HostRegexp(`^[a-z0-9-]+\.evenements\.iccbzh\.fr$`)` avec
`tls.domains: [{ main: "evenements.iccbzh.fr", sans: ["*.evenements.iccbzh.fr"] }]`.

**Domaines dédiés** : Traefik interroge l'application pour connaître les domaines approuvés
(fournisseur HTTP), et obtient un certificat Let's Encrypt par domaine (résolveur `letsencrypt`
existant, défi HTTP). Dans la configuration **statique** de Traefik :

```yaml
providers:
  http:
    endpoint: "http://127.0.0.1:3001/api/internal/traefik"   # adapter au PORT de l'application
    pollInterval: "30s"
    headers:
      Authorization: "Bearer <TRAEFIK_PROVIDER_TOKEN>"
```

Verrous de `/api/internal/*` : la requête doit arriver en **boucle locale** (hôte `127.0.0.1`/`localhost`
et aucun en-tête `X-Forwarded-*`, que Traefik pose toujours sur une requête venue d'Internet) **et**
porter le jeton (comparaison à temps constant). Ne jamais configurer Traefik pour retirer les
en-têtes `X-Forwarded-*`, ni exposer ces adresses par un routeur. Le proxy de l'application relit
la liste des domaines approuvés au plus une fois par minute (cache mémoire) : un domaine approuvé
est servi dans la minute, un domaine suspendu ou supprimé cesse de l'être dans la minute. Avant le
premier chargement, un hôte étranger reçoit 404.

Cycle d'un domaine : demande par l'organisateur (jeton de preuve) → enregistrements DNS
`TXT _koinonia.<domaine>` (jeton) et `CNAME <domaine> → SITE_TARGET_HOST` → « Vérifier le DNS » →
approbation du Super Admin (`/plateforme/site-domains`). La tâche cron `ticketing-site-domains`
(quotidienne) refait le contrôle : un échec suspend le domaine et prévient l'organisateur.
Cinq domaines non suspendus au plus par église.

## Politique de sécurité du contenu (ADR-0022)

L'application publie elle-même sa CSP (nonce par requête, `src/lib/csp.ts`) — **ne pas** en
ajouter une dans le middleware d'en-têtes Traefik, qui ne peut pas porter de nonce.

Par défaut, elle est publiée en **`Content-Security-Policy-Report-Only`** : rien n'est bloqué,
les violations sont envoyées par les navigateurs à `/api/csp-report` et journalisées.

```bash
sudo journalctl -u koinonia --since "1 day ago" | grep "csp: violation"
```

Procédure d'activation, en recette puis en production :
1. Laisser tourner en Report-Only et parcourir les parcours sensibles : connexion Google,
   formulaires publics (`/agenda-public`, `/rejoindre`, avec Turnstile), photos et visuels,
   écoute audio, pièces jointes comptables, exports PDF, partages publics.
2. Écarter le bruit (extensions de navigateur : `chrome-extension://`, `moz-extension://`,
   outils de traduction) ; toute autre origine bloquée est soit à ajouter dans
   `src/lib/csp.ts` (ressource légitime), soit à investiguer.
3. Une fois le journal sans violation propre à l'application : `CSP_ENFORCE=true` dans
   `shared/.env`, puis `sudo systemctl restart koinonia`.
4. Retour arrière immédiat : vider `CSP_ENFORCE` et redémarrer.

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

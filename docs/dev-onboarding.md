# Environnement de développement — guide pas à pas

Ce guide permet de monter un environnement de développement complet de Koinonia sur un
poste personnel **Windows** ou **Linux**, sans avoir besoin de créer un compte Google
OAuth ni d'accéder à un quelconque service externe.

> Pour le déploiement en production, voir [`docs/production.md`](production.md) — sans rapport
> avec ce guide, qui ne concerne que le poste de travail d'un contributeur.

## 1. Prérequis

| Outil | Windows | Linux |
|---|---|---|
| Docker | [Docker Desktop](https://www.docker.com/products/docker-desktop/), avec le **backend WSL2** activé (proposé par défaut à l'installation) | [Docker Engine](https://docs.docker.com/engine/install/) + [plugin Docker Compose](https://docs.docker.com/compose/install/linux/) |
| Git | [Git for Windows](https://git-scm.com/download/win) | Le gestionnaire de paquets de la distribution (ex. `apt install git`) |

Node.js n'est **pas requis sur le poste hôte** : l'application tourne entièrement dans un
conteneur. Il n'est utile que si vous voulez lancer `npm run dev:*` comme raccourci plutôt
que les commandes `docker compose` complètes (voir étape 3).

Vérifier que Docker fonctionne :

```bash
docker --version
docker compose version
```

## 2. Cloner le dépôt

```bash
git clone https://github.com/iccbretagne/koinonia.git
cd koinonia
```

Aucun fichier `.env` à créer pour ce parcours : les variables nécessaires (base de
données, secret de session, connexion développement) sont déjà définies dans
`docker-compose.dev.yml`, avec des valeurs de développement uniquement.

## 3. Démarrer l'environnement conteneurisé

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

*(Raccourci équivalent si Node.js est installé sur l'hôte : `npm run dev:up`.)*

Cette commande démarre deux conteneurs :

- `db` — la base de données MariaDB
- `app` — l'application Next.js en mode développement (rechargement à chaud)

Le premier démarrage prend quelques minutes (installation des dépendances dans l'image).
Une fois les logs stabilisés, l'application est accessible sur **http://localhost:3000**.

Laissez cette commande tourner dans son terminal ; ouvrez un second terminal pour la suite.

## 4. Charger le jeu de données fictif

Dans un second terminal, à la racine du dépôt :

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec app npm run db:migrate:deploy
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec app npm run db:seed:dev
```

*(Raccourci équivalent : `npm run dev:reset` — combine les deux commandes ci-dessus.)*

Ce jeu de données est **entièrement fictif** (généré avec [Faker](https://fakerjs.dev/),
structure inspirée de manière non identifiable d'un usage réel — voir
`specs/015-environnement-dev-contributeurs/plan.md`) et **déterministe** : relancer cette
commande produit toujours exactement le même résultat. Il couvre trois églises (ICC
Kervignac, ICC Guingamp, ICC Landerneau), leurs ministères et départements, des membres
(STAR), des événements passés et à venir, plannings, absences, tâches, demandes, comptes
rendus, discipolat, salles et mains courantes, demandes financières, rendez-vous pastoraux et
suivis MSDP, demandes d'intégration et bergers, cultes audio, offres et profils de l'espace
Offres.

> **Date de référence fixe.** Pour rester déterministe, le jeu de données est construit autour
> d'un « aujourd'hui » figé (`TODAY` dans `prisma/seed-dev.ts`) : les cultes « à venir » le
> sont par rapport à cette date, pas à la date réelle. Passé cette date, « Mon planning »,
> l'accueil ou les grilles peuvent sembler vides : naviguer vers les semaines concernées, ou
> modifier temporairement `TODAY` (sans le commiter) avant de relancer le seed — c'est ce que
> fait la procédure des captures du guide ([guide-screenshots.md](guide-screenshots.md)).

## 5. Se connecter

Ouvrir **http://localhost:3000**. Sous le bouton « Se connecter avec Google », un second
bloc **« Développement uniquement »** propose une liste de comptes de test. Choisir un compte
et cliquer sur « Se connecter avec ce compte » : aucun mot de passe, aucun compte Google
requis.

| Compte | Rôle |
|---|---|
| `super-admin` | Super Admin |
| `admin` | Admin de l'église |
| `secretaire` | Secrétaire |
| `ministre` | Ministre |
| `resp-accueil`, `resp-secretariat` | Responsable de département |
| `faiseur-disciples` | Faiseur de Disciples |
| `reporter` | Reporter |
| `star` | STAR (compte lié à une fiche membre) |

Les rôles Référent soins pastoraux et Comptable n'ont pas de compte dédié : les attribuer à un
compte de test depuis **Administration → Accès** (connecté en `super-admin` ou `admin`).

La liste complète des comptes de test (rôle, périmètre) est documentée dans
[`prisma/fixtures/dev-users.ts`](../prisma/fixtures/dev-users.ts). Pour tester le
comportement d'un autre rôle, il suffit de se déconnecter et de choisir un autre compte
dans cette même liste — aucune reconfiguration n'est nécessaire.

> Ce mode de connexion n'existe que parce que `AUTH_DEV_LOGIN=true` est défini dans
> `docker-compose.dev.yml`. Il est impossible qu'il s'active en production : le code le
> désactive systématiquement dès que `NODE_ENV=production`, en plus de l'absence de cette
> variable dans toute configuration de déploiement (voir `docs/production.md`).

### Utiliser un vrai compte Google (optionnel)

Si vous devez valider spécifiquement le parcours de connexion Google (ex. avant une
release touchant l'authentification), c'est toujours possible en complément : créez un
client OAuth Google, renseignez `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` dans
`docker-compose.dev.yml` (ou passez par un fichier `.env` monté dans le conteneur), et le
bouton « Se connecter avec Google » fonctionnera normalement en parallèle du bloc
développement.

## 6. Réinitialiser l'environnement

Pour repartir d'une base vierge (même structure, mêmes données fictives) :

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec app npm run db:seed:dev
```

*(Raccourci : `npm run dev:reset`.)*

Pour repartir d'un environnement totalement neuf (supprime aussi les données de la
base MariaDB elle-même) :

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
# puis reprendre à l'étape 4
```

## 7. Arrêter l'environnement

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

*(Raccourci : `npm run dev:down`.)* Les données de la base sont conservées (volume
Docker persistant) tant que l'option `-v` n'est pas utilisée.

## Ce qui ne fonctionne pas sans configuration

L'environnement conteneurisé ne branche aucun service externe. Concrètement :

- **Fichiers** : sans variables S3 (`MEDIA_S3_*`/`BACKUP_S3_*`, voir `.env.example`), le dépôt
  de photos, de visuels et de fichiers audio échoue. Seules les pièces jointes de la
  comptabilité ont un repli sur le disque local quand `ACCOUNTING_S3_*` est absent.
- **Traitement audio** : le worker (analyse, découpage, rendu des cultes) ne tourne pas dans
  le conteneur. Le lancer à part avec `npm run worker`, ce qui demande `ffmpeg`/`ffprobe` et un
  stockage S3 configuré.
- **Emails** : sans `SMTP_*`, l'envoi échoue et l'erreur est journalisée ; les notifications
  dans l'application, elles, fonctionnent.
- **Formulaires publics** (`/agenda-public`, `/rejoindre`) : utilisables grâce aux clés de test
  Cloudflare Turnstile de `docker-compose.dev.yml`, dont le défi réussit toujours.

## Environnement de formation (structure réelle)

Pour une session de formation, le seed peut reprendre la structure réelle d'une église (églises,
ministères, départements, comptes et rôles) tout en fabriquant le contenu (membres, plannings…) :

```bash
# Export depuis Administration → Sauvegardes → « Exporter la configuration »
npm run fixture:training -- export.json prisma/fixtures/training-real.json
npm run db:seed:training
```

Le fichier produit contient de vrais emails : il n'est **jamais commité**. Les fiches membres,
les liaisons compte ↔ fiche et les adresses de notification de l'export sont volontairement
ignorées (détail dans `prisma/scripts/build-training-fixture.ts` et `prisma/fixtures/active.ts`).

## Dépannage

- **Le rechargement à chaud ne réagit pas aux modifications (fréquent sur Windows)** :
  vérifier que le dépôt est bien cloné **à l'intérieur du système de fichiers WSL2**
  (ex. `\\wsl$\...` ou directement dans un terminal WSL2), pas sur un chemin Windows
  monté (`C:\...`) — les événements de fichiers y sont peu fiables avec Docker Desktop.
- **`docker compose` indisponible** : sur les installations anciennes, la commande peut
  être `docker-compose` (avec un tiret) au lieu de `docker compose`.
- **Le conteneur `app` redémarre en boucle** : consulter ses logs avec
  `docker compose -f docker-compose.yml -f docker-compose.dev.yml logs app`.

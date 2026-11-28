# Koinonia

**Le back-office opérationnel de votre église, en une seule application.**

Koinonia est né d'un constat simple : la vie de service d'une église finissait dispersée entre
des groupes WhatsApp et des tableaux Excel. L'information s'y noie dans le flux, les plannings
se recopient à la main, et plus personne ne sait quelle version fait foi.

Du planning de service à la publication audio des cultes — en passant par les comptes rendus, le
discipolat, les demandes internes, les médias, les salles, la comptabilité et l'agenda pastoral —
Koinonia rassemble tout cela derrière une source de vérité unique, avec un accès adapté à chaque
rôle. Auto-hébergée, multi-tenant, sous licence libre et pensée pour le mobile.

> **Koinonia** (grec : *communion, partage*) — Conçue pour ICC Bretagne, adaptable à toute église structurée en ministères et départements.

## Fonctionnalités

- **Planning de service** — grille par département, vue mensuelle, duplication, disponibilités et absences, événements d'équipe
- **Événements et comptes rendus** — récurrence, calendrier, saisie des comptes rendus avec statistiques, exports
- **Discipolat** — relations faiseur de disciples / disciple, appel par événement, export
- **Demandes internes** — annonces, visuels, réseaux sociaux, secrétariat, avec workflow de validation
- **Audio des cultes** — dépôt, découpage, normalisation, publication, bibliothèque d'écoute et liens publics
- **Médias** — photos, visuels, galerie et partage de sélections
- **Personnes** — répertoire STAR, liaison de compte, candidatures au service, intégration des nouveaux, suivi pastoral
- **Finances** — demandes financières et justificatifs, navette, trésorerie, dons
- **Billetterie, formulaires, campagnes de collecte** — inscriptions publiques, sondages, questionnaires, sites d'événement
- **Salles, emploi, agenda pastoral**
- **Assistant et connexion d'assistants IA (MCP)** — aide à la prise en main, lecture et actions confirmées selon les droits
- **10 rôles** (RBAC par église) : Super Admin, Admin, Secrétaire, Ministre, Resp. département, Faiseur de Disciples, Reporter, STAR, Référent soins pastoraux, Comptable
- **Multi-tenant** — plusieurs églises isolées sur une même instance
- **PWA** — installation mobile, notifications natives, écrans de terrain hors ligne

Les modules sont activables un à un (`ENABLED_MODULES`) ; la liste fait foi dans `src/modules/`.

## Démarrage rapide

Essayer Koinonia en local, sans compte Google ni `.env` (Docker requis) :

```bash
git clone https://github.com/iccbretagne/koinonia.git && cd koinonia
npm run dev:up                  # app + MariaDB en conteneurs (laisser tourner)
# dans un second terminal :
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec app npm run db:migrate:deploy
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec app npm run db:seed:dev
# puis http://localhost:3000 → comptes de test sous le bouton Google
```

Environnement avec Node.js sur l'hôte, `.env`, OAuth Google : voir
[CONTRIBUTING.md](CONTRIBUTING.md#2-installer-lenvironnement) et
[docs/dev-onboarding.md](docs/dev-onboarding.md).

## Stack

Node.js 22 · Next.js 16 · React 19 · Tailwind CSS 4 · NextAuth v5 (beta) · Prisma 7 · MariaDB 10.11 · TypeScript 5 · Zod 3 · Vitest · Playwright

Monolithe modulaire : des modules métier déclarés par manifeste, assemblés au démarrage par un
registre, aux frontières vérifiées en CI. Vue d'ensemble : [architecture](docs/architecture.md) et
[ADR](docs/adr/README.md).

## Documentation

| Je veux… | Aller à |
|---|---|
| **Contribuer** (setup, conventions, checklist de PR) | [CONTRIBUTING.md](CONTRIBUTING.md) |
| **Déployer et exploiter** une instance | [docs/deploiement/](docs/deploiement/README.md) |
| Tout trouver | [docs/README.md](docs/README.md) |
| Signaler une faille | [SECURITY.md](SECURITY.md) |
| Suivre les versions | [CHANGELOG.md](CHANGELOG.md), [roadmap](docs/roadmap.md) |
| Contexte pour un agent IA | [CLAUDE.md](CLAUDE.md) |

Les fonctionnalités sont spécifiées avant d'être codées (`specs/`, voir [specs/README.md](specs/README.md)).

## Licence

[Apache License 2.0](LICENSE)

# Documentation de Koinonia

Carte de toute la documentation, par public. Pour contribuer, commencer par
[CONTRIBUTING.md](../CONTRIBUTING.md) ; pour déployer, par le
[guide de déploiement](deploiement/README.md).

## Je veux contribuer au code

| Document | Contenu |
|---|---|
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Installer, conventions de branches et de commits, checklist de PR, politique de tests |
| [dev-onboarding.md](dev-onboarding.md) | Environnement conteneurisé, jeu de données fictif, connexion sans Google OAuth |
| [architecture.md](architecture.md) | Structure du code, couche modules, patterns |
| [auth.md](auth.md) | NextAuth, rôles, matrice des permissions, gardes |
| [database.md](database.md) | Schéma Prisma, modèles, relations |
| [api.md](api.md), [openapi.json](openapi.json) | Conventions d'API ; référence des endpoints générée (Swagger UI : `/plateforme/api`) |
| [adr/](adr/README.md) | Décisions d'architecture structurantes (ADR) |
| [design-system/](design-system/README.md) | Charte, tokens, composants, table de conversion |
| [e2e.md](e2e.md) | Harnais Playwright : navigation par rôle, accessibilité |
| [sonar.md](sonar.md) | Analyse SonarCloud |
| [../specs/](../specs/README.md) | Spécifications par fonctionnalité et [constitution](../specs/constitution.md) |
| [roadmap-modularite.md](roadmap-modularite.md) | Chantiers de modularité (état figé, voir son bandeau) |

## Je veux déployer ou exploiter

| Document | Contenu |
|---|---|
| [deploiement/README.md](deploiement/README.md) | Point d'entrée : pipeline, première installation, release, rollback, checklist, dépannage |
| [deploiement/serveur.md](deploiement/serveur.md) | Système, base de données, systemd, Traefik, OAuth |
| [deploiement/configuration.md](deploiement/configuration.md) | Référence des variables d'environnement, SMTP, S3, modules, sites |
| [deploiement/ci-cd.md](deploiement/ci-cd.md) | Workflows GitHub, secrets, accès de déploiement |
| [deploiement/exploitation.md](deploiement/exploitation.md) | Cron, worker audio, sauvegardes et restauration, scripts S3 |
| [deploiement/runbooks.md](deploiement/runbooks.md) | Opérations manuelles ponctuelles (bascule spec 092…) |
| [staging.md](staging.md) | Environnement de recette |
| [security-exceptions.md](security-exceptions.md) | Limites de sécurité connues et acceptées |
| [todo-separation-comptes-deploiement.md](todo-separation-comptes-deploiement.md) | Chantier ouvert : séparer compte runtime et compte de déploiement |
| [guide-screenshots.md](guide-screenshots.md) | Produire les captures du guide utilisateur |
| [../SECURITY.md](../SECURITY.md) | Signaler une vulnérabilité |
| [../CHANGELOG.md](../CHANGELOG.md) | Historique des versions |

## Je veux comprendre le produit

| Document | Contenu |
|---|---|
| [../README.md](../README.md) | Présentation et démarrage rapide |
| [processus/](processus/README.md) | Comment chaque demande se traite : qui déclenche, qui instruit, quels états |
| [roadmap.md](roadmap.md) | Évolutions réalisées et prévues |
| [dat.md](dat.md) | Dossier d'architecture technique (vue d'ensemble, à réviser) |

## Je suis un agent IA

[CLAUDE.md](../CLAUDE.md) (chargé automatiquement par Claude Code) contient les conventions, la
matrice des rôles et les spécificités de chaque module ; [AGENTS.md](../AGENTS.md) renvoie vers
lui. Les règles de contribution de [CONTRIBUTING.md](../CONTRIBUTING.md) s'appliquent à l'identique.

## Documents historiques ou datés

Conservés pour mémoire, signalés par un bandeau en tête :

| Document | Pourquoi |
|---|---|
| [production.md](production.md) | Scindé en [deploiement/](deploiement/README.md) ; ne subsiste que comme table de renvoi |
| [migration-v1.0.md](migration-v1.0.md) | Mise à niveau v0.19 → v1.0, terminée |
| [roadmap-modularite.md](roadmap-modularite.md) | Suivi figé à la v1.22.0 |
| [dat.md](dat.md) | Décrit la v1.19.0 ; principes valables, chiffres périmés |
| [ticket-editor-v2.md](ticket-editor-v2.md) | Note de réalisation de la spec 088 |
| [campagnes-f9-2026.md](campagnes-f9-2026.md) | Mode d'emploi daté d'une campagne |
| [examples/](examples/ticket-v2) | Jeux d'exemple de la spec 088 |

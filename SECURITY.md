# Politique de sécurité

## Versions supportées

Seule la dernière version stable de Koinonia reçoit des correctifs de sécurité.

| Version | Supportée |
|---------|-----------|
| 0.15.x (latest) | :white_check_mark: |
| < 0.15 | :x: |

## Signaler une vulnérabilité

**Ne pas ouvrir d'issue publique GitHub pour signaler une faille de sécurité.**

Si vous découvrez une vulnérabilité, merci de la signaler de manière responsable en envoyant un e-mail à :

**iccrennes35@gmail.com**

### Informations à inclure

Pour nous permettre de traiter votre signalement rapidement, veuillez inclure :

- Une description claire de la vulnérabilité
- Les étapes pour la reproduire
- L'impact potentiel (données exposées, actions possibles, etc.)
- Votre environnement (navigateur, OS, version de l'application si connue)
- Toute suggestion de correction si vous en avez

### Ce qui est dans le périmètre

- Contournement d'authentification ou d'autorisation (RBAC)
- Accès non autorisé aux données d'une église (isolation multi-tenant)
- Injections (SQL, XSS, CSRF, etc.)
- Exposition de données personnelles (membres, utilisateurs)
- Escalade de privilèges entre rôles

### Ce qui est hors périmètre

- Vulnérabilités dans les dépendances tierces non exploitables dans ce contexte (signalez-les directement aux projets concernés)
- Attaques nécessitant un accès physique à la machine serveur
- Ingénierie sociale

## Délais de traitement

| Étape | Délai cible |
|-------|-------------|
| Accusé de réception | 72 heures |
| Évaluation initiale | 7 jours |
| Correctif et release | Selon la criticité (1–30 jours) |

Nous vous tiendrons informé de l'avancement et mentionnerons votre contribution dans le changelog si vous le souhaitez.

## Divulgation responsable

Nous vous demandons de ne pas divulguer publiquement la vulnérabilité avant qu'un correctif ait été publié et que les utilisateurs aient eu le temps de mettre à jour. Nous nous engageons à traiter les signalements avec sérieux et discrétion.

Merci de contribuer à la sécurité de Koinonia.

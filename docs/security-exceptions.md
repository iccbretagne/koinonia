# Exceptions sécurité acceptées — v1.0

## npm audit

| Package | Sévérité | CVE / GHSA | Raison | Plan de sortie |
|---|---|---|---|---|
| nodemailer | moderate | GHSA-… | Dépendance transitive de next-auth beta ; nodemailer@7 est requis mais @auth/core attend ^6.8.0. Aucun fix disponible sans changer next-auth. Impact runtime limité (SMTP sortant uniquement). | Résoudre avec la migration next-auth beta → stable (SEC-001). Réévaluer au 2026-07-17. |
| dompurify | moderate | — | Vulnérabilité transitive sans vecteur d'attaque identifié dans le contexte Koinonia (aucun HTML non maîtrisé sanitisé côté serveur). | Corriger via `npm audit fix` dès qu'un fix non-breaking est disponible (SEC-002). |

## npm ls (arbre invalide)

next-auth beta (v5 beta) exige nodemailer@^6.8.0 mais nodemailer@7.x est installé.
Résolu partiellement : aucune incompatibilité runtime connue. Ticket SEC-001.

## Tickets de suivi

- **SEC-001** : Migrer next-auth beta → stable (v5 stable ou équivalent)
- **SEC-002** : `npm audit fix` pour dompurify
- **SEC-003** : Ajouter tests P0-1 pour `media-projects/[id]/share`
- **SEC-004** : Audit trail validateur media (tokenId, timestamp, statut précédent) — HIGH-2 partiel

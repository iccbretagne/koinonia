# Plan technique — [NOM DE LA FEATURE]

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon | Validé
- **Mis à jour le** : AAAA-MM-JJ

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [ ] **Frontières modules** : les imports `src/app/` → module passent par l'index (`@/modules/X`)
- [ ] **Sécurité** : toutes les routes protégées par `requireAuth`/`requirePermission` ; multi-tenant `churchId` respecté
- [ ] **Permissions** via `rolePermissions` (`@/lib/registry`)
- [ ] **Validation** Zod sur toutes les mutations
- [ ] **Migration** Prisma prévue si le schéma change (pas de `db push`)
- [ ] **Enums** importés depuis `@/generated/prisma/client`
- [ ] **UI** : composants `src/components/ui/` réutilisés avant création

## Approche générale

*En quelques phrases : comment on s'y prend, quel est le fil directeur.*

## Modèle de données

*Nouveaux modèles / champs Prisma, relations, migration. `[Aucun changement]` si applicable.*

```prisma
// esquisse des modifications de schema.prisma
```

## API

*Endpoints ajoutés/modifiés, méthode, permission requise, schéma Zod (entrée/sortie).*

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/…` | POST | `x:manage` | `{…}` | `{…}` |

## Services / logique métier

*Fonctions dans `src/modules/X/services/`, événements sur le bus si concerné.*

## UI / composants

*Pages, composants serveur/client, réutilisation `components/ui/`.*

## Décisions & alternatives écartées

*Choix techniques notables et pourquoi les autres options ont été rejetées.*

- **Choix** : … — *Pourquoi* : …
- **Écarté** : … — *Raison* : …

## Risques & points d'attention

- …

## Stratégie de tests

*Ce qui sera couvert par des tests unitaires (Vitest) et comment.*

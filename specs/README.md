# Spec-Driven Development — Koinonia

Ce dossier contient les **spécifications** des fonctionnalités de Koinonia.
Chaque feature non triviale est décrite avant d'être codée, selon le flux :

```
/specify  →  /plan  →  /tasks  →  /implement
  spec.md     plan.md   tasks.md    (code + PR)
```

## Le principe

Le code n'est pas la source de vérité de l'intention — la **spec** l'est.
On écrit d'abord *ce qu'on veut* et *pourquoi* (sans technique), puis *comment*
(le plan), puis *le découpage* (les tâches), et seulement ensuite on implémente.
Cela force la réflexion en amont, documente les décisions, et rend l'implémentation
par l'agent IA beaucoup plus fiable.

## Structure

```
specs/
├── constitution.md          # principes non-négociables (lus par toutes les commandes)
├── README.md                # ce fichier
├── templates/               # gabarits
│   ├── spec-template.md
│   ├── plan-template.md
│   └── tasks-template.md
└── NNN-nom-feature/         # un dossier par feature (numéroté)
    ├── spec.md              # QUOI & POURQUOI — comportement, critères d'acceptation
    ├── plan.md              # COMMENT — approche technique, fichiers, migrations
    └── tasks.md             # DÉCOUPAGE — tâches ordonnées et vérifiables
```

## Les commandes

| Commande | Rôle | Produit |
|---|---|---|
| `/specify <description>` | Décrit une nouvelle feature (quoi/pourquoi) | `specs/NNN-nom/spec.md` |
| `/plan` | Traduit la spec en approche technique | `specs/NNN-nom/plan.md` |
| `/tasks` | Découpe le plan en tâches exécutables | `specs/NNN-nom/tasks.md` |
| `/implement` | Exécute les tâches, vérifie, ouvre la PR | code + branche |

Chaque commande sans argument opère sur la **feature la plus récente** (dossier `specs/`
modifié en dernier). On peut cibler une feature précise en passant son numéro ou son slug.

## Exemple de bout en bout

```
/specify Permettre à un STAR de signaler son indisponibilité sur une plage de dates
# → crée specs/012-indisponibilite-plage/spec.md

/plan
# → lit la spec + la constitution, produit plan.md (modèle Prisma, API, UI, migration)

/tasks
# → produit tasks.md : migration → service → route API → composant → tests

/implement
# → crée la branche feat/indisponibilite-plage, exécute les tâches,
#   lance typecheck/lint/test, ouvre la PR
```

## Règles

- La **spec** ne contient aucune décision technique (pas de nom de table, de lib, d'endpoint).
- Le **plan** respecte `constitution.md` (migrations Prisma, frontières modules, `requireAuth`, Zod…).
- Une feature triviale (fix d'une ligne, renommage) ne nécessite pas de spec.
- Les specs sont versionnées avec le code : elles vivent dans le repo et évoluent en PR.

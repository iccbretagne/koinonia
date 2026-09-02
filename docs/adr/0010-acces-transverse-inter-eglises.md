# ADR-0010 — Accès transverse inter-églises borné au module demandeur

- **Statut** : Accepté
- **Date** : 2026-09-02

## Contexte

ADR-0002 pose l'isolation multi-tenant : chaque donnée porte un `churchId`, et
`requireChurchPermission(permission, churchId)` est le garde générique qui la fait respecter
pour l'ensemble de l'application. Cette isolation est la propriété de sécurité la plus
structurante du projet — une régression y expose les données de toutes les églises hébergées.

Or le besoin de percer cette isolation apparaît, et va réapparaître. Deux cas existent déjà :

1. **Le profil pastoral** — un responsable pastoral doit lire les données de plusieurs églises
   sans y détenir de rôle. Cette dérogation a été implémentée **à l'intérieur** de
   `requireChurchPermission` : quand l'utilisateur n'a aucun rôle dans l'église visée, le garde
   retombe sur une liste blanche `PASTORAL_READ_PERMISSIONS` croisée avec
   `session.user.pastoralChurchIds`.
2. **Le partage de bibliothèque audio** (spec 036) — une église ouvre sa bibliothèque de cultes
   publiés à une autre église, dont les membres peuvent alors l'écouter sans y détenir de rôle.

Le réflexe naturel, face au second cas, était de réutiliser le mécanisme du premier : ajouter
`audio:listen` à une liste blanche dans `requireChurchPermission`. Ce réflexe est le piège que
cet ADR ferme.

Les deux cas ne sont pas de même nature. Le profil pastoral est un accès transverse **attaché à
une personne** : il est porté par la session, connu du socle d'authentification, et concerne des
permissions de lecture génériques déjà transverses par construction. Le partage de bibliothèque
est un accès transverse **attaché à une église** et à **un module** : il dépend d'une relation
métier (`AudioLibraryShare`) que le socle n'a aucune raison de connaître, et ne vaut que pour une
seule permission d'un seul domaine.

Élargir le garde générique pour le second cas aurait signifié : faire dépendre le contrôle
d'accès de **toute** l'application d'une table métier appartenant à **un** module, et étendre la
surface de la fonction qui protège l'ensemble du multi-tenant à chaque nouveau besoin de partage.

## Décision

**Un accès transverse entre églises propre à un domaine s'implémente par un helper dédié à ce
domaine, jamais en élargissant `requireChurchPermission`.**

Concrètement :

- `requireChurchPermission` reste réservé à l'isolation multi-tenant générique. Les seules
  dérogations qu'il porte sont celles **attachées à la session** et transverses par nature — à ce
  jour, le Super Admin et le profil pastoral.
- Tout autre partage inter-églises expose un helper nommé, voisin de ceux du domaine concerné
  dans `src/lib/auth.ts`, qui reproduit la chaîne habituelle (Super Admin → rôle dans l'église
  visée → dérogation métier → `FORBIDDEN`). Pour la spec 036 :
  `requireAudioListenAccess(churchId)`.
- La relation métier qui autorise le partage reste **dans le module**, exposée par son index
  (`@/modules/audio`), et consommée par le helper en import dynamique — comme le fait déjà
  `requireAudioAccess` avec `isCaptureTeamMember` (ADR-0004).
- Le helper accorde **une capacité, pas un statut** : il autorise exactement l'action pour
  laquelle il existe, et rien d'autre. Un partage de bibliothèque n'ouvre ni l'écriture, ni les
  autres permissions de l'église propriétaire, ni la génération de liens publics sur son contenu.

**Exigence de non-régression** : tout helper de ce type est couvert par un test de
non-contamination — l'utilisateur qui passe le helper se voit toujours refuser les permissions
voisines dans l'église concernée (`src/lib/__tests__/auth-audio-sharing.test.ts`). Et le corpus
d'isolation existant du module doit rester **inchangé** : si un test d'isolation doit être
assoupli pour faire passer le partage, c'est le signal que la dérogation a débordé.

## Alternatives considérées

- **Étendre `PASTORAL_READ_PERMISSIONS` (ou une liste blanche analogue) dans
  `requireChurchPermission`** — *Écarté* : ferait dépendre le garde générique de tout le
  multi-tenant d'une table métier propre à un module, et rendrait chaque futur partage une
  modification du code le plus sensible du projet. Le rayon d'explosion d'une erreur passerait de
  « l'écoute audio » à « toutes les données de toutes les églises ».
- **Modéliser une hiérarchie d'églises** (église mère / églises filles, réseau) et en déduire les
  accès — *Écarté* : introduit une structure durable et difficile à défaire pour un besoin que des
  octrois dirigés couvrent entièrement, et impose une sémantique (la fille hérite de la mère) que
  le besoin réel ne demandait pas. Voir `specs/036-partage-bibliotheque-audio/plan.md`.
- **Un middleware générique de partage inter-églises**, configuré par module — *Écarté* :
  prématuré avec un seul cas d'usage. La règle posée ici n'interdit pas de le construire le jour
  où trois modules porteront le même motif ; elle garantit surtout qu'entre-temps chaque
  dérogation reste lisible et testable isolément.

## Conséquences

- **Positif** : le rayon d'explosion d'une régression est borné au domaine qui a demandé le
  partage. Une erreur dans `requireAudioListenAccess` ouvre des enregistrements de culte, pas le
  planning ni les membres.
- **Positif** : chaque dérogation est nommée, donc lisible en revue et testable seule. Un
  relecteur voit immédiatement quelle capacité est élargie et pour qui.
- **Positif** : `requireChurchPermission` reste stable. Le fichier le plus sensible du projet ne
  grossit pas à chaque nouveau besoin fonctionnel.
- **Négatif** : la logique d'autorisation est répartie sur plusieurs helpers plutôt que
  centralisée. Il n'existe pas un endroit unique où lire l'ensemble des dérogations — d'où le
  tableau récapitulatif des accès transverses maintenu dans `docs/auth.md` et le DAT (§7).
- **Négatif / risque** : rien au typecheck n'empêche un développeur d'appeler
  `requireChurchPermission` là où le helper dédié était attendu — la route fonctionnerait, en
  refusant simplement les utilisateurs légitimes du partage. La détection reste la revue et les
  tests de comportement.
- **Conséquence pratique** : tout nouveau besoin de partage inter-églises crée un helper dédié et
  met à jour le tableau des accès transverses de `docs/auth.md` et du DAT. Il ne modifie pas
  `requireChurchPermission`.

## Références

- `specs/036-partage-bibliotheque-audio/spec.md`, `plan.md`, `tasks.md`
- PR #510
- `src/lib/auth.ts` (`requireChurchPermission`, `requireAudioAccess`,
  `requireAudioListenAccess`, `PASTORAL_READ_PERMISSIONS`)
- `src/modules/audio/services/sharing.ts`
- ADR-0002 (multi-tenant par `churchId`) — cet ADR définit la seule manière sanctionnée d'y
  déroger
- ADR-0004 (import dynamique anti-cycle) — mécanisme utilisé pour consommer le module depuis
  `src/lib/auth.ts`
- ADR-0009 (garde de périmètre explicite) — même philosophie : la garde est posée explicitement
  au point d'entrée, jamais déduite implicitement

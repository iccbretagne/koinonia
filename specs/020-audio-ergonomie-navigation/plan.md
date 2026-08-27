# Plan technique — Ergonomie et navigation du module audio

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-08-26

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Constat préalable — une partie de la spec est déjà livrée

Entre l'écriture de la spec et ce plan, le commit `43e32e4` (« fix(audio): ajouter le module à
la navigation ») a déjà posé le point d'entrée principal et le lien de configuration. Ce plan
prend acte de cet état réel plutôt que de le refaire :

- **Fait** : `src/app/(auth)/layout.tsx` pousse déjà un lien `/audio` dans `mediaLinks` — rendu
  par `Sidebar.tsx` dans la section **Opérations**, aux côtés des Médias, exactement
  l'emplacement retenu dans la spec. La condition de visibilité est déjà
  `audio:view` **ou** `isCaptureTeamMember(currentChurchId, departments)` — le point de
  vigilance de la spec sur la nature différente de cette information est donc déjà résolu par le
  code existant, pas à inventer.
- **Fait** : `configLinksDef` porte déjà `/admin/audio/settings` sous la permission
  `audio:manage` — l'écran que l'Admin ne trouvait pas est déjà relié à la navigation.
- **Fait** : la section n'est pas dans `BottomNav.tsx` (vérifié — aucune mention audio) : le
  critère « pas dans la barre du bas » est déjà respecté par omission.
- **Reste à faire**, et c'est le périmètre réel de ce plan : renommer le libellé en
  « Audio évènements », le retour vers la file d'attente depuis un culte ouvert, le signalement
  d'un enregistrement sur la fiche d'un événement (au-delà de la feuille de service STAR), la
  récupération du lien d'écoute après publication, la prise en charge des enregistrements sans
  événement (vocabulaire + type de rassemblement), et la hiérarchie visuelle des actions d'un
  culte.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : tout accès aux services audio depuis `src/app/` passe par
      `@/modules/audio` (index). La nouvelle logique (lien de partage principal, type de
      rassemblement) s'ajoute aux services existants, pas de nouveau module.
- [x] **Sécurité** : les routes touchées restent sous `requireAudioAccess` /
      `requireAudioUnpublishAccess` ; la fiche d'événement passe par `requireAuth` (déjà en
      place pour `star-view`) et vérifie `churchId`.
- [x] **Permissions** via `rolePermissions` — aucune nouvelle permission introduite ; réutilise
      `audio:view` / `audio:manage` / `audio:review` existantes.
- [x] **Validation** Zod sur la seule mutation ajoutée (`PATCH` du type de rassemblement, inclus
      dans le schéma existant de `PATCH /api/audio/services/[id]`).
- [x] **Migration** Prisma prévue : ajout d'un champ `type` sur `AudioService` (voir Modèle de
      données).
- [x] **Enums** : le type de rassemblement n'est **pas** un enum Prisma — voir Décisions, il
      reprend la nomenclature `EVENT_TYPES` de `@/lib/event-types` (chaîne, pas de liste fermée
      côté base, à l'image du champ `Event.type` existant).
- [x] **UI** : réutilise `Modal`, `Button`, `Select`, `DataTable` de `src/components/ui/` ;
      aucun nouveau composant générique.

## Approche générale

Cinq chantiers indépendants, tous des modifications d'écrans et de services déjà en place — pas
de nouvelle route structurante :

1. **Vocabulaire** : renommer les libellés « culte » → « enregistrement », l'entrée de
   navigation → « Audio évènements ». Purement textuel.
2. **Type de rassemblement** : nouveau champ `AudioService.type`, dérivé de l'événement rattaché
   quand il existe, saisi sinon, affiché dans la file d'attente et le formulaire de dépôt.
3. **Navigation dans le module** : fil d'Ariane / bouton retour depuis un culte ouvert vers la
   file d'attente.
4. **Lien croisé événement ↔ audio** : étendre `star-view` (déjà PUBLISHED-only, inchangé) et
   ajouter l'équivalent sur la fiche d'événement `/admin/events/[eventId]` et `/events/[eventId]`
   pour les utilisateurs ayant accès au module, incluant les enregistrements en préparation.
5. **Lien d'écoute depuis la publication** : afficher et permettre de copier le lien de partage
   principal (`getOrCreatePrimaryShareToken`, déjà exporté) depuis `AudioServiceClient`, avec
   avertissement à la dépublication.

Le chantier ergonomie des actions (hiérarchie visuelle déposer/publier/dépublier/supprimer) est
un ajustement de style sur les écrans existants, traité avec chaque chantier plutôt qu'en bloc
séparé.

## Modèle de données

```prisma
model AudioService {
  id              String             @id @default(cuid())
  churchId        String
  planningEventId String?            @unique
  serviceDate     DateTime
  title           String?
  speaker         String?
+ type            String             @default("AUTRE") // nomenclature @/lib/event-types (EVENT_TYPES)
  coverKey        String?            @db.VarChar(512)
  status          AudioServiceStatus @default(DRAFT)
  publishedAt     DateTime?
  publishedById   String?
  openCount       Int                @default(0)
  // … reste inchangé
}
```

- Migration `prisma migrate dev` ajoutant `type` avec valeur par défaut `"AUTRE"` — les
  enregistrements existants (tous des cultes en pratique) héritent d'une valeur cohérente sans
  script de backfill dédié ; un backfill à `"CULTE"` pour les lignes déjà rattachées à un
  événement de type `CULTE` peut suivre dans la migration de données si l'historique le
  justifie, décision laissée à l'implémentation selon le volume réel en base au moment du merge.
- Pas de `@relation` supplémentaire : le type est une valeur recopiée au moment du dépôt (voir
  Décisions), pas une jointure permanente vers `Event.type` — cohérent avec `serviceDate`, déjà
  traité de la même façon (§ commentaire ligne 1882 du schéma).

## API

| Endpoint | Méthode | Permission | Entrée (changement) | Sortie (changement) |
|---|---|---|---|---|
| `/api/audio/services` | POST | `requireAudioAccess("audio:upload")` | `+ type?: string` — ignoré si `planningEventId` fourni (dérivé de l'événement) | `+ type` |
| `/api/audio/services/[id]` | PATCH | `requireAudioAccess("audio:upload")` | `+ type?: string`, validé contre `EVENT_TYPES` | `+ type` |
| `/api/audio/services/[id]` | GET | `requireAudioAccess("audio:view")` | inchangé | `+ type`, `+ shareUrl: string \| null` (présent seulement si `status === "PUBLISHED"`) |
| `/api/audio/services` (liste, dans la page serveur) | — | `requireAudioAccess("audio:view")` | inchangé | `+ type` par ligne |
| `/api/events/[eventId]/star-view` | GET | `requireAuth` (existant) | inchangé | inchangé — comportement PUBLISHED-only conservé tel quel |

**Pas de nouvel endpoint API pour la fiche d'événement.** `src/app/(auth)/admin/events/[eventId]/page.tsx`
est un Server Component qui interroge Prisma directement et gate déjà l'accès sur
`requireChurchPermission("events:manage", ...)`. Or `events:manage` (Super Admin, Admin,
Secrétaire — voir tableau des permissions du `CLAUDE.md`) est un sous-ensemble strict des rôles
qui ont déjà `audio:view`. **Personne qui atteint cette page n'a besoin d'un contrôle d'accès
audio supplémentaire** : quiconque peut ouvrir la fiche peut déjà voir l'état d'un enregistrement
rattaché. Le plan ajoute simplement un `prisma.audioService.findUnique({ where: { planningEventId: eventId } })`
dans la requête existante de la page, sans nouveau endpoint ni permission additionnelle.

**Détail Zod** (`PATCH /api/audio/services/[id]`, schéma déjà existant dans la route) :

```ts
const schema = z.object({
  title: z.string().max(200).optional(),
  serviceDate: z.string().datetime().optional(),
  speaker: z.string().max(200).optional(),
  type: z.string().min(1).optional(), // même contrainte que Event.type (src/app/api/events/route.ts) :
                                       // EVENT_TYPES est une contrainte d'interface (le Select), pas
                                       // une contrainte serveur — pas d'ajout de rigueur hors de ce
                                       // que le type déjà en place s'impose à lui-même.
});
```

Le lien d'écoute n'a pas besoin d'un endpoint dédié : `getOrCreatePrimaryShareToken` est déjà
exporté par `@/modules/audio` et déjà appelé côté `star-view` — le plan l'appelle simplement
aussi depuis le `GET /api/audio/services/[id]` consommé par la page du culte, pour ne pas
multiplier les allers-retours réseau à l'ouverture de l'écran.

## Services / logique métier

- **`src/modules/audio/services/service.ts`** — `CreateAudioServiceInput` et
  `UpdateAudioServiceInput` gagnent `type?: string`. Dans `createAudioService` : si
  `planningEventId` est fourni, le type est lu sur l'`Event` rattaché (`select: { type: true }`)
  et écrase toute valeur saisie manuellement — cohérent avec le scénario spec « le type de
  l'événement s'applique sans ressaisie ». Sans rattachement, la valeur saisie est utilisée telle
  quelle, ou `"AUTRE"` par défaut.
- **`src/modules/audio/services/service.ts`** — `updateAudioService` : si `planningEventId`
  change (rattachement a posteriori, déjà pris en charge côté 019), le `type` est re-dérivé de
  l'événement de la même façon.
- **Aucun changement à `publish.ts` / `tokens.ts`** : `getOrCreatePrimaryShareToken` existe déjà
  avec la bonne signature ; il est simplement appelé depuis un point d'entrée de plus (route GET
  du culte, au lieu de `star-view` uniquement).
- **Nouveau petit helper** dans `src/modules/audio/services/service.ts` ou réutilisation directe
  dans la route : construire l'URL absolue `/ecouter/${token.token}` — actuellement dupliqué
  littéralement dans `star-view/route.ts` (`` `/ecouter/${...}` ``) ; à factoriser en une fonction
  exportée (`buildPublicAudioUrl(token: string): string`) pour éviter un deuxième endroit où le
  chemin `/ecouter/` est écrit en dur.

## UI / composants

- **`src/components/Sidebar.tsx`** — libellé `"Audio"` → `"Audio évènements"` (le lien lui-même,
  déjà poussé par `layout.tsx`, ne change pas de structure).
- **`src/app/(auth)/audio/AudioQueueClient.tsx`** :
  - En-tête de colonne « Culte » → « Enregistrement » ; message vide « Aucun culte audio. » →
    « Aucun enregistrement audio. » ; bouton « Déposer un culte » → « Déposer un enregistrement ».
  - Nouvelle colonne / badge **Type**, utilisant `getEventTypeLabel`/`getEventTypeBadge` de
    `@/lib/event-types` — réutilisation directe, pas de nouvelle palette de couleurs.
  - `NewServiceModal` : nouveau `Select` **Type de rassemblement** (`EVENT_TYPE_OPTIONS`),
    désactivé/masqué dès qu'un événement du jour est choisi (le type suit alors l'événement,
    affiché en lecture seule à côté du champ).
- **`src/app/(auth)/audio/[id]/AudioServiceClient.tsx`** :
  - Ajout d'un fil d'Ariane / lien retour en tête d'écran : `<Link href="/audio">← File
    d'attente</Link>`, au-dessus du bloc `ServiceInfoEditor`.
  - Nouveau bloc **Lien d'écoute**, visible uniquement quand `status === "PUBLISHED"` : URL
    affichée en lecture seule + bouton « Copier le lien » (`navigator.clipboard.writeText`,
    pattern déjà utilisé ailleurs dans le repo pour les liens de partage média — à vérifier et
    réutiliser tel quel) + lien « Ouvrir ↗ » (`target="_blank"`). Message contextuel à côté du
    bouton Dépublier : « Le lien ci-dessus cessera de fonctionner. »
  - Regroupement visuel des actions : déposer/nommer restent des boutons primaires/secondaires
    au fil de l'écran (inchangé) ; Publier reste le bouton d'accent principal ; Dépublier et
    Supprimer rejoignent une zone distincte, en bas d'écran, avec le style déjà utilisé pour les
    actions destructrices dans le reste du repo (`variant="danger"` sur `Button` si disponible —
    sinon classes `icc-rouge` déjà en place pour Supprimer, à étendre à Dépublier).
- **`src/app/(auth)/audio/[id]/ServiceInfoEditor.tsx`** — ajout du `Select` **Type de
  rassemblement**, même comportement de dérivation/lecture-seule que dans `NewServiceModal`.
- **Fiche d'événement** (`src/app/(auth)/admin/events/[eventId]/page.tsx` — seule fiche
  événement existante en dehors de `star-view`) — nouveau bloc, sans condition d'accès
  supplémentaire (voir § API : `events:manage` est déjà un sous-ensemble de `audio:view`) :
  - Si un `AudioService` est rattaché et `PUBLISHED` : lien vers l'écoute publique.
  - Si rattaché et en préparation : lien interne vers `/audio/[id]` avec un indicateur
    d'avancement réutilisant `pendingRenderCount`/`renderedCount` déjà calculés côté
    `AudioServiceClient` (même formule, dupliquée côté serveur pour cet affichage).
  - Si aucun `AudioService` rattaché : rien — pas de case à cocher « aucun enregistrement », pour
    ne pas alourdir la fiche de tous les événements sans audio.
- **`src/app/(auth)/events/[eventId]/star-view/StarViewClient.tsx`** — inchangé : le
  comportement PUBLISHED-only est un choix délibéré de la spec, pas un oubli à corriger.

## Décisions & alternatives écartées

- **Choix** : le type de rassemblement est un **champ `String` recopié**, pas une relation
  calculée à la volée depuis `Event.type` à chaque lecture. *Pourquoi* : un enregistrement sans
  événement rattaché doit pouvoir porter un type indépendamment — une relation obligatoire
  casserait ce cas, qui est le cas courant d'après la spec. Recopier au moment du dépôt/rattachement
  est le même choix déjà fait pour `serviceDate` sur ce modèle.
- **Écarté** : ajouter un `enum AudioServiceType` Prisma dédié. *Raison* : `Event.type`
  lui-même n'est pas un enum Prisma (`String` libre, nomenclature imposée côté application via
  `@/lib/event-types`) ; dupliquer la contrainte dans un enum Prisma introduirait deux sources de
  vérité pour la même liste et un risque de divergence silencieuse. On suit la convention déjà en
  place sur `Event`.
- **Choix** : la fiche d'événement n'ajoute **pas** de contrôle d'accès audio séparé pour le bloc
  d'enregistrement rattaché. *Pourquoi* : la page est déjà gatée sur `events:manage`, qui est un
  sous-ensemble strict des rôles disposant de `audio:view` — vérifié dans le tableau des
  permissions. Ajouter une seconde vérification serait une contrainte qu'aucun utilisateur
  atteignant réellement la page ne peut jamais faire échouer, donc du code mort qui laisse
  croire à une frontière de sécurité qui n'existe pas.
- **Écarté** : un endpoint public dédié `GET /api/audio/services/[id]/share-link`. *Raison* :
  `getOrCreatePrimaryShareToken` est déjà accessible depuis le service, et le besoin se limite à
  l'afficher sur un écran qui charge déjà le culte complet — un aller-retour réseau
  supplémentaire n'apporte rien.
- **Écarté** : renommer `AudioService` en `AudioRecording` ou équivalent en base/dans le code.
  *Raison* : la spec demande un changement de **vocabulaire visible**, pas une renomination
  structurelle du modèle — un renommage de table/type toucherait worker, tests, et toutes les
  routes pour un gain cosmétique côté code que rien ne réclame. Seuls les libellés affichés
  changent.

## Risques & points d'attention

- **Rétrocompatibilité du filtre par statut** (`AudioQueueClient`) : ajouter une colonne Type ne
  doit pas casser le filtre Statut existant — simple ajout de colonne, pas de changement de
  logique de filtrage dans ce plan (le filtre par type revient dans la 021, pas ici).
  N'introduit pas de risque de régression identifié au-delà des tests existants.
- **`buildPublicAudioUrl`** dupliqué en dur (`/ecouter/${token}`) dans `star-view/route.ts` et
  potentiellement le nouvel endpoint de fiche d'événement : à factoriser dès ce plan plutôt que
  de laisser une troisième occurrence apparaître.
- **Une seule fiche d'événement existe** — `src/app/(auth)/admin/events/[eventId]/page.tsx`. Il
  n'y a pas de page événement séparée sous `/events/[eventId]` en dehors de `star-view` (vérifié :
  seul `star-view/` existe sous ce chemin). Un seul point d'affichage à modifier, pas deux.
- **Migration `type` avec défaut `"AUTRE"`** : si le volume d'enregistrements déjà en production
  au moment du merge est significatif, une passe de backfill vers `"CULTE"` pour les lignes sans
  rattachement (probablement toutes des cultes en pratique aujourd'hui) est préférable à laisser
  `"AUTRE"` partout — décision à prendre en tâche selon l'état réel de la base en recette/prod.

## Stratégie de tests

- **`src/modules/audio/services/__tests__/service.test.ts`** (existant, à étendre) : création
  avec/sans `planningEventId` vérifie la dérivation du `type` depuis l'événement ; mise à jour du
  rattachement re-dérive le `type` ; création sans événement conserve le `type` saisi ou retombe
  sur `"AUTRE"`.
- **Nouveau test** sur la route `GET /api/audio/services/[id]` (ou extension d'un test de route
  existant) : `shareUrl` présent et non `null` seulement si `status === "PUBLISHED"`.
- **Nouveau test** sur la fiche d'événement : le bloc audio est absent sans enregistrement
  rattaché, présent avec l'état correct (préparation avec avancement, ou publié avec lien) selon
  le statut de l'`AudioService` rattaché.
- **Pas de test E2E navigateur** : hors des capacités Vitest du projet ; la vérification manuelle
  sur mobile (critères d'acceptation tactiles/défilement) reste une vérification humaine avant
  merge, comme pour le reste du module.

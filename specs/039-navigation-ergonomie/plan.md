# Plan technique — Ergonomie de la navigation

- **Spec associée** : `./spec.md`
- **Statut** : Implémentée
- **Mis à jour le** : 2026-09-11

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun import de module ajouté (composants de navigation et layout uniquement)
- [x] **Sécurité** : aucune route créée ni modifiée ; les gardes serveur des pages restent inchangées
- [x] **Permissions** : les conditions d'affichage restent calculées depuis `rolePermissions` dans
      `src/app/(auth)/layout.tsx` (`hasAccounting = accounting:view`) — aucune permission ajoutée ni retirée
- [x] **Validation** Zod : sans objet (aucune mutation)
- [x] **Migration** Prisma : sans objet (aucun changement de schéma)
- [x] **Enums** : sans objet
- [x] **UI** : réutilisation des briques existantes (`AccordionSection`, `NavLink`, `SubRow`, `SheetSubHeader`)

## Approche générale

Changement purement de présentation dans les trois endroits qui décrivent le menu, sans toucher
aux URLs ni aux droits :

1. **Libellés** — `« Gestion »` → `« Gérer les événements »` (section Événements) et
   `« Gestion »` → `« Traitement des demandes »` (lien Secrétariat de la section Opérations).
2. **Déplacement** — l'entrée Comptabilité quitte le bloc *Ressources* pour le bloc *Opérations*,
   dans la barre latérale et le menu mobile, avec la même condition d'affichage (`hasAccounting`).
3. **Cohérence** — états « section active », visibilité des sections, parcours guidé et guide
   alignés sur la nouvelle organisation.

## Modèle de données

[Aucun changement]

## API

[Aucun changement]

## Services / logique métier

[Aucun changement]

## UI / composants

### `src/app/(auth)/layout.tsx`
- Ligne du lien Secrétariat : `label: "Gestion"` → `label: "Traitement des demandes"`.
- Rien d'autre : `hasAccounting` est déjà passé en prop aux deux menus.

### `src/components/Sidebar.tsx` (menu complet ; le menu pastoral simplifié n'est pas touché)
- Section Événements : libellé du `NavLink` `/admin/events` → « Gérer les événements ».
- `isOperationsActive = isRequestsActive || isMediaActive || isAccountingActive` ;
  `isRessourcesActive = isJobsActive || isRoomsActive` (retrait de la Comptabilité).
- `hasOperations = requestLinks.length > 0 || mediaLinks.length > 0 || hasAccounting` ;
  `hasRessources = hasRooms || hasJobs`.
- Bloc Opérations : après les `mediaLinks`, rendu conditionnel de
  `NavLink /accounting/requests « Comptabilité »` (`active={isAccountingActive}`), précédé d'un
  séparateur `<hr>` si des liens le précèdent. La Comptabilité reste hors de `activeHref` : son
  préfixe `/accounting` ne recoupe aucun autre lien d'Opérations.
- Bloc Ressources : suppression de l'entrée Comptabilité et ajustement des séparateurs
  (`hasRooms && hasJobs`).
- Commentaires de section (« 5. Opérations — Demandes + Médias + Comptabilité », « 6. Ressources —
  Salles + Emploi ») mis à jour.

### `src/components/MobileNavSheet.tsx`
- Mêmes changements, en miroir : `SubRow` `/admin/events` → « Gérer les événements » ;
  `isOperationsActive`/`isRessourcesActive`/`hasOperations`/`hasRessources` recalculés à
  l'identique ; `renderOperations()` gagne la `SubRow` Comptabilité ; `renderRessources()` la perd.

### `src/components/BottomNav.tsx`
- Vérifier seulement : il ne liste pas la Comptabilité (aucune modification attendue).

### `src/lib/tour-steps.ts`
- Étape *Opérations* : mentionner la Comptabilité (demandes financières) ; ajouter
  `ACCOUNTANT` aux rôles de l'étape (le Comptable voit désormais la section).
- Étape *Ressources* : retirer la mention des demandes financières ; restreindre l'étape aux
  rôles qui voient encore la section (Salles ou Offres — tous les rôles ont `jobs:view`, donc
  l'étape reste sans filtre de rôle ; seul le texte change).

### `src/components/GuideContent.tsx`
- Entrée « Gestion (Secrétariat) » → « Traitement des demandes (Secrétariat) » (nom et
  `screenshotTitle`).
- L'entrée « Gérer les événements » porte déjà le bon nom ; aucune mention de Comptabilité sous
  Ressources n'existe (la catégorie « Comptabilité » est autonome) — rien à changer.

### Documentation
- `docs/guide-screenshots.md` : renommer les libellés concernés si cités.

## Décisions & alternatives écartées

- **Choix** : ajouter la Comptabilité comme entrée fixe du bloc Opérations (condition `hasAccounting`)
  plutôt que de la pousser dans `requestLinks` côté layout — *Pourquoi* : `requestLinks` alimente
  aussi d'autres calculs (`isRequestsActive`) et la Comptabilité a déjà sa prop dédiée ; le rendu
  reste lisible et symétrique entre les deux menus.
- **Écarté** : factoriser la définition du menu dans une structure partagée entre `Sidebar` et
  `MobileNavSheet` — *Raison* : refonte hors périmètre (la spec exclut toute autre
  réorganisation) ; le risque de divergence est couvert par la vérification manuelle ci-dessous.
- **Écarté** : changer les URLs (`/admin/events`…) pour les aligner sur les libellés — *Raison* :
  critère d'acceptation « les adresses ne changent pas ».

## Risques & points d'attention

- **Divergence desktop/mobile** : deux fichiers dupliquent la logique ; les modifier dans le même
  commit et vérifier les deux (règle mémoire « cohérence mobile »).
- **Comptable** : aujourd'hui `requestLinks` peut contenir « Demande RDV pastoral » pour tout
  utilisateur ayant une église — vérifier ce que voit réellement un Comptable pour ne pas
  introduire une section Opérations incohérente (l'ajout de la Comptabilité ne doit rien masquer
  ni révéler d'autre).
- **Section ouverte par défaut** : l'ordre des `if` qui choisit la section ouverte (`operations`
  avant `ressources`) donne naturellement Opérations sur `/accounting/*` une fois
  `isAccountingActive` rattaché à Opérations.
- **Parcours guidé** : l'ancre `data-tour="sidebar-ressources"` peut disparaître pour un
  utilisateur sans Salles ni Offres ; `GuidedTour` doit déjà ignorer une cible absente — à vérifier.

## Stratégie de tests

- Aucun test existant ne couvre `Sidebar`/`MobileNavSheet` ; la logique modifiée est
  déclarative (conditions booléennes). Pas de nouveau test unitaire de rendu (le projet n'en a
  pas pour les menus) — `nav-match.test.ts` reste valide.
- `npm run typecheck && npm run lint && npm run lint:boundaries && npm run test`.
- **Vérification manuelle** sur l'environnement de dev (connexion par rôle du jeu fictif), barre
  latérale **et** menu mobile : Secrétaire (deux libellés), Responsable de département
  (Comptabilité sous Opérations, Ressources = Salles + Offres), Comptable (Opérations =
  Comptabilité), STAR (aucun changement), page `/accounting/requests` (Opérations ouverte, lien
  surligné), parcours guidé relancé depuis le guide.

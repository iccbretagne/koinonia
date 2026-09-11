# Tâches — Ergonomie de la navigation

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/navigation-ergonomie`
- [ ] Migration Prisma générée (si schéma modifié) — sans objet, aucun changement de schéma

## Tâches

### 1. Libellés

- [ ] **T1** [P] — Renommer le lien du Secrétariat en « Traitement des demandes »
      *(fichier : `src/app/(auth)/layout.tsx`, ligne `requestLinks.push({ href: "/secretariat/requests", label: "Gestion" })`)*
- [ ] **T2** [P] — Renommer l'entrée « Gestion » de la section Événements en « Gérer les événements »
      dans la barre latérale *(fichier : `src/components/Sidebar.tsx`, `NavLink href="/admin/events"`)*
- [ ] **T3** [P] — Même renommage dans le menu mobile
      *(fichier : `src/components/MobileNavSheet.tsx`, `SubRow href="/admin/events"`)*

### 2. Déplacement de la Comptabilité — barre latérale

- [ ] **T4** — Recalculer `isOperationsActive`/`isRessourcesActive` pour inclure
      `isAccountingActive` dans Opérations et le retirer de Ressources
      *(fichier : `src/components/Sidebar.tsx`)*
- [ ] **T5** — Recalculer `hasOperations`/`hasRessources` en conséquence (`hasAccounting` déplace
      de la deuxième à la première condition) *(fichier : `src/components/Sidebar.tsx`)*
- [ ] **T6** — Ajouter le `NavLink` Comptabilité au bloc Opérations (avec séparateur si
      `requestLinks`/`mediaLinks` non vides) et le retirer du bloc Ressources, en ajustant les
      séparateurs restants (`hasRooms && hasJobs`) *(fichier : `src/components/Sidebar.tsx`)*
- [ ] **T7** — Mettre à jour les commentaires de section (« 5. Opérations… », « 6. Ressources… »)
      *(fichier : `src/components/Sidebar.tsx`)*

### 3. Déplacement de la Comptabilité — menu mobile

- [ ] **T8** — Mêmes recalculs `isOperationsActive`/`isRessourcesActive`/`hasOperations`/`hasRessources`
      *(fichier : `src/components/MobileNavSheet.tsx`)*
- [ ] **T9** — Déplacer la `SubRow` Comptabilité de `renderRessources()` vers `renderOperations()`,
      séparateurs ajustés *(fichier : `src/components/MobileNavSheet.tsx`)*

### 4. Parcours guidé et guide utilisateur

- [ ] **T10** [P] — Étape *Opérations* : mentionner la Comptabilité, ajouter `ACCOUNTANT` aux
      rôles de l'étape *(fichier : `src/lib/tour-steps.ts`)*
- [ ] **T11** [P] — Étape *Ressources* : retirer la mention des demandes financières
      *(fichier : `src/lib/tour-steps.ts`)*
- [ ] **T12** [P] — Renommer l'entrée « Gestion (Secrétariat) » en « Traitement des demandes
      (Secrétariat) » (nom + `screenshotTitle`) *(fichier : `src/components/GuideContent.tsx`)*
- [ ] **T13** [P] — Vérifier `docs/guide-screenshots.md` et renommer les libellés concernés s'ils y
      figurent *(fichier : `docs/guide-screenshots.md`)*

### 5. Vérifications ciblées (risques du plan)

- [ ] **T14** — Vérifier ce qu'un Comptable voit réellement dans Opérations une fois la
      Comptabilité ajoutée (pas de lien « Demande RDV pastoral » ou autre inattendu) — ajuster
      T4/T8 si besoin *(fichiers : `src/app/(auth)/layout.tsx`, `Sidebar.tsx`, `MobileNavSheet.tsx`)*
- [ ] **T15** — Vérifier que `GuidedTour` ignore correctement une cible absente
      (`data-tour="sidebar-ressources"` quand la section a disparu) *(fichier : `src/components/GuidedTour.tsx`)*

### 6. Tests

- [ ] **T16** — Confirmer que `src/lib/__tests__/nav-match.test.ts` reste vert sans modification
      (la logique `activeHref` n'est pas changée par cette feature)

## Vérification manuelle (rôles du jeu de données fictif, desktop **et** mobile)

- [ ] Secrétaire : « Gérer les événements » et « Traitement des demandes » visibles
- [ ] Responsable de département : Comptabilité sous Opérations ; Ressources = Salles + Offres
- [ ] Comptable : Opérations affiche uniquement Comptabilité ; aucun accès inattendu
- [ ] STAR : aucun changement visible
- [ ] Sur `/accounting/requests` : section Opérations ouverte, lien Comptabilité surligné
- [ ] Utilisateur sans Salles ni Offres : section Ressources absente
- [ ] Parcours guidé relancé depuis le guide : aucune étape sur une section vide ou déplacée
- [ ] Favoris/liens existants vers `/admin/events`, `/secretariat/requests`, `/accounting/requests`
      continuent de fonctionner (URLs inchangées)

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] PR ouverte vers `main`

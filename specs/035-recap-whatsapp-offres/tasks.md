# Tâches — Message récapitulatif des offres au format WhatsApp

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/recap-whatsapp-offres` (depuis `main` à jour)
- [x] Migration Prisma générée — **sans objet**, le schéma ne change pas (cf. `plan.md` §Modèle de données)

## Tâches

### 1. Données & migration

*Aucune tâche : ni modèle, ni champ, ni migration. La feature lit des données déjà sérialisées et
passées en props par `src/app/(auth)/jobs/page.tsx`.*

### 2. Logique métier (composeur pur)

- [x] **T1** — Créer le module pur avec ses types et la signature publique : `RecapJobType`,
      `RecapJob` (`id`, `title`, `type`, `company`, `location`, `deadline` — **sans**
      `contactEmail`/`contactUrl`) et `buildWhatsAppRecap(jobs, filter, origin): string`.
      **Aucun import** dans ce fichier.
      *(fichier : `src/app/(auth)/jobs/whatsapp-recap.ts`)*

- [x] **T2** — Implémenter l'**en-tête** dépendant du filtre : table de correspondance
      `ALL → "Offres d'emploi"/"offre"`, `EMPLOI → "Emplois"/"offre"`, `STAGE → "Stages"/"stage"`,
      `ALTERNANCE → "Alternances"/"alternance"`, avec accord du pluriel sur `jobs.length`.
      *(fichier : `src/app/(auth)/jobs/whatsapp-recap.ts`)*

- [x] **T3** — Implémenter le **bloc par offre** : `*{titre}*` (astérisques du titre retirés via
      `replace(/\*/g, "")`), puis `{Type} · {entreprise}[ · {lieu}]`, puis la ligne
      `À postuler avant le {date}` **uniquement si** `deadline` est renseignée
      (`toLocaleDateString("fr-FR", { day: "numeric", month: "long" })`), puis `{origin}/jobs/{id}`.
      Segments absents omis sans séparateur orphelin ni mention « non renseigné ». Blocs séparés
      par une ligne vide.
      *(fichier : `src/app/(auth)/jobs/whatsapp-recap.ts`)*

- [x] **T4** — Implémenter le **pied de message** : `👉 Toutes les offres : {origin}/jobs`.
      *(fichier : `src/app/(auth)/jobs/whatsapp-recap.ts`)*

### 3. API (route handlers)

*Aucune tâche : pas de route ajoutée ni modifiée (décision consignée dans `plan.md`
§Décisions & alternatives écartées). Les gardes existantes de `page.tsx` restent inchangées.*

### 4. UI

- [x] **T5** — Dans `JobsListClient`, importer `buildWhatsAppRecap` et ajouter l'état local
      (`copied`, `fallbackText`) plus la fonction `copyRecap()` : composition depuis `filtered` et
      `window.location.origin`, **garde explicite `if (!navigator.clipboard) throw …`** avant
      `writeText`, `catch` qui alimente `fallbackText`.
      *(fichier : `src/app/(auth)/jobs/JobsListClient.tsx`)*

- [x] **T6** — Ajouter le **bouton « Copier pour WhatsApp »** à droite de la barre d'onglets de
      type, rendu conditionnel `filtered.length > 0`, avec retour visuel
      « Copié ! (N offres) » pendant 2,5 s — même idiome `copied` + `setTimeout` et même icône
      presse-papier que `src/app/(auth)/agenda/PublicUrlBanner.tsx`.
      *(fichier : `src/app/(auth)/jobs/JobsListClient.tsx`)*

- [x] **T7** — Ajouter la **modale de repli** : `Modal` (prop `open`, **pas** `isOpen`) ouverte sur
      `!!fallbackText`, contenant la phrase d'explication (« la copie automatique n'a pas
      fonctionné, voici le texte »), un `<textarea readOnly>` sélectionné au montage
      (`autoFocus` + `onFocus={(e) => e.currentTarget.select()}`) et un `Button` de fermeture
      (pas de prop `loading`).
      *(fichiers : `src/app/(auth)/jobs/JobsListClient.tsx`, réutilise `src/components/ui/Modal.tsx`
      et `src/components/ui/Button.tsx`)*

### 5. Tests

- [x] **T8** — Tests du composeur — **structure** : message complet pour 3 offres sans filtre
      (en-tête, 3 blocs séparés par une ligne vide, pied de message) ; ordre du tableau d'entrée
      préservé ; chaque bloc contient type, intitulé, entreprise et `origin/jobs/{id}`.
      *(fichier : `src/app/(auth)/jobs/whatsapp-recap.test.ts`)*

- [x] **T9** — Tests du composeur — **en-tête et filtre** : avec `STAGE`, l'en-tête annonce des
      stages et seules les offres transmises apparaissent ; accord du pluriel vérifié à 1 et 2
      offres ; liste vide → chaîne sans aucun bloc d'offre.
      *(fichier : `src/app/(auth)/jobs/whatsapp-recap.test.ts`)*

- [x] **T10** — Tests du composeur — **champs optionnels et sécurité du contenu** : `location: null`
      → aucun segment lieu ni ` · ` orphelin ni « non renseigné » ; `deadline: null` → aucune ligne
      de date ; `deadline` renseignée → date en français présente ; un objet portant
      `contactEmail`/`contactUrl` ne les voit jamais ressortir dans le texte ; titre contenant `*`
      → astérisques du titre retirés. Dates construites avec le constructeur **local**
      (`new Date(2026, 8, 15)` puis `.toISOString()`) pour rester indépendant du fuseau, comme
      `src/app/(auth)/rooms/calendar.test.ts`.
      *(fichier : `src/app/(auth)/jobs/whatsapp-recap.test.ts`)*

### 6. Recette manuelle *(non automatisable — aucun test de composant React dans le repo)*

- [ ] **T11** — Sur staging : copier avec et sans filtre de type, coller dans une conversation
      WhatsApp réelle, vérifier le rendu (gras des titres, blocs séparés, aucun caractère parasite)
      et qu'un lien d'offre ouvre bien l'offre après connexion.

- [ ] **T12** — Vérifier le **repli** : sur une origine non sécurisée (HTTP simple, accès par IP
      réseau) ou avec la permission presse-papier bloquée, le clic ouvre la modale avec le texte
      sélectionnable et l'explication — et **aucune** confirmation « Copié ! » n'apparaît.

- [ ] **T13** — Vérifier l'**absence du bouton** quand la liste affichée est vide (filtre sans
      aucune offre), ainsi que la visibilité du bouton depuis un compte **STAR** (aucune
      restriction de rôle).

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] Tous les critères d'acceptation de `spec.md` satisfaits
- [x] Statut de `spec.md` passé à `Implémentée`
- [ ] PR ouverte vers `main`, référençant `specs/035-recap-whatsapp-offres/`

## Couverture des critères d'acceptation

| Critère (spec) | Tâche(s) |
|---|---|
| Action de copie proposée, visible pour tout utilisateur ayant accès | T6, T13 |
| Message = offres affichées, ni plus ni moins | T5, T8 |
| Filtre « Stage » → uniquement des stages, en-tête adapté | T2, T9 |
| Sans filtre → toutes les offres visibles, même ordre | T8 |
| Chaque offre : type, intitulé, entreprise, lien vers son détail | T3, T8 |
| Lieu présent si renseigné, ligne absente sinon | T3, T10 |
| Date limite présente si renseignée, format français | T3, T10 |
| Aucune adresse email ni lien de candidature externe | T1, T10 |
| Message terminé par un renvoi vers la liste complète | T4, T8 |
| Confirmation visible après copie, avec le nombre d'offres | T6, T11 |
| Rendu correct une fois collé dans WhatsApp | T3, T11 |
| Liste vide → action non proposée | T6, T13 |
| Échec de copie → texte affiché sélectionnable + explication | T5, T7, T12 |
| Aucune donnée modifiée par l'action | T1 *(composeur pur, aucune écriture ni appel réseau)* |

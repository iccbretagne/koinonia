# Fluidité et performance perçue

L'application paraît lente quand elle ne dit rien. Aujourd'hui, aucune des 229 pages n'a d'état de chargement (`loading.tsx`) et aucun retour global n'existe après une action. Ces règles corrigent cela.

## Charger

- Chaque segment de route a son `loading.tsx` qui reproduit la silhouette de la page avec `Skeleton` : en-tête, puis trois à six lignes ou cartes. Pas de spinner centré.
- Le squelette apparaît en moins de 100 ms ; il ne clignote pas pour un chargement court (délai d'apparition de 150 ms).
- Les données lentes (statistiques, historique) se chargent dans leur propre `Suspense` pour ne pas retarder le reste de la page.

## Naviguer

- Tous les liens internes passent par `next/link` (préchargement dans le viewport).
- Transitions entre pages via l'API View Transitions : fondu de `duration-base` ; le titre de page glisse de 8px. Coupé sous `prefers-reduced-motion`.
- La position de défilement est conservée au retour vers une liste.
- Les filtres, le tri et l'onglet actif vivent dans l'URL : un lien partagé ou un retour arrière retrouve la même vue.

## Agir

- Retour immédiat sur chaque action : le bouton passe à l'état « en cours » (« Enregistrement… »), puis un `Toast` confirme (« Absence enregistrée ») ou explique l'échec.
- Mise à jour optimiste pour les gestes fréquents et réversibles (statut dans la grille de planning, cocher une tâche, marquer une notification lue), avec retour arrière et toast d'erreur si le serveur refuse.
- Suppression : toast avec « Annuler » pendant 6 s plutôt qu'un dialogue de confirmation, quand l'action est réversible. Garder `Dialog` de confirmation pour l'irréversible (supprimer une fiche STAR, retirer un rôle Admin).
- Formulaires : validation au moment de quitter le champ, message sous le champ en `danger`, focus sur le premier champ en erreur à l'envoi.

## Hors ligne et installation

- L'application est déjà installable (service worker, `manifest.json`). La barre supérieure prend la couleur `surface` via `theme-color` (clair et sombre) au lieu du violet fixe.
- « Mon planning » et le prochain service restent lisibles hors connexion (dernière version mise en cache), avec un bandeau `warning-soft` « Hors ligne — dernière mise à jour à 8h12 ».

## Budget

- JavaScript initial d'une page ≤ 200 ko compressés ; les éditeurs lourds (carte, recadrage, audio) chargés à la demande.
- Largest Contentful Paint < 2.5 s sur un téléphone moyen en 4G ; Interaction to Next Paint < 200 ms.

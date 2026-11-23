# Plan technique — Visuel du billet d'entrée

- **Spec associée** : `./spec.md`
- **Statut** : Validé pour implémentation à la demande de l'utilisateur
- **Mis à jour le** : 2026-11-23

## Conformité
- [x] Métier dans `ticketing/services`, imports par l'index ; schémas purs réexportés par `schemas`.
- [x] Droits objet/église existants : `configure` écrit, `read` consulte. Aucun nouveau rôle.
- [x] Zod pour le document et les mutations ; contrats OpenAPI régénérés.
- [x] Migration Prisma pour les documents, images et adresse d'événement.
- [x] Composants UI existants ; aucun ajout de dépendance.

## Approche
Un brouillon et un document publié distincts par événement. Fond portrait et vignettes sur une
surface fixe 1000 × 1500 ; coordonnées et styles bornés. QR carré obligatoire, taille minimale,
noir sur blanc avec quatre modules de marge ; nominatif toujours en texte. Les images sont
réencodées par le traitement sécurisé existant, stockées en base comme les logos d'église,
accessibles seulement à l'équipe. Le participant reçoit uniquement le rendu composé, par son
jeton existant, avec relecture de son état à chaque demande et `private, no-store`.

## Données et services
- `TicketingEvent.ticketVisualDraft`, `ticketVisualPublished` : JSON nullable.
- `TicketingEvent.address` : adresse distincte du lieu, facultative, éditable dans les paramètres.
- `TicketingTicketImage` : événement, WebP réencodé, dimensions, nom et date ; suppression en
  cascade. Maximum 20 images par événement ; suppression refusée si référencée.
- `ticket-visual.ts` : images, validation de leur appartenance, brouillon/publication/retrait,
  audit. Un fond invalide n'écrase jamais le document courant.
- `ticket-render.ts` : même rendu PNG pour aperçu et billet ; QR issu de `ticketUrl`, texte XML
  échappé, débordements coupés et noms longs réduits. PDF via la dépendance React PDF existante.

## API
Sous `/api/ticketing/events/[id]/ticket-visual` : GET document (`read`), PUT `{ document,
publish }` (`configure`), DELETE retire la publication (`configure`). `/preview` : GET brouillon
en PNG (`read`), POST document non enregistré en PNG (`configure`). `/images` : GET métadonnées
(`read`), POST multipart (`configure`) ; `/images/[imageId]` GET WebP (`read`), DELETE
(`configure`). `/api/ticketing/public/tickets/[token]/visual?format=png|pdf` : billet actif et
visuel publié obligatoires, aucun asset ni document brut exposé.

## UI
Onglet « Visuel du billet » : lecture de l'aperçu pour les rôles `read`, formulaire pour
l'organisateur. Fond, réglages numériques accessibles de position/dimensions, styles ou image
pour date/lieu/adresse, aperçu fictif avec nom long, enregistrement et publication explicites.
Le billet public conserve le rendu actuel sans publication ; sinon PNG composé et liens PNG/PDF.

## Assistant IA
Lecture du document et lien vers l'éditeur. Actions upload, édition/publication/retrait via
`eventAction` (aperçu/confirmation, droits et empreinte revérifiés). Import URL/fichier via
`safeFetchImage`, base64 via le décodeur existant ; l'aperçu vérifie le contenu, la confirmation
réutilise le service de l'écran. Aucune dépendance au drapeau des sites.

## Arbitrages
- Fond propre au billet, PNG **et** PDF conformément aux critères explicites.
- Polices fermées : sans-serif, serif, monospace ; pas de police distante.
- Email inchangé (vignette optionnelle hors livraison), lien toujours à jour.
- Les images de date/lieu/adresse sont statiques : avertissement dans l'éditeur.
- Pas d'éditeur général ni de bibliothèque graphique ; champs natifs pour le placement.

## Vérification
Vitest : schémas/bornes, propriété des images, refus, audit, publié/brouillon, rendu texte long,
décodage du QR du PNG/PDF, annulation, permissions et confirmation MCP. Puis typecheck, lint,
frontières et suite complète. Recette visuelle de l'éditeur et téléchargement à consigner.

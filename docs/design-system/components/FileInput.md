# FileInput

Choix d'un ou de plusieurs fichiers.

- Un `Button` du design system (secondaire par défaut, 44px, icône `Upload` ou fournie) qui enveloppe un `<input type="file">` masqué mais focalisable : le focus clavier se voit sur le bouton (`focus`), le libellé, l'aide et l'erreur restent liés au champ.
- Libellé facultatif au-dessus (`label`, `hideLabel`) ; texte du bouton à l'infinitif (`buttonLabel`, défaut « Choisir un fichier » / « Choisir des fichiers »).
- Nom du fichier choisi à côté du bouton (« 3 fichiers choisis » au-delà de trois), annoncé poliment. `fileNames={[]}` quand l'écran liste lui-même les envois ; `resetAfterSelect` pour un envoi immédiat (le même fichier peut être rechoisi).
- `onFiles(files)` en plus de `onChange` ; `accept`, `multiple`, `capture="environment"` (photo), `disabled`, `ref` passent à l'input.
- Pas de bouton natif « Parcourir… » ni de texte 13px qui fait zoomer iOS.

Remplace `billetterie/[id]/_components/file-input-classes.ts` et les `<label>` faits main. Adopté par : audio (dépôt des séquences, couverture), billetterie (affiche, images du site, visuel du billet), trésorerie et navette (justificatif), pièces demandées, campagnes (dépôt, import JSON), `/servir` (photo), icône de l'application, sauvegarde de configuration.

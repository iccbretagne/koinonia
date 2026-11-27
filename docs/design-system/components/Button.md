# Button

Déclenche une action ; au plus un bouton **primary** par écran, pour ce que la page sert à faire.

## Variantes
- `primary` : aplat `brand`, texte `on-brand`, survol `brand-hover`. Remplace aussi l'ancienne variante `edit` (identique).
- `secondary` : fond `surface`, bordure `control-line`, texte `ink`. Pour « Annuler », « Exporter », les actions d'appoint.
- `ghost` : texte `brand-text` sans fond. Pour les actions dans une ligne ou une carte (« Voir », « Modifier »).
- `danger` : aplat `danger`, texte `on-danger`. Uniquement pour confirmer une suppression, dans un `Dialog`.
- `on-brand` : fond `surface`, texte `brand-text`, sur un bandeau `brand` (carte « Prochain service »). `on-brand-secondary` : contour et texte `on-brand`, fond transparent. Anneau de focus `on-brand` pour rester visible sur l'aplat.
- La variante `info` (bleu clair sur blanc, 2.2:1) disparaît : utiliser `secondary`.

## Tailles
`md` (44px, `control-md`) partout. `sm` fait lui aussi 44px sur mobile et ne descend à 36px qu'à partir de `sm:` (`min-h-11 sm:min-h-9`, intégré) : actions de ligne d'un tableau desktop. Ne plus ajouter `min-h-11 sm:min-h-9` à l'appel.

## Ce que fournit l'appelant
Un libellé verbe à l'infinitif (« Enregistrer l'absence »), une icône Lucide 16px facultative avant le libellé. Pendant l'envoi : `disabled` et libellé à l'action en cours (« Enregistrement en cours… »).

## À éviter
Deux boutons primary côte à côte ; un bouton désactivé sans explication ; « OK » ou « Soumettre ».

# Spec — Images du site depuis un assistant IA

- **Numéro** : 087
- **Statut** : Implémentée
- **Créée le** : 2026-11-22
- **Branche suggérée** : `feat/site-images-assistant`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.

## Contexte & problème

Un assistant IA connecté à Koinonia (spec 084) peut composer le site d'un événement, mais pas y
ajouter une image qu'il vient de générer ou que la personne lui a jointe : il ne sait transmettre
qu'une adresse https publique ou le contenu de l'image écrit en toutes lettres, impraticable au-delà
de quelques kilo-octets. La personne doit alors télécharger chaque image puis la téléverser champ
par champ dans l'éditeur, bloc par bloc. Il n'existe pas d'endroit pour déposer plusieurs images
d'un coup.

## Utilisateurs concernés

| Rôle | Ce qu'il peut faire |
|---|---|
| **Organisateur, Communication** (rôles d'événement, et `ticketing:manage`) | Déposer plusieurs images d'un coup sur une page dédiée ; demander à l'assistant un lien vers cette page ; laisser l'assistant importer directement un fichier quand le client le permet |
| **Autres rôles d'événement, autres comptes** | Aucun accès (comme l'onglet Site) |

## Comportement attendu

### Scénario principal — lien de dépôt
1. Dans ChatGPT, la personne demande : « ajoute ces quatre visuels au site de la Nuit de la Traversée ».
2. L'assistant répond avec un lien « Déposer les images » vers Koinonia.
3. La page s'ouvre (connexion habituelle) : la personne glisse les quatre fichiers, saisit pour
   chacun un texte alternatif (obligatoire) et un nom facultatif, puis envoie.
4. Chaque image est contrôlée et traitée comme aujourd'hui ; la page liste les images du site avec
   leur nom, une miniature et leur identifiant.
5. De retour dans la conversation, l'assistant retrouve les nouvelles images et les place dans les
   blocs (avec aperçu et confirmation, comme toute modification du site).

### Scénario — import direct par le client
1. Si le client IA sait transmettre un fichier de la conversation à l'outil d'import, l'assistant
   l'importe directement, sans lien ni manipulation, avec les mêmes contrôles, aperçu et confirmation.
2. Sinon, l'assistant propose le lien de dépôt.

### Cas limites
- Fichier refusé (format, poids, dimensions) : message par fichier, les autres continuent.
- Texte alternatif manquant : envoi impossible pour ce fichier.
- Lien ouvert par une personne sans droit sur le site : même réponse qu'un événement inexistant.
- Fichier transmis par le client inaccessible, expiré ou hors limites : refus clair, et l'assistant
  propose le lien de dépôt.
- L'import par adresse https et par contenu reste possible.

## Critères d'acceptation
- [ ] Une page « Images du site » permet de déposer plusieurs images d'un coup, chacune avec texte alternatif obligatoire, et liste les images existantes avec leur identifiant.
- [ ] Elle n'est accessible qu'aux personnes qui peuvent modifier le site de l'événement.
- [ ] L'assistant dispose d'un outil en lecture qui renvoie l'adresse de cette page.
- [ ] L'outil d'import accepte en plus un fichier transmis par le client IA ; un seul mode de source par appel.
- [ ] Les contrôles actuels (type, poids, dimensions, adresse publique, sécurité réseau, variantes) s'appliquent à tous les modes.
- [ ] L'onglet Site de l'éditeur mène à la page « Images du site ».
- [ ] Rien ne change pour les sites publiés ni pour l'import existant.

## Hors périmètre
- Interface intégrée à la conversation (widget), extension expérimentale de transfert de fichiers MCP.
- Recadrage, retouche ou génération d'image dans Koinonia.

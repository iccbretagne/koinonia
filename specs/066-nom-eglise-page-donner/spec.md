# Spec — Nom et logo de l'église sur la page « Donner » et la slide

- **Numéro** : 066
- **Statut** : Implémentée
- **Créée le** : 2026-10-21
- **Branche suggérée** : `feat/nom-eglise-page-donner`
- **Prolonge** : [spec 065 — page publique « Donner » et slide de projection](../065-page-donner/spec.md)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

La page publique « Donner » et la slide « Dîmes & Offrandes » (spec 065) affichent toutes deux le
nom de l'église au-dessus du titre, en petites capitales discrètes. Ce rendu est fixe, et il ne
convient pas à toutes les églises :

- **Le nom fait doublon.** Le support de projection du culte porte souvent déjà le nom ou le logo
  de l'église. Le répéter sur la slide encombre l'écran.
- **Le nom est trop discret.** Une église qui partage le lien de sa page hors de ses murs (réseaux
  sociaux, message à un visiteur) veut qu'on la reconnaisse au premier coup d'œil.
- **La page et la slide ne servent pas au même moment.** La page se lit de près, sur un téléphone,
  souvent par quelqu'un qui ne connaît pas l'église. La slide se lit de loin, pendant le culte,
  par l'assemblée. Le bon réglage n'est donc pas forcément le même sur les deux.

Aujourd'hui, une église qui veut un autre rendu n'a aucun moyen de le changer.

L'identité visuelle manque aussi : ni la page ni la slide ne montrent le logo de l'église. Sur
la page, c'est pourtant le premier signe de confiance pour un visiteur qui s'apprête à donner :
il reconnaît l'église avant de lire ses coordonnées. Sur la slide, le logo ancre le moment des
offrandes dans l'identité de l'église.

Un logo sur une page de dons engage l'intégrité de la page au même titre que ses coordonnées
(spec 065) : une image remplacée pourrait afficher un faux IBAN ou un faux QR code. Son dépôt et
son remplacement sont donc encadrés comme une coordonnée de paiement.

## Utilisateurs concernés

| Rôle | Ce qu'il peut faire |
|---|---|
| Super Admin, Admin, Secrétaire, Comptable | Ceux qui paramètrent déjà la page « Donner » (spec 065) règlent l'affichage du nom, déposent le logo et choisissent où il apparaît |
| Visiteur de la page publique (sans compte) | Voit le nom et le logo selon le réglage de la page |
| Assemblée pendant le culte | Voit le nom et le logo selon le réglage de la slide |
| Comptabilité de l'église (à défaut, les Admins) | Est alertée quand le logo est déposé, remplacé ou retiré |

Les autres rôles (Ministre, Resp. département, STAR, Faiseur de Disciples, Reporter, Référent
soins pastoraux) n'ont pas accès au paramétrage des dons. Pour eux, rien ne change.

## Comportement attendu

Deux réglages indépendants : l'un pour la **page publique**, l'autre pour la **slide**. Chacun
comporte :

- **Afficher le nom de l'église** : oui ou non ;
- **Taille** : *Petit*, *Moyen* ou *Grand*. *Petit* est le rendu actuel. La taille ne se règle
  que si le nom est affiché.

Par défaut, les deux réglages reproduisent le rendu actuel : nom affiché, taille *Petit*. Une
église qui ne touche à rien ne voit aucune différence.

**Logo.** L'église dépose **un logo, pensé pour un fond sombre** (en général blanc ou clair) : la
slide a un fond sombre et l'en-tête de la page la couleur de l'église, quel que soit le thème.
Chaque support (page, slide) a un réglage **Afficher le logo**, oui ou non. Tant
qu'aucun logo n'est déposé, ce réglage est sans effet et rien ne change.

- Formats acceptés : images PNG, JPEG ou WebP, d'au plus 2 Mo. La transparence est conservée.
  Un fichier d'un autre type, ou plus lourd, est refusé avec un message clair. Le format SVG
  n'est pas accepté.
- L'image est mise au propre à l'enregistrement : métadonnées retirées, dimensions bornées. Ce
  qui s'affiche est l'image enregistrée, que personne ne peut remplacer en dehors du paramétrage.
- Le logo se remplace ou se retire à tout moment. Le dépôt, le remplacement et le retrait sont
  enregistrés immédiatement, sans attendre le bouton « Enregistrer » du reste du paramétrage :
  l'écran le dit clairement.
- Sur la slide, le logo se place en haut, sur la ligne du nom, à sa gauche. Sur la page, il se
  place dans l'en-tête, à gauche du nom et du titre. Il garde ses proportions, à une hauteur fixe
  propre à chaque support.
- **Le QR code de la slide garde toujours sa taille et reste carré.** Le nom et le logo tiennent
  sur une seule ligne, de hauteur fixe, en haut de la slide : quels que soient la taille du nom,
  sa longueur et les proportions du logo, ils ne prennent jamais la place du QR code.

**Place libérée sur la slide.** Pour que cette ligne tienne sans réduire le QR code, la slide
évolue pour toutes les églises, même sans rien régler :

- le titre « Dîmes & Offrandes » est un peu moins grand ;
- la phrase « Scanne le code ou tape l'adresse », sous l'adresse, disparaît : le QR code et
  l'adresse se suffisent ;
- l'adresse courte reste **toujours lisible en entier**. Si elle est longue, elle se réduit et
  passe sur deux lignes (le site, puis le chemin) avant que le QR code ne rétrécisse. Le QR code
  ne rétrécit qu'en dernier recours, si l'adresse ne tient toujours pas à sa plus petite taille.

Aujourd'hui, une adresse qui manque de place peut être rognée en hauteur sans que rien ne le
signale : ce défaut disparaît.

### Scénario principal — mettre le nom en avant sur la page

1. Une Admin ouvre le paramétrage des dons. Une section « Nom de l'église » présente deux blocs,
   « Page publique » et « Slide de projection », chacun avec ses deux réglages.
2. Pour la page publique, elle laisse le nom affiché et choisit *Grand*.
3. Elle enregistre. La page publique affiche désormais le nom de l'église en grand dans son
   en-tête, au-dessus du titre « Donner ».
4. La slide n'a pas changé : son réglage est resté sur *Petit*.

### Scénario — masquer le nom sur la slide

1. Le support de projection du culte porte déjà le logo de l'église. La Secrétaire ouvre le
   paramétrage et décoche « Afficher le nom de l'église » pour la slide.
2. Le choix de taille de la slide devient inactif.
3. Dans l'aperçu, la slide ne montre plus que le titre « Dîmes & Offrandes », le QR code et les
   moyens de don. L'image téléchargée et l'affichage plein écran suivent le même réglage.
4. La page publique, elle, affiche toujours le nom.

### Scénario — déposer le logo

1. Le Comptable ouvre le paramétrage des dons. Dans la section « Logo », il dépose le logo blanc
   de l'église.
2. Il le voit aussitôt sur un fond sombre, tel qu'il apparaîtra.
3. « Afficher le logo » est coché par défaut pour la page et pour la slide. Il le laisse ainsi.
4. La page publique montre le logo dans son en-tête. La slide le montre à gauche du nom, dans
   l'aperçu, en plein écran et dans l'image téléchargée.
5. La comptabilité reçoit l'alerte de modification de la page, qui indique que le logo a
   changé, par qui et quand.

### Scénarios alternatifs / cas limites

- **Nom long en taille *Grand* sur la slide** : pour rester sur sa ligne, le nom est affiché un
  peu plus petit que la taille choisie, jusqu'à *Petit* au plus bas. Il n'est jamais coupé :
  s'il ne tient toujours pas, il passe sur deux lignes à la taille *Petit*, sans réduire le QR
  code. La slide tient toujours entièrement dans son cadre 16:9, dans l'aperçu, en plein écran et
  dans l'image téléchargée. Aucun élément ne déborde ni n'en chevauche un autre.
- **Nom long en taille *Grand* sur la page** : le nom passe à la ligne et reste lisible sur un
  petit téléphone (largeur d'environ 320 px), sans défilement horizontal.
- **Nom masqué sur la page** : l'en-tête ne garde que le titre « Donner ». L'onglet du navigateur et
  l'aperçu d'un lien partagé continuent de nommer l'église, pour qu'on sache à qui l'on donne.
- **Retour en arrière** : réafficher le nom retrouve la dernière taille choisie.
- **Page désactivée** : le réglage se conserve et s'applique à la réactivation.
- **Traçabilité** : comme toute modification de la page (spec 065), le changement est journalisé :
  qui, quand, quoi. Les réglages du nom ne touchent pas aux coordonnées de paiement et ne
  déclenchent donc pas l'alerte de la comptabilité. **Le dépôt, le remplacement ou le retrait
  d'un logo la déclenchent**, comme un changement d'IBAN. Activer ou désactiver son affichage
  ne la déclenche pas.
- **Fichier refusé** (type, poids, image illisible) : rien n'est enregistré, le logo précédent
  reste en place et le message dit pourquoi.
- **Logo déposé mais affichage décoché** : le logo n'apparaît nulle part, mais il reste
  enregistré pour plus tard.
- **Logo très large ou très haut** : il garde ses proportions sans déformation, dans la hauteur
  de la ligne du nom et dans une largeur bornée. Sur la slide, il n'empiète jamais sur le titre,
  le QR code ou les moyens de don, et la slide tient toujours dans son cadre 16:9. Un logo très
  large laisse moins de place au nom, qui se réduit comme ci-dessus.
- **Logo retiré** : là où il était affiché, l'en-tête et la slide reprennent leur rendu sans
  logo.

## Critères d'acceptation

- [ ] Le paramétrage des dons propose, séparément pour la page publique et pour la slide,
      d'afficher ou de masquer le nom de l'église, et une taille parmi *Petit*, *Moyen*, *Grand*.
- [ ] Sans aucun réglage enregistré, la page et la slide s'affichent exactement comme avant cette
      évolution (nom affiché, taille *Petit*).
- [ ] Changer le réglage de la page ne modifie pas la slide, et inversement.
- [ ] Nom masqué : il n'apparaît ni dans l'en-tête de la page publique (pour le réglage de la
      page), ni sur l'aperçu, le plein écran ou l'image téléchargée de la slide (pour le réglage de
      la slide).
- [ ] Nom masqué sur la page : le titre de l'onglet du navigateur nomme toujours l'église.
- [ ] Les trois tailles donnent trois rendus visiblement distincts, sur la page comme sur la slide.
- [ ] Avec un nom d'église long (au moins 50 caractères) en taille *Grand*, la slide tient dans son
      cadre 16:9 sans chevauchement ni coupure, et la page reste sans défilement horizontal à
      320 px de large.
- [ ] Le choix de taille est inactif tant que le nom est masqué ; réafficher le nom retrouve la
      taille précédemment choisie.
- [ ] Toute modification de ces réglages est journalisée, sans alerte de la comptabilité.
- [ ] Seuls les rôles qui paramètrent déjà la page « Donner » peuvent modifier ces réglages, et
      déposer, remplacer ou retirer le logo.
- [ ] Un logo unique, pour fond sombre, se dépose, se remplace et se retire depuis le
      paramétrage. Il y est montré sur un fond sombre.
- [ ] Seuls les fichiers PNG, JPEG ou WebP d'au plus 2 Mo sont acceptés. Un SVG, un autre type,
      un fichier plus lourd ou une image illisible sont refusés avec un message, et le logo
      précédent reste en place.
- [ ] L'image affichée est celle enregistrée par le paramétrage. Aucun autre moyen ne permet de
      la remplacer, et ses métadonnées sont retirées.
- [ ] Avec « Afficher le logo » activé et un logo déposé, le logo apparaît dans l'en-tête de la
      page publique (pour le réglage de la page), ainsi que sur l'aperçu, le plein écran et
      l'image téléchargée de la slide (pour le réglage de la slide), sans déformation.
- [ ] Sans logo déposé, ou avec l'affichage désactivé, la page et la slide s'affichent sans logo.
- [ ] Un logo très large ou très haut ne fait pas déborder la slide de son cadre 16:9 et ne
      chevauche aucun autre élément.
- [ ] Le QR code de la slide a la même taille, et reste carré, avec ou sans nom et logo, quelles
      que soient la taille et la longueur du nom et les proportions du logo.
- [ ] Avec une adresse courte longue (par exemple `koinonia.iccrennes.fr/donner/icc-rennes`), le
      logo et le nom en taille *Grand* : l'adresse est lisible en entier, sur deux lignes, et le QR
      code garde sa taille.
- [ ] L'adresse sous le QR code n'est jamais rognée, quels que soient sa longueur et les réglages.
- [ ] La slide ne montre plus la phrase « Scanne le code ou tape l'adresse ».
- [ ] Le dépôt, le remplacement ou le retrait d'un logo est journalisé et alerte la comptabilité
      (à défaut, les Admins). Activer ou désactiver son affichage ne fait que journaliser.

## Hors périmètre

- Changer le texte affiché : le nom affiché reste le nom de l'église tel qu'il est enregistré,
  sans libellé personnalisé.
- La police, la couleur, la casse ou la position du nom.
- Une taille libre, au pixel près.
- Un logo commun à toute l'église, réutilisé par d'autres écrans (page « rejoindre », emails,
  menus) : le logo de cette spec appartient à la page de dons.
- Le recadrage ou la retouche du logo dans Koinonia.
- Le format SVG.
- Une version du logo pour fond clair : aucun des deux supports n'a de fond clair.
- Le choix de la taille ou de la position du logo.
- Le réglage des autres éléments de l'en-tête : titre « Donner », titre « Dîmes & Offrandes »,
  phrase d'introduction.
- Les autres pages publiques de l'église (formulaire « rejoindre », agenda public, écoute).

## Questions ouvertes

- Tranché le 2026-10-21 :
  - la portée : deux réglages séparés ;
  - les tailles du nom : trois tailles prédéfinies, *Petit* étant le rendu actuel ;
  - le logo : déposé dans le paramétrage des dons et intégré à cette spec, en une seule version
    pour fond sombre, car la slide et l'en-tête de la page sont tous deux sombres ;
  - la place de la ligne du nom et du logo sur la slide (démonstration) : titre réduit, phrase
    d'aide retirée, l'adresse se réduit avant le QR code.
- Aucune question bloquante.

# Spec — Publication audio des cultes : validation des séquences et diffusion par lien

- **Numéro** : 019
- **Statut** : Implémentée
- **Créée le** : 2026-08-23
- **Branche suggérée** : `feat/audio-cultes-publication`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

La diffusion audio des cultes est **à l'arrêt depuis le 14 juin 2026**. Ce n'est pas un problème
d'outil de dépôt : c'est le temps de montage. Aujourd'hui, publier un culte demande de réécouter
environ deux heures d'enregistrement sous un éditeur audio pour retrouver les frontières entre les
séquences (louanges, prière des STAR, sainte cène, dîmes et offrandes, prédication, annonces),
d'exporter cinq à six fichiers un par un, de les déposer sur un serveur en ligne de commande et
d'y ajuster des droits d'accès. Personne n'a ce temps chaque semaine, et la chaîne s'arrête dès
que la personne qui la porte est indisponible.

Deux conséquences mesurées :

- **Côté production** : la captation, elle, n'a jamais cessé — 23 sessions enregistrées en 2026,
  dont neuf après l'arrêt de la publication. La matière existe, elle ne sort pas.
- **Côté auditeurs** : cinq écoutes en deux mois sur la plateforme actuelle, zéro en juillet et en
  août. Elle impose un compte et un apprentissage, alors que le canal réellement utilisé par
  l'assemblée est WhatsApp — où circulent d'ailleurs des notes de culte prises à la main.

Trois défauts de qualité s'ajoutent au problème de temps : quatre séquences sur cinq dépassent le
seuil de saturation (jusqu'à +5,4 dB au-dessus du maximum sur une prédication), l'écart de volume
entre séquences atteint 8 dB — obligeant l'auditeur à corriger son volume en cours de culte — et
aucune information n'accompagne les fichiers hormis un titre et un numéro d'ordre.

Cette spec couvre la **première phase** : rendre possible la publication complète d'un culte, par
l'équipe de captation elle-même, sans éditeur audio et sans accès au serveur. La détection
automatique des frontières viendra ensuite ; elle divisera encore le temps de validation, mais
elle n'est pas nécessaire pour relancer la diffusion.

**Jalonnement P1 / P1.5.** Deux pratiques de dépôt coexistent réellement : la régie envoie soit
les **séquences déjà mixées et découpées** (un fichier par séquence — la pratique courante
aujourd'hui), soit le **mix du culte entier** à découper. P1 ne livre que le premier cas : c'est
lui qui débloque la diffusion, et il ne demande ni forme d'onde ni pose de frontières. Le dépôt
d'un mix à découper — et l'écran de découpage qui va avec — est livré en **P1.5**, décrit ici
(§2) pour que le modèle et le vocabulaire soient posés dès maintenant, mais explicitement hors
périmètre P1.

> Conception de référence : document « Koinonia Audio », révision 6 (décisions D1 à D10).

## Utilisateurs concernés

- **Resp. département et STAR du département de captation** — désormais autonomes : **tout membre
  du département** dépose les séquences d'un culte, les nomme et les ordonne, publie, et obtient
  le lien à partager. Aucun geste ne requiert un responsable, un administrateur, un éditeur audio
  ou un accès au serveur. Le département concerné est désigné dans la configuration de l'église,
  et non codé en dur : une autre église nommera le sien autrement.
- **Super Admin, Admin, Secrétaire** — accès en lecture à tous les cultes audio de l'église, et
  capacité d'intervenir (corriger un découpage, dépublier) sans être le passage obligé du flux.
- **Auditeurs (aucun compte)** — reçoivent un lien, l'ouvrent sur leur téléphone, écoutent une
  séquence, la partagent à leur tour.
- **Autres rôles (Ministre, Faiseur de Disciples, Reporter, STAR hors captation)** — aucun accès
  à l'espace de production ; ils sont des auditeurs comme les autres via le lien public.

## Comportement attendu

### 1. Déposer un culte

#### Scénario principal

1. Un membre du département de captation ouvre l'espace audio et choisit « Nouveau culte ».
2. Il rattache le dépôt à un **culte précis** — la liste des événements de la journée lui est
   proposée, ce qui lève l'ambiguïté les dimanches où deux cultes se suivent. Si aucun événement
   ne correspond, il saisit lui-même la date et le titre : un événement manquant au planning ne
   doit jamais empêcher une publication.
3. Il dépose les **séquences du culte, déjà mixées et découpées** — un fichier par séquence,
   tels que la régie les produit aujourd'hui — et renseigne l'orateur.
4. Le dépôt se poursuit même si la page est lente ; il voit une progression **fichier par
   fichier** et sait quand l'envoi est terminé.
5. Le culte apparaît dans la file d'attente du département, à l'état « à nommer ».

#### Cas limites

- **Si l'envoi est interrompu** (fermeture de la page, coupure réseau), le culte reste visible à
  l'état « dépôt incomplet » et l'envoi peut être repris sans tout recommencer : seuls les
  fichiers non encore arrivés sont renvoyés.
- **Si un fichier n'est pas un fichier audio exploitable**, il est refusé avec un message qui dit
  quoi déposer, pas seulement que c'est refusé — les autres fichiers du même dépôt ne sont pas
  perdus pour autant.
- **Si un culte a déjà été déposé** pour le même événement, l'utilisateur est prévenu avant de
  créer un doublon.
- **Si le culte est publié sans rattachement** à un événement, il peut être rattaché plus tard
  sans être redéposé ni republié.

### 2. Nommer et ordonner les séquences

Le mixage et la découpe ayant été faits en amont, il ne reste qu'à identifier les fichiers
déposés. C'est ce qui remplace les deux heures de réécoute sous éditeur audio.

#### Scénario principal

1. L'utilisateur ouvre un culte de la file d'attente à l'état « à nommer ».
2. Il voit la liste des fichiers déposés, avec leur nom de fichier d'origine, leur taille et leur
   durée — visibles en permanence pendant la saisie, pas seulement avant qu'il ne commence à
   nommer, pour qu'il puisse toujours faire correspondre une ligne au bon fichier.
3. Il donne un nom à chacun — une liste de noms usuels lui est proposée d'après le déroulé
   habituel de l'église, et il peut saisir un nom libre pour une séquence inhabituelle.
4. Il les remet dans l'ordre du culte si l'ordre d'arrivée ne correspond pas.
5. Il peut marquer un fichier comme non diffusé plutôt que de le supprimer (répétition, prise
   ratée).
6. Il valide. La normalisation et la préparation des fichiers se font sans qu'il attende devant
   l'écran ; il est informé quand c'est prêt.

#### Cas limites

- **Si l'ordre des séquences est inhabituel** (par exemple la prédication en deuxième position),
  rien ne l'empêche : aucun ordre n'est imposé.
- **Si le nombre de séquences diffère de l'habitude** (quatre, ou sept), c'est accepté.
- **Si un fichier a été oublié**, il peut être ajouté après coup sans redéposer les autres.
- **Si un fichier a été déposé par erreur** (mauvais fichier, doublon d'envoi), il peut être
  supprimé du dépôt tant que le culte n'a pas quitté l'écran de nommage — distinct de
  « non diffusé », qui garde le fichier pour une séquence réellement enregistrée mais écartée de
  la diffusion.
- **Si deux séquences portent le même nom**, la validation est refusée avec l'indication du
  doublon.
- **Si l'utilisateur quitte l'écran** sans valider, son travail est retrouvé tel quel à son retour.
- **Si un fichier est redéposé après publication** (correction d'un mix), seule cette séquence
  est refaite, et le lien public déjà partagé reste valable et pointe vers la version corrigée.

### 2 bis. Déposer un mix entier et le découper — **P1.5, hors périmètre P1**

Quand la régie n'a pas le temps de découper en amont, elle doit pouvoir déposer le mix du culte
entier et poser les frontières dans Koinonia. Ce parcours est décrit ici pour que le vocabulaire
et le modèle soient posés dès P1, mais **il n'est pas livré en P1** : les critères d'acceptation
de cette section ne s'appliquent qu'à P1.5.

#### Scénario principal

1. Au dépôt, l'utilisateur choisit « mix du culte entier » plutôt que « séquences déjà
   découpées » ; le culte arrive dans la file à l'état « à découper ».
2. Il voit la **forme d'onde complète** du culte, sur toute la largeur, avec la durée totale.
   L'affichage est immédiat : il n'attend pas le téléchargement de l'audio.
3. Une trame de séquences lui est proposée d'après le déroulé habituel de l'église. Il place ou
   déplace chaque frontière en la faisant glisser, ou au clavier pour un réglage fin.
4. À chaque frontière, il peut **écouter quelques secondes de part et d'autre** sans lancer la
   lecture du culte entier — c'est ce qui rend la vérification rapide.
5. Il nomme chaque séquence, puis valide. La suite (normalisation, publication, lien public) est
   identique au §2.

#### Cas limites

- **Si deux frontières se croisent** ou si une séquence devient vide, la validation est refusée
  avec l'indication de la séquence en cause.
- **Si les deux modes sont mélangés** sur un même culte (un mix *et* des séquences déjà
  découpées), l'utilisateur est prévenu : un culte suit un seul mode de dépôt.
- **Quand une frontière est corrigée après publication**, seules les séquences concernées sont
  refaites, et le lien public déjà partagé reste valable.

### 3. Publier et partager

#### Scénario principal

1. Une fois les fichiers prêts, l'utilisateur voit pour chaque séquence son **niveau sonore
   mesuré** et un signalement si quelque chose cloche.
2. Il publie. Un lien public est créé, qu'il copie et colle dans un groupe WhatsApp.
3. Collé dans une conversation, le lien affiche une **vignette lisible** : nom de l'église, date
   du culte, orateur, durée — sans quoi personne ne clique.

#### Ce que voit un auditeur

1. Il ouvre le lien sur son téléphone, sans compte et sans installer quoi que ce soit.
2. Il voit la liste des séquences du culte avec leur durée, et lance celle qui l'intéresse.
3. Il peut **avancer et reculer dans une séquence** — indispensable pour une prédication de 45
   minutes — et reprendre plus tard là où il s'était arrêté, sur le même téléphone.
4. Il peut partager **une séquence précise** : le lien qu'il obtient ouvre directement celle-ci.
5. Il peut télécharger une séquence pour l'écouter hors connexion.

#### Cas limites

- **Si le culte est dépublié**, les liens déjà partagés cessent de donner accès à l'audio et
  affichent un message clair plutôt qu'une erreur technique.
- **Si l'auditeur ouvre le lien sur un ordinateur**, la page reste utilisable.
- **Si une séquence a été marquée non diffusée**, elle n'apparaît jamais côté public.

### 4. Qualité sonore

1. Toutes les séquences publiées ont un **volume homogène** : l'auditeur ne touche pas à son
   volume en passant de la louange à la prédication.
2. Aucune séquence publiée ne sature.
3. Chaque fichier porte les informations qui permettent de le retrouver hors de Koinonia : titre
   de la séquence, culte, date, orateur, ordre, et une image de couverture.
4. La couverture par défaut est celle de l'église, réglée une fois ; elle peut être remplacée sur
   un culte précis — série de prédications, événement particulier.

### 5. Retrouver l'audio depuis l'événement

1. Sur la fiche d'un événement auquel un audio publié est rattaché, un accès à l'écoute est
   proposé aux membres connectés qui voient déjà cet événement.
2. Réciproquement, la page d'écoute d'un culte renvoie vers ce qui s'est passé ce dimanche-là
   pour ceux qui ont un compte — l'événement et ce qui y est attaché.
3. Un membre qui n'a pas de compte n'est jamais renvoyé vers une page qui lui demanderait de se
   connecter : il reste sur la page publique.

### 6. Savoir si la diffusion repart

1. Pour chaque culte publié, l'équipe voit **combien de fois le lien a été ouvert** et combien de
   fois chaque séquence a été lancée.
2. Ces compteurs sont visibles depuis la file d'attente du département, sans écran dédié.

Le diagnostic qui a motivé cette fonctionnalité repose sur ce chiffre — cinq écoutes en deux mois.
Sans lui, on ne saura pas si le lien WhatsApp fait mieux que la plateforme actuelle.

## Critères d'acceptation

- [ ] Un membre du département de captation peut publier un culte complet **sans éditeur audio,
      sans accès au serveur et sans intervention d'un administrateur**.
- [ ] Un dépôt de plusieurs séquences interrompu en cours d'envoi peut être repris sans renvoyer
      les fichiers déjà arrivés.
- [ ] Un dépôt est rattaché à un événement précis, y compris un dimanche où deux cultes se suivent.
- [ ] Un culte peut être publié sans événement au planning, puis rattaché plus tard sans être
      redéposé.
- [ ] Chaque séquence déposée peut être nommée depuis une liste de noms usuels ou en saisie libre.
- [ ] L'ordre des séquences peut être modifié après dépôt, et un ordre différent de l'habitude est
      accepté, tout comme un nombre de séquences différent de l'habitude.
- [ ] Une séquence peut être ajoutée après coup sans redéposer les autres.
- [ ] Deux séquences du même culte ne peuvent pas porter le même nom.
- [ ] Un nommage en cours est retrouvé intact après avoir quitté puis rouvert l'écran.
- [ ] Après validation, chaque séquence donne un fichier audio distinct, lisible sur un téléphone
      sans application dédiée.
- [ ] **Aucune séquence publiée ne dépasse −1 dB de crête** ; l'écart de volume perçu entre deux
      séquences d'un même culte est **inférieur à 1 dB**.
- [ ] Chaque fichier publié porte titre, date, orateur, ordre et couverture.
- [ ] La couverture par défaut de l'église s'applique sans intervention, et peut être remplacée
      sur un culte précis.
- [ ] Le lien public s'ouvre sans compte et sans installation.
- [ ] Collé dans WhatsApp, le lien affiche titre, date, orateur et une image.
- [ ] Depuis le lien public, on peut avancer dans une séquence de 45 minutes sans attendre son
      chargement complet.
- [ ] Une séquence dispose de son propre lien, qui l'ouvre directement.
- [ ] Reprendre l'écoute plus tard sur le même appareil repart de l'endroit quitté.
- [ ] Redéposer une séquence corrigée après publication ne refait que cette séquence et ne change
      pas le lien déjà partagé.
- [ ] Dépublier un culte rend les liens partagés inopérants avec un message compréhensible.
- [ ] Depuis la fiche d'un événement ayant un audio publié, un membre connecté atteint l'écoute
      en un clic.
- [ ] Depuis la page d'écoute, un membre connecté atteint l'événement correspondant ; un visiteur
      sans compte ne se voit jamais proposer un lien qui exigerait une connexion.
- [ ] Le nombre d'ouvertures du lien et de lectures par séquence est visible par l'équipe depuis
      la file d'attente du département.
- [ ] Chaque publication et chaque dépublication est tracée : qui, quand, quoi.
- [ ] Tout membre du département de captation — responsable comme STAR — peut mener un culte du
      dépôt à la publication sans l'intervention d'un tiers.
- [ ] Un utilisateur sans droit sur le département de captation ne peut ni déposer, ni valider,
      ni publier ; un utilisateur d'une autre église ne voit rien de ces cultes.

### Critères propres à P1.5 (dépôt d'un mix à découper — hors P1)

- [ ] Le dépôt d'un mix interrompu en cours d'envoi peut être repris sans repartir de zéro.
- [ ] L'écran de découpage affiche la forme d'onde du culte entier **en moins de 3 secondes**,
      sans avoir téléchargé l'audio complet.
- [ ] Chaque frontière peut être écoutée de part et d'autre sans lire le culte entier.
- [ ] Une frontière peut être déplacée à la souris et au clavier.
- [ ] Corriger une frontière après publication ne refait que les séquences concernées et ne change
      pas le lien déjà partagé.

## Hors périmètre

- **Dépôt d'un mix entier et découpage dans Koinonia** (forme d'onde, pose de frontières) — **P1.5**,
  décrit au §2 bis. En P1, seules des séquences déjà découpées sont déposées : c'est la pratique
  courante de la régie, et elle suffit à relancer la diffusion sans construire l'écran de
  découpage.
- **Détection automatique des frontières** — phase suivante, et sans objet tant que le découpage
  se fait en amont.
- **Agent de dépôt sur le poste de captation** (mixage local des sources, envoi automatique) —
  phase suivante. En P1 les séquences sont déposées à la main depuis le navigateur, et le mixage
  reste fait en amont par la régie.
- **Transcription et recherche plein texte** — phase ultérieure.
- **Archivage des sources multipistes et leur purge** — traité avec l'agent de dépôt.
- **Bibliothèque et recherche** (par orateur, série, thématique, période), pages de série et
  d'orateur : fonctionnalité à part entière, spécifiée séparément. Elle suppose un catalogue, que
  cette phase commence seulement à constituer.
- **Reprise des 413 fichiers déjà publiés** sur la plateforme actuelle : elle reste en place en
  archive interne. Sa reprise n'a d'intérêt qu'avec la bibliothèque, et sera traitée avec elle.
- **Flux de podcast public (RSS) et référencement externe.**
- **Statistiques d'écoute détaillées** (durée écoutée, courbes d'abandon, provenance). Seuls les
  compteurs d'ouverture et de lecture sont attendus en P1.

## Questions ouvertes

*Tranché lors de la revue du 23 août 2026 :* un audio publié est accessible depuis la fiche de
l'événement et renvoie vers lui ; tout membre du département de captation peut publier ;
le rattachement à un événement est facultatif ; les compteurs d'ouverture et de lecture sont dans
le périmètre ; la couverture est celle de l'église, remplaçable culte par culte ; le lien public
n'expire pas mais la dépublication reste possible ; aucune validation par le secrétariat ou la
pastorale n'est requise avant publication — la traçabilité remplace le contrôle a priori.

Restent à trancher, sans bloquer le plan :

- La liste des noms de séquences proposés est configurable par église. Faut-il pouvoir la
  réordonner pour refléter le déroulé habituel, ou un simple jeu de noms suffit-il en P1 ?
- Quelle durée conserver les fichiers publiés ? Aucune limite n'est prévue à ce stade ; la
  question se posera avec l'archivage des sources, traité avec l'agent de dépôt.
- Le renvoi depuis la page d'écoute vers l'événement doit-il aussi pointer vers la galerie photos
  du même dimanche quand elle existe, ou s'en tenir à l'événement ?

# Spec — Bibliothèque d'écoute des cultes

- **Numéro** : 021
- **Statut** : En revue *(questions ouvertes tranchées — prête pour `/plan`)*
- **Créée le** : 2026-08-26
- **Branche suggérée** : `feat/audio-bibliotheque-ecoute`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Les cultes sont désormais enregistrés, découpés en séquences, normalisés et publiés (spec 019).
Chaque publication produit une page d'écoute partageable. Mais **rien ne permet de retrouver un
enregistrement une fois le lien perdu ou jamais reçu**.

Aujourd'hui il n'existe qu'un seul chemin vers l'écoute : la feuille de service d'un STAR
programmé sur l'événement concerné. Conséquences directes :

- un membre qui n'était pas de service ce dimanche-là ne voit rien ;
- un membre absent au culte — précisément celui à qui l'enregistrement sert le plus — n'a aucun
  moyen d'y accéder depuis l'application ;
- personne ne peut réécouter une prédication d'il y a trois mois sans retrouver le message où le
  lien avait été diffusé.

L'effort d'enregistrement, de nommage et de normalisation ne produit donc de valeur que pour les
personnes déjà destinataires d'un partage ponctuel. La spec 020 corrige l'accès de l'équipe de
production et la récupération du lien après publication ; elle ne traite délibérément pas
l'accès de l'assemblée, qui est une fonctionnalité à part entière et non une question
d'ergonomie.

**Pourquoi maintenant** : les enregistrements s'accumulent dès la mise en service. Chaque
dimanche sans point d'accès est un enregistrement que personne ne réécoutera, et un historique
qui devient d'autant plus coûteux à rendre navigable plus tard.

## Utilisateurs concernés

- **Membre de l'église (STAR)** — utilisateur principal : veut réécouter la prédication de
  dimanche, rattraper un culte manqué, ou retrouver un message précis dont il se souvient du
  thème ou de l'orateur.
- **Responsable de département, Ministre** — mêmes usages, plus le partage vers les personnes
  qu'ils accompagnent.
- **Faiseur de Disciples** — s'appuie sur un enseignement précis dans son accompagnement et a
  besoin de le retrouver puis de le transmettre.
- **Secrétaire, Admin** — vérifient ce qui est effectivement accessible à l'assemblée, et
  constatent l'écart avec ce qui a été publié.
- **Personne extérieure à l'église** — hors périmètre en tant qu'utilisateur de la bibliothèque :
  elle continue d'accéder à un enregistrement par un lien de partage reçu, pas par une liste.

## Comportement attendu

### Scénario principal — retrouver un culte passé

1. Un membre ouvre l'application dans la semaine, ayant manqué le culte du dimanche.
2. La navigation lui propose un accès aux **enregistrements des cultes**.
3. Il y trouve les cultes publiés, du plus récent au plus ancien, chacun identifié par sa date,
   son titre et son orateur.
4. Il ouvre celui de dimanche dernier et écoute, séquence par séquence, comme sur la page
   d'écoute partagée.
5. Il peut partager ce qu'il écoute avec quelqu'un d'autre.

### Scénario — retrouver un enseignement précis

1. Un Faiseur de Disciples se souvient d'une prédication sur un thème donné, sans en connaître
   la date.
2. Depuis la liste des enregistrements, il **combine plusieurs critères** — orateur, période,
   type de rassemblement — et **saisit librement quelques mots du titre** dont il se souvient.
3. Il choisit aussi l'ordre d'affichage qui l'arrange (le plus récent d'abord, ou par orateur).
4. Il retrouve l'enregistrement, l'écoute, et transmet le lien à la personne qu'il accompagne.

### Scénario — aller droit à la séquence voulue

1. Un membre veut réécouter la prédication seule, sans la louange qui la précède.
2. Depuis un enregistrement, chaque séquence est listée par son nom et sa durée, et s'écoute
   directement.
3. Il peut partager **cette séquence précise**, et non l'enregistrement entier.

### Scénario — reprendre une écoute interrompue

1. Un membre écoute une prédication de quarante minutes dans les transports et s'arrête en
   chemin.
2. À sa prochaine visite, l'application lui propose de **reprendre où il s'était arrêté**, sur
   ce même appareil.
3. S'il préfère, il repart du début : la reprise est proposée, jamais imposée.
4. Une séquence écoutée jusqu'au bout n'est plus proposée à la reprise.

### Scénario — écouter depuis la fiche d'un événement

1. Un membre consulte un événement passé au planning.
2. Si un enregistrement publié lui est rattaché, il peut l'écouter directement, sans passer par
   la liste.

### Scénarios alternatifs / cas limites

- **Si aucun culte n'est encore publié**, la bibliothèque explique qu'il n'y a pas encore
  d'enregistrement disponible plutôt que d'afficher une page vide.
- **Si un culte est dépublié**, il disparaît immédiatement de la bibliothèque — celle-ci ne
  montre que ce qui est publié à l'instant de la consultation.
- **Si un culte n'a pas d'orateur ou de titre renseigné**, il reste identifiable par sa date et
  reste accessible : une information manquante ne doit pas rendre un enregistrement introuvable.
- **Si l'utilisateur consulte sur un téléphone**, l'écoute reste confortable : c'est le support
  d'usage majoritaire pour ce besoin, souvent en déplacement et sur un réseau mobile.
- **Si aucun critère de recherche ne donne de résultat**, l'écran le dit et permet de revenir à
  la liste complète sans avoir à défaire ses filtres un par un.
- **Si l'utilisateur change d'appareil**, la reprise d'écoute peut ne pas le suivre : c'est
  acceptable pour cette version, mais il ne doit jamais se voir proposer une reprise erronée.
- **Si un enregistrement est dépublié alors qu'une écoute était en cours**, la reprise n'est
  plus proposée et l'utilisateur comprend que l'enregistrement n'est plus disponible.
- **Si un culte appartient à une autre église**, il n'apparaît jamais : la bibliothèque est celle
  de l'église de l'utilisateur.

## Critères d'acceptation

- [ ] Un membre sans rôle particulier atteint la bibliothèque depuis la navigation et y voit les
      cultes publiés de son église, du plus récent au plus ancien.
- [ ] Chaque enregistrement est identifié par sa date, son titre et son orateur lorsqu'ils sont
      renseignés, et reste identifiable par sa date sinon.
- [ ] L'écoute d'un culte depuis la bibliothèque offre la même expérience que la page d'écoute
      partagée (séquences, navigation entre elles).
- [ ] Un culte dépublié n'apparaît plus dans la bibliothèque.
- [ ] Un culte d'une autre église n'apparaît jamais.
- [ ] Un membre peut combiner plusieurs critères (orateur, période, type de rassemblement) et
      les cumuler avec une recherche libre sur le titre.
- [ ] Un membre peut choisir l'ordre d'affichage de la liste.
- [ ] Une recherche sans résultat est signalée comme telle, avec un retour immédiat à la liste
      complète.
- [ ] Les séquences d'un enregistrement sont listées avec leur nom et leur durée, et chacune
      s'écoute et se partage individuellement.
- [ ] Une écoute interrompue est proposée à la reprise lors de la visite suivante sur le même
      appareil, sans jamais être imposée ; une séquence écoutée jusqu'au bout ne l'est plus.
- [ ] Depuis un enregistrement de la bibliothèque, un membre peut obtenir un lien à partager.
- [ ] La fiche d'un événement passé auquel un enregistrement publié est rattaché permet de
      l'écouter.
- [ ] Sur téléphone, la liste et l'écoute sont utilisables sans zoom ni défilement horizontal.
- [ ] Aucune régression : les liens de partage déjà diffusés continuent de fonctionner à
      l'identique.

## Hors périmètre

- **La production des enregistrements** (dépôt, nommage, rendu, publication) : couverte par la
  spec 019, inchangée ici.
- **L'ergonomie de l'espace de production et sa navigation** : couvertes par la spec 020.
- **Une bibliothèque publique, ouverte hors authentification** : le partage d'un enregistrement
  au-delà de l'église continue de passer par un lien de partage ponctuel.
- **Le téléchargement des enregistrements** pour écoute hors ligne.
- **Les fonctionnalités reportées en P1.5 / P2** de la spec 019 (découpage assisté,
  transcription, recherche dans le contenu parlé) : rien n'est avancé ici. En particulier, la
  recherche envisagée porte sur ce qui est saisi (titre, orateur, date), pas sur le contenu
  audio.
- **Les statistiques d'écoute** et leur restitution aux responsables.

## Questions ouvertes

*Tranchées avec le demandeur le 2026-08-26, avant passage au plan :*

- **Qui accède à la bibliothèque ?** → **tout membre authentifié** de l'église. Cohérent avec le
  fait qu'un enregistrement est déjà partageable publiquement par lien : restreindre la liste
  plus que le lien n'aurait pas de sens.
- **Finesse de recherche pour la première version** → **filtre et tri multi-critères sur tous les
  champs pertinents** (date, orateur, type de rassemblement) **et** recherche libre sur le titre.
- **Mémoriser la position d'écoute** → **oui**, par appareil, proposée et jamais imposée.
- **Exposer les séquences individuellement** → **oui**, chacune écoutable et partageable.

*Aucune question bloquante ne subsiste : la spec peut passer à `/plan`.*

Points de vigilance à traiter dans le plan, sans impact sur le comportement attendu :

- Le **volume de données servi** devient significatif dès que l'écoute n'est plus réservée aux
  quelques personnes ayant reçu un lien : une bibliothèque ouverte à toute l'église multiplie
  les lectures d'un même enregistrement. Tranché : les enregistrements sont mis en cache au plus
  près pour ne pas payer le transfert à chaque écoute — voir
  [ADR-0008](../../docs/adr/0008-cache-disque-renditions-audio.md). Ce point conditionne le coût
  de fonctionnement, pas le comportement perçu, à une exception près que le plan doit vérifier :
  la reprise d'écoute et le déplacement dans une piste supposent que la lecture partielle reste
  possible.
- La **reprise d'écoute** suppose de savoir où en était l'auditeur, information qui n'est
  aujourd'hui conservée nulle part. Le plan doit trancher où elle vit — sur l'appareil ou
  rattachée au compte — en sachant que la spec n'exige la reprise que sur le même appareil.
- Le **type de rassemblement**, utilisé ici comme critère de filtre, n'est pas une notion
  normalisée aujourd'hui (voir le même point de vigilance dans la spec 020). Cette spec en
  dépend : si la 020 ne le fixe pas, le filtre par type portera sur des valeurs hétérogènes.

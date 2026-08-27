# Spec — Ergonomie et navigation du module audio

- **Numéro** : 020
- **Statut** : Implémentée
- **Créée le** : 2026-08-26
- **Branche suggérée** : `feat/audio-ergonomie-navigation`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

La publication audio des cultes (spec 019) fonctionne désormais de bout en bout : dépôt des
séquences, nommage, rendu sonore normalisé, publication et lien public. Mais **le module est
introuvable pour qui ne connaît pas ses adresses par cœur** : rien, nulle part dans
l'application, ne mène à l'espace audio ni à ses paramètres.

Le symptôme s'est manifesté en recette de la façon la plus nette possible : la personne qui
administre l'outil a demandé *où l'on configure les noms usuels des séquences* — alors que
l'écran existe et fonctionne. Elle ne pouvait pas le trouver. Le même constat vaut pour la file
d'attente des cultes elle-même, atteinte jusqu'ici en tapant l'adresse.

Au-delà de l'accès, la mise au point s'est faite par correctifs successifs guidés par des
retours de terrain. Les écrans sont fonctionnellement corrects mais n'ont jamais été relus
comme un tout : on ne peut pas revenir à la file d'attente depuis un culte ouvert, la fiche
d'un événement ne signale pas qu'un enregistrement lui est rattaché (sauf pour un STAR
consultant sa feuille de service), et la hiérarchie des actions — déposer, publier, dépublier,
supprimer — n'a pas été pensée ensemble.

**Pourquoi maintenant** : la fonctionnalité entre en service pour de vrai. Un module qu'on
n'atteint pas est un module qui ne sera pas utilisé, et chaque correctif d'ergonomie livré
après l'adoption coûte plus cher qu'avant.

## Utilisateurs concernés

- **Membre du département de captation** (un STAR, quel que soit son rôle par ailleurs) —
  utilisateur principal au quotidien : il dépose les séquences après le culte, les nomme, les
  ordonne et publie. C'est lui qui subit le plus l'absence de point d'entrée, car il n'a aucun
  autre motif de fréquenter les écrans d'administration.
- **Secrétaire** — consulte les cultes audio et peut intervenir sur un dépôt sans être le
  passage obligé du flux.
- **Admin / Super Admin** — configurent le module : quel département est responsable de la
  captation, quels noms de séquences sont proposés au nommage, quelle image de couverture par
  défaut. Ce sont eux qui n'ont pas trouvé l'écran de configuration.
- **Ministre, Faiseur de Disciples, Reporter, STAR hors captation** — n'ont pas accès à
  l'espace de production. Pour eux, rien ne doit apparaître : une entrée de navigation menant à
  un refus d'accès est pire que pas d'entrée du tout.

## Comportement attendu

### Scénario principal — atteindre l'espace audio

1. Un membre du département de captation ouvre l'application après le culte du dimanche.
2. La navigation principale lui propose une entrée **Audio évènements**, rangée avec les autres activités
   de production de contenu (aux côtés des Médias et des Demandes) — visible parce qu'il
   appartient au département de captation, indépendamment de son rôle.
3. Il l'active et arrive directement sur la file d'attente des enregistrements, où il retrouve
   ceux en cours de préparation et ceux déjà publiés — cultes du dimanche comme autres
   rassemblements.
4. Il ouvre l'enregistrement du jour, dépose ses séquences, les nomme, publie.
5. À tout moment il peut **revenir à la file d'attente** depuis l'enregistrement ouvert, sans
   passer par le bouton « précédent » du navigateur.

### Scénario — configurer les noms usuels des séquences

1. Un Admin veut que le nommage propose les intitulés réellement employés par son église
   (« Louange », « Prédication », « Appel au salut »…) plutôt que la liste générique par défaut.
2. Depuis la partie configuration de l'application, il trouve une entrée dédiée au module audio.
3. Il y règle le département de captation, les noms de séquences proposés et l'image de
   couverture par défaut.
4. De retour sur un culte, les noms qu'il a saisis sont ceux proposés au nommage des séquences.

### Scénario — savoir depuis un événement qu'un enregistrement existe

1. Une Secrétaire consulte un événement passé au planning.
2. La fiche de l'événement indique qu'un culte audio lui est rattaché et dans quel état il se
   trouve — **en préparation** (avec l'avancement) ou **publié**.
3. Elle peut rejoindre ce culte audio d'un geste, sans repasser par la file d'attente et sans
   chercher lequel correspond.
4. Un STAR consultant sa feuille de service pour ce même événement ne voit, lui, que l'accès à
   l'écoute d'un enregistrement **publié** : un dépôt en cours ne lui est jamais montré.

### Scénario — enregistrer autre chose qu'un culte

1. Le département de captation enregistre un séminaire de deux jours, qui n'a pas d'événement
   au planning.
2. Il crée un dépôt sans rattachement, et **indique de quel type de rassemblement il s'agit** —
   la même nomenclature que celle employée pour les événements du planning.
3. Ce type accompagne ensuite l'enregistrement : il l'identifie dans la file d'attente, et
   permettra plus tard de s'y retrouver parmi des centaines d'enregistrements.
4. S'il rattache un événement, le type de cet événement s'applique sans qu'il ait à le ressaisir ;
   la saisie manuelle ne sert qu'en l'absence de rattachement.

### Scénario — récupérer le lien d'écoute après publication

1. Un membre du département de captation vient de publier le culte.
2. L'écran lui présente immédiatement le **lien d'écoute public** correspondant, et lui permet
   de le copier d'un geste pour le diffuser (message au groupe, réseaux sociaux, site).
3. Ce lien reste accessible depuis le culte publié — il ne faut pas avoir su le copier au bon
   moment pour le retrouver ensuite.
4. Il peut ouvrir le lien pour vérifier ce que verra le public avant de le diffuser.

5. Il en va de même pour un enregistrement **sans événement rattaché** : le lien s'obtient
   depuis l'enregistrement lui-même, jamais depuis un événement.

> Aujourd'hui, publier ne donne accès à aucun lien : la seule façon d'atteindre l'écoute est la
> feuille de service d'un STAR programmé sur cet événement. Une publication dont personne ne
> peut récupérer l'adresse n'est pas réellement publiée — et un enregistrement sans événement
> rattaché n'a, lui, aucune adresse récupérable du tout.

> Il s'agit bien de récupérer **le lien d'écoute**, pas le fichier : le téléchargement des
> enregistrements reste hors périmètre (voir spec 021).

### Scénarios alternatifs / cas limites

- **Si l'utilisateur n'a aucun accès au module** (ni par son rôle, ni par appartenance au
  département de captation), aucune entrée « Audio évènements » n'apparaît nulle part.
- **Si aucun département de captation n'est configuré**, le module est inactif : les personnes
  qui administrent l'outil doivent comprendre depuis l'écran de configuration que c'est ce
  réglage qui manque, plutôt que de découvrir un espace audio qui ne sert à rien.
- **Si aucun nom usuel n'est configuré**, le nommage propose une liste par défaut — le
  fonctionnement actuel — et l'écran de configuration indique que c'est le cas.
- **Si l'utilisateur consulte sur un téléphone**, l'accès au module et les actions d'un culte
  restent utilisables : c'est le cas d'usage réel de la régie, qui dépose depuis la salle.
  L'entrée « Audio évènements » vit dans le menu complet et **non** dans la barre de navigation réduite du
  bas, réservée aux destinations les plus fréquentes de tous les utilisateurs.
- **Si le culte est dépublié**, le lien d'écoute cesse de fonctionner et l'écran le dit — celui
  qui dépublie doit comprendre que les liens déjà diffusés ne mèneront plus à rien.
- **Si un enregistrement n'est rattaché à aucun événement** — cas courant, et non l'exception :
  tout ce qu'on enregistre n'est pas un culte du dimanche inscrit au planning (enseignement,
  conférence, séminaire, réunion de prière, intervention ponctuelle). Il doit rester tout aussi
  accessible que les autres, sans dépendre d'un rattachement. La fiche d'événement est un chemin
  d'accès **supplémentaire**, jamais le chemin principal, et le rattachement doit rester
  possible après coup sans redéposer.
- **Le vocabulaire des écrans ne doit pas laisser croire que seuls les cultes sont concernés.**
  Un utilisateur qui vient déposer l'enregistrement d'un séminaire doit se reconnaître dans ce
  qu'il lit, et ne pas hésiter à créer un dépôt parce que l'écran ne parle que de « cultes ».

### Ergonomie des écrans d'un culte

- Les actions d'un culte se distinguent visuellement selon leur portée : déposer et nommer sont
  courantes, publier engage la diffusion, dépublier et supprimer sont destructrices ou
  irréversibles et ne doivent pas pouvoir être déclenchées par inadvertance.
- Un culte ouvert indique clairement **où l'on en est** : ce qui reste à faire pour publier, ce
  qui est en cours de traitement, ce qui a échoué.
- Les messages d'erreur disent quoi faire, pas seulement que quelque chose a échoué.

## Critères d'acceptation

- [x] Un membre du département de captation, sans rôle d'administration, voit une entrée
      « Audio évènements » dans la navigation et atteint la file d'attente sans saisir d'adresse.
- [x] Un Super Admin, un Admin et une Secrétaire voient également cette entrée.
- [x] Un Ministre, un Faiseur de Disciples, un Reporter et un STAR hors captation ne la voient
      pas.
- [x] Un Admin atteint l'écran de configuration du module audio depuis la navigation, sans
      saisir d'adresse.
- [x] Depuis un culte ouvert, un retour explicite ramène à la file d'attente.
- [x] Les noms de séquences saisis en configuration sont ceux proposés au nommage ; en leur
      absence, la liste par défaut s'applique.
- [x] La fiche d'un événement auquel un culte audio est rattaché l'indique — en préparation
      (avec l'avancement) ou publié — et permet de le rejoindre.
- [x] Un STAR consultant sa feuille de service ne voit un accès à l'écoute que si
      l'enregistrement est publié ; un dépôt en préparation ne lui est jamais montré.
- [x] L'entrée « Audio évènements » n'apparaît pas dans la barre de navigation réduite du bas sur mobile.
- [x] Sur un téléphone, l'entrée « Audio évènements », la file d'attente et les actions d'un culte sont
      utilisables sans zoom ni défilement horizontal.
- [x] Un enregistrement sans événement rattaché se retrouve et s'ouvre depuis la file d'attente
      exactement comme les autres, avec les mêmes actions disponibles.
- [x] Le vocabulaire des écrans du module couvre tout type de rassemblement enregistré, sans se
      restreindre au culte du dimanche ; l'entrée de navigation s'intitule « Audio évènements ».
- [x] Un enregistrement sans événement rattaché permet de saisir son type de rassemblement ;
      avec un événement rattaché, le type de l'événement s'applique sans ressaisie.
- [x] Le type d'un enregistrement est visible dans la file d'attente.
- [x] Après publication, le lien d'écoute public est affiché sur l'enregistrement et copiable
      d'un geste ; il reste consultable ensuite tant que l'enregistrement est publié.
- [x] Le lien s'obtient de la même façon avec ou sans événement rattaché.
- [x] Dépublier un culte est signalé comme rendant inopérants les liens déjà diffusés.
- [x] Les actions destructrices (dépublier, supprimer) sont visuellement distinctes des actions
      courantes et demandent confirmation.
- [x] Aucune régression : les parcours de la spec 019 (dépôt, nommage, publication, lien
      public) fonctionnent à l'identique.

## Hors périmètre

- **La navigation des autres modules** : seule l'absence d'accès au module audio est traitée.
  Le fait que d'autres modules déclarent une navigation sans qu'elle soit exploitée est un
  constat à traiter séparément, pas ici.
- **Le lecteur public** (page d'écoute partagée) : son ergonomie n'est pas revue. Seule la
  *récupération* de son adresse depuis l'espace de production entre dans le périmètre.
- **La consultation des enregistrements par l'assemblée** (retrouver un culte passé sans avoir
  reçu de lien, sans avoir été programmé ce jour-là) : traitée par la spec 021.
- **Les fonctionnalités reportées en P1.5 / P2** de la spec 019 (découpage assisté,
  transcription, mixage multipiste) : rien n'est avancé ici.
- **Le contenu des permissions** : qui a le droit de quoi ne change pas ; seule la *visibilité*
  des points d'entrée s'aligne sur les droits existants.
- **La refonte de la file d'attente** en tant que telle (filtres, recherche, tri avancés) :
  seuls l'accès et la cohérence des actions sont concernés.

## Questions ouvertes

*Tranchées avec le demandeur le 2026-08-26, avant passage au plan :*

- **Emplacement de l'entrée « Audio évènements »** → section **Opérations**, aux côtés des Médias et des
  Demandes. Motif retenu : même type d'utilisateurs et même nature de travail — produire et
  publier un livrable — plutôt qu'un rattachement au cycle de vie d'un événement.
- **Navigation mobile réduite** → **non**. La barre du bas reste réservée aux destinations les
  plus fréquentes de tous les utilisateurs ; la régie passe par le menu complet.
- **États signalés sur la fiche d'événement** → **publiés et en préparation**, avec
  l'avancement, pour les personnes ayant accès au module. La feuille de service d'un STAR
  conserve son comportement actuel : accès à l'écoute uniquement si l'enregistrement est publié.

*Aucune question bloquante ne subsiste : la spec peut passer à `/plan`.*

Points de vigilance à traiter dans le plan, sans impact sur le comportement attendu :

- La visibilité de l'entrée « Audio évènements » dépend de l'appartenance au département de captation, une
  information qui n'est pas de même nature que les droits de rôle utilisés jusqu'ici pour
  décider ce qu'affiche la navigation.
- Le type de rassemblement n'est aujourd'hui **pas une notion normalisée** : les événements du
  planning portent un type saisi sans liste fermée (« CULTE », « PRIERE »… selon ce qui a été
  créé), et un enregistrement n'en porte aucun. Le plan doit dire si l'on se contente de
  reprendre l'existant tel quel ou si l'on fixe une nomenclature — et, dans ce second cas,
  traiter le sort des valeurs déjà en base.
- L'élargissement du vocabulaire au-delà du « culte » touche des libellés présents dans tout le
  module, y compris des messages d'erreur et des textes vus par le public. Le plan doit dire
  jusqu'où il va — libellés d'interface seuls, ou également les noms employés en interne — et
  assumer que s'arrêter aux libellés laisse une incohérence visible pour qui lit le code.

# Spec — Message récapitulatif des offres au format WhatsApp

- **Numéro** : 035
- **Statut** : Implémentée
- **Créée le** : 2026-08-30
- **Branche suggérée** : `feat/recap-whatsapp-offres`
- **Issue** : #464

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

La section « Offres » liste les offres d'emploi, de stage et d'alternance publiées par la
communauté. Elle vit **dans** l'application : pour qu'une offre trouve un candidat, il faut
qu'un membre pense à ouvrir la section. En pratique, la diffusion réelle se fait ailleurs —
dans les groupes WhatsApp de l'église, où les gens sont déjà.

Aujourd'hui, un responsable qui veut relayer les offres du moment dans un groupe doit ouvrir
chaque offre, recopier l'intitulé, l'entreprise, le lieu, puis recomposer un message à la main.
C'est fastidieux, donc ça ne se fait pas — ou ça se fait mal (offres oubliées, informations
tronquées, message différent à chaque fois). Les offres restent visibles par les seuls membres
qui pensent à venir les consulter, alors qu'elles ont une durée de vie courte.

Le besoin est modeste et précis : **produire en un geste un message texte prêt à coller**, qui
résume les offres actuellement affichées, dans un format lisible dans WhatsApp.

Cette feature complète le cycle de vie des offres (spec 034) : celle-ci garantit que la liste
reste à jour, celle-là la fait sortir de l'application.

## Utilisateurs concernés

Le module emploi est **transverse** : il n'appartient à aucune église et il est ouvert à tous les
utilisateurs authentifiés.

| Rôle | Ce qu'il peut faire |
|---|---|
| Tous les rôles ayant accès à la section Offres (Super Admin, Admin, Secrétaire, Ministre, Resp. département, STAR, Faiseur de Disciples, Reporter, Qualificateur d'agenda, Comptable) | Générer et récupérer le message récapitulatif des offres affichées |

**Décision : aucune restriction de rôle supplémentaire.** Le message ne contient que des
informations que l'utilisateur voit déjà à l'écran ; en restreindre la copie ne protégerait rien
et priverait de l'outil ceux qui animent réellement les groupes (souvent des membres sans rôle
d'administration). L'accès à la section Offres suffit.

## Comportement attendu

### Scénario principal

1. Un responsable ouvre la section Offres. Sept offres sont publiées, il les voit toutes.
2. Il déclenche l'action « Copier pour WhatsApp », proposée à côté de la liste.
3. Un message texte est composé à partir des **sept offres affichées**, dans l'ordre où elles
   apparaissent à l'écran, et placé dans le presse-papier de son appareil.
4. Une confirmation visible lui indique que le message a été copié, et combien d'offres il
   contient.
5. Il bascule dans WhatsApp, colle le message dans le groupe et l'envoie sans le retoucher.
6. Un membre du groupe lit le message : il identifie chaque offre (type, intitulé, entreprise,
   lieu) et dispose du moyen d'accéder au détail dans l'application.

### Scénarios alternatifs / cas limites

- **Si l'utilisateur a activé un filtre de type** (Emploi, Stage ou Alternance), le message ne
  contient **que les offres de ce filtre**, et son en-tête l'indique explicitement (par exemple
  « Stages disponibles » plutôt que « Offres disponibles »). Le principe est le même que pour
  l'export des demandes d'intégration (spec 033) : **le message reflète l'écran**, sans exception
  cachée. Une offre absente de l'écran ne peut pas apparaître dans le message.
- **Si aucune offre ne correspond à l'affichage courant** (liste vide), l'action n'est pas
  proposée. On ne produit jamais un message vide ou un message annonçant qu'il n'y a rien.
- **Si la copie dans le presse-papier échoue ou n'est pas disponible** (navigateur qui la refuse,
  contexte non sécurisé, permission bloquée), l'utilisateur ne reste pas devant un échec muet :
  le message composé lui est **affiché à l'écran, sélectionnable**, afin qu'il puisse le copier
  manuellement. L'erreur est explicite (« la copie automatique n'a pas fonctionné, voici le
  texte »).
- **Si une offre n'a pas de lieu renseigné**, la ligne correspondante est omise plutôt que de
  laisser un séparateur orphelin ou une mention « non renseigné ».
- **Si une offre porte une date limite de candidature**, celle-ci apparaît dans le message : c'est
  l'information qui crée l'urgence et déclenche la candidature.
- **Quand une offre disparaît de la liste** (archivée, date limite dépassée), elle ne peut plus
  figurer dans un message généré ensuite. Un message déjà envoyé dans WhatsApp reste tel quel :
  c'est un texte figé, la spec n'a aucune prise dessus — d'où l'importance que chaque offre
  renvoie vers l'application, seule source à jour.
- **Quand le destinataire n'est pas connecté** et suit le lien d'une offre, il arrive sur l'écran
  de connexion de l'application. C'est le comportement attendu et assumé : les offres sont
  réservées à la communauté, le message est un relais vers l'application, pas une publication
  publique.

### Forme du message

Le message est un **texte simple**, sans pièce jointe ni mise en forme autre que celle que
WhatsApp interprète nativement. Il comporte :

1. Un **en-tête** indiquant la nature de la liste et le nombre d'offres.
2. Un **bloc par offre**, séparé des autres par une ligne vide, contenant dans cet ordre :
   le type d'offre, l'intitulé, l'entreprise, le lieu (si renseigné), la date limite (si
   renseignée), et le moyen d'accéder au détail.
3. Un **pied de message** rappelant où consulter l'ensemble des offres.

Illustration (le libellé exact relève de l'implémentation) :

```
📋 Offres d'emploi — 3 offres disponibles

*Développeur web full-stack*
Emploi · ACME · Rennes
À postuler avant le 15 septembre
https://…/jobs/abc123

*Stage marketing digital*
Stage · Beta SARL · Nantes
https://…/jobs/def456

*Alternance comptabilité*
Alternance · Gamma
https://…/jobs/ghi789

👉 Toutes les offres : https://…/jobs
```

Le message ne contient **aucune coordonnée de contact** (email ou lien externe de candidature)
des offres. Ces coordonnées appartiennent à l'auteur de l'offre, qui les a déposées dans une
application réservée à la communauté : les recopier dans un message destiné à être transféré
sans contrôle les exposerait bien au-delà de ce à quoi il a consenti. Le lien vers l'offre joue
ce rôle, sous authentification.

## Critères d'acceptation

- [ ] Une action de copie du récapitulatif est proposée dans la section Offres, visible pour tout
      utilisateur ayant accès à cette section.
- [ ] Le message généré contient exactement les offres affichées à l'écran au moment du clic —
      ni plus, ni moins.
- [ ] Avec le filtre « Stage » actif, le message ne contient que des stages, et son en-tête
      annonce des stages.
- [ ] Sans filtre actif, le message contient toutes les offres visibles, dans le même ordre qu'à
      l'écran.
- [ ] Chaque offre du message porte au minimum : son type, son intitulé, son entreprise et le
      lien vers son détail.
- [ ] Le lieu apparaît quand il est renseigné, et la ligne est absente sinon (aucune mention
      « non renseigné », aucun séparateur orphelin).
- [ ] La date limite de candidature apparaît quand elle est renseignée, dans un format lisible en
      français.
- [ ] Aucune adresse email ni lien de candidature externe issu d'une offre n'apparaît dans le
      message.
- [ ] Le message se termine par un renvoi vers la liste complète des offres.
- [ ] Après une copie réussie, une confirmation visible indique le succès et le nombre d'offres
      copiées.
- [ ] Le message collé dans WhatsApp s'affiche correctement : blocs séparés, pas de caractères
      parasites, pas de balisage non interprété.
- [ ] Quand la liste affichée est vide, l'action de copie n'est pas proposée.
- [ ] Quand la copie automatique échoue, le message est affiché à l'écran sous une forme
      sélectionnable, accompagné d'une explication.
- [ ] Aucune donnée n'est modifiée par cette action : générer un récapitulatif ne change ni le
      statut ni le contenu d'une offre.

## Hors périmètre

- **Envoi automatique vers WhatsApp** : aucune intégration à une API WhatsApp, aucun envoi de
  message par l'application. L'utilisateur colle lui-même dans la conversation de son choix.
- **Les onglets Freelance et Recherche d'emploi** : la feature ne concerne que les offres
  d'emploi/stage/alternance. Si le besoin s'étend, ce sera une autre spec.
- **Personnalisation du modèle de message** par l'utilisateur ou par église (choix des champs,
  ton, emojis) : le format est le même pour tous.
- **Autres canaux** (SMS, email, réseaux sociaux) : le format visé est celui de WhatsApp. Un
  texte simple reste collable ailleurs, mais aucun format alternatif n'est produit.
- **Publication programmée ou récurrente** d'un récapitulatif : l'action est manuelle, déclenchée
  par un utilisateur.
- **Statistiques de partage** : on ne mesure pas qui copie, quand, ni ce qu'il en advient.
- **Accès public aux offres sans authentification** : le lien continue de mener à une application
  protégée.

## Questions ouvertes

*Aucune. Les deux arbitrages ouverts ont été tranchés avant le plan :*

- **Liens** — le message porte **un lien par offre** (le lecteur ouvre directement celle qui
  l'intéresse) **et** un lien vers la liste complète en pied de message.
- **Volume** — **aucun plafond**. L'utilisateur maîtrise déjà le volume via le filtre de type, et
  tronquer silencieusement contredirait le principe « le message reflète l'écran ».

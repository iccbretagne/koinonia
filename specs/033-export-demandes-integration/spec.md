# Spec — Export Excel des demandes d'intégration

- **Numéro** : 033
- **Statut** : Implémentée
- **Créée le** : 2026-08-30
- **Branche suggérée** : `feat/export-demandes-integration`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.

## Contexte & problème

La page **« Demandes d'intégration »** liste les personnes ayant soumis une demande
d'intégration familiale — le plus souvent depuis le formulaire public de l'église, parfois
saisie par l'équipe. Elle offre deux moyens de restreindre la liste :

- des **pastilles de statut** (Tous, En attente, Assignés, Contactés, WhatsApp, Intégrés,
  Abandonnés), chacune affichant son compte ;
- une **recherche texte libre** portant sur le nom, le prénom, le téléphone, l'email et la
  famille assignée.

Un compteur en bas de page indique combien de demandes correspondent aux filtres actifs.

**Le problème : cette liste ne sort pas de l'application.** Or l'essentiel du travail de
l'équipe Intégration se fait ailleurs — réunion hebdomadaire de répartition, préparation
d'un appel téléphonique en binôme, publipostage d'invitation, point de suivi avec les
bergers. Aujourd'hui, chacun de ces usages impose de **recopier les lignes à la main**,
avec le coût et les erreurs de transcription que cela suppose (un chiffre de téléphone
faux, c'est une personne qu'on ne rappelle jamais).

Le besoin est donc simple à énoncer : **pouvoir extraire dans un tableur la liste
exactement telle qu'elle est affichée**, filtres compris. Un export qui ignorerait les
filtres obligerait à refaire le tri dans le tableur et raterait la cible : ce qu'on veut
sortir, c'est « les 12 demandes en attente qui restent à assigner », pas les 400 demandes
de l'historique.

Un export équivalent existe déjà ailleurs dans l'application (vue d'ensemble des absences).
La cohérence de comportement avec celui-ci est un objectif en soi : même geste, même type
de fichier, mêmes attentes.

## Utilisateurs concernés

L'accès à la page d'intégration ne suit pas le tableau des rôles habituel : il combine des
rôles et une **appartenance au département Intégration**, et il peut être **restreint à
certaines familles**.

| Qui | Voit la page | Peut exporter |
|---|---|---|
| **Super Admin** | Toutes les demandes de l'église | **Oui** |
| **Admin**, **Secrétaire** | Toutes les demandes de l'église | **Oui** |
| **Membres du département Intégration** (quel que soit leur rôle, y compris STAR) | Toutes les demandes de l'église | **Oui** |
| **Berger / co-berger d'une famille** | Uniquement les demandes assignées à **sa** ou ses familles | **Non** |
| Tout autre rôle | Aucun accès à la page | Non |

**Pourquoi le berger ne peut pas exporter alors qu'il voit les données.** Extraire n'est
pas consulter : un fichier quitte l'application, se transfère, s'oublie sur un disque et ne
se révoque pas. L'application applique déjà cette distinction ailleurs — le droit
d'exporter les données de discipolat est volontairement plus restreint que le droit de les
consulter. On reste cohérent avec ce principe : le berger travaille ses familles dans
l'application, l'extraction reste un geste d'équipe.

Concrètement, l'action d'export **n'est pas proposée** à qui n'y a pas droit, et une
tentative de contournement est refusée.

## Comportement attendu

### Scénario principal — préparer la réunion de répartition

1. Un membre de l'équipe Intégration ouvre la page « Demandes d'intégration ».
2. Il clique sur la pastille **« En attente »** : la liste se réduit aux demandes non
   encore assignées, le compteur affiche « 12 demandes ».
3. Il déclenche l'**export**.
4. Son navigateur télécharge un **fichier tableur** dont le nom porte la **date du jour**.
5. Il l'ouvre : le fichier contient **exactement 12 lignes** de données, sous une ligne
   d'en-têtes lisibles en français — les mêmes 12 personnes qu'à l'écran, ni plus, ni
   moins.
6. Il le partage avec l'équipe pour la répartition.

### Scénario — cibler une famille

1. La même personne tape le nom d'une famille dans la **recherche**.
2. La liste se réduit aux demandes rattachées à cette famille.
3. Elle exporte : le fichier ne contient que ces demandes-là. **Les deux filtres se
   combinent** — un statut et une recherche actifs ensemble produisent l'intersection,
   comme à l'écran.

### Scénario — le berger n'exporte pas

1. Un berger ouvre la page : il voit les demandes de sa famille.
2. **Aucune action d'export ne lui est proposée.**

### Contenu du fichier

Une ligne par demande, une colonne par information, dans cet ordre :

| Colonne | Contenu |
|---|---|
| Nom | Nom de famille |
| Prénom | Prénom |
| Téléphone | Vide si non renseigné |
| Email | Vide si non renseigné |
| Adresse | Adresse postale, vide si non renseignée |
| Ville | Vide si non renseignée |
| Tranche d'âge | Jeune (−18 ans) / Jeune adulte (18–30 ans) / Adulte (30–60 ans) / Senior (60+ ans) |
| Statut dans l'église | Visiteur / Régulier / Engagé |
| Appel au salut | Oui / Non |
| Soin pastoral demandé | Oui / Non |
| Famille assignée | Vide si non assignée |
| Berger assigné | Vide si non assigné |
| Statut de la demande | En attente / Assigné / Contacté / WhatsApp ajouté / Intégré / Abandonné |
| Date de soumission | Date |
| Date d'assignation | Date, vide si l'étape n'a pas eu lieu |
| Date de contact | Date, vide si l'étape n'a pas eu lieu |
| Date d'ajout WhatsApp | Date, vide si l'étape n'a pas eu lieu |
| Date d'intégration | Date, vide si l'étape n'a pas eu lieu |

Les libellés du fichier sont ceux **affichés à l'écran** (« En attente », « Adulte
(30–60 ans) »…), jamais des codes internes : le fichier est lu par des humains qui
n'ouvrent pas l'application.

**Volontairement absents du fichier** : les **notes internes** de l'équipe et le **motif
d'abandon**. Ce sont des champs de texte libre où l'équipe consigne des éléments
confidentiels sur des personnes (situation familiale, difficultés, raisons d'un
abandon). Un tableur circule par mail et se retrouve dans des boîtes qu'on ne maîtrise
pas : ces deux champs restent dans l'application, où leur accès est tracé.

L'**adresse postale** figure en revanche au fichier lorsqu'elle a été renseignée (cellule
vide sinon) : la répartition géographique par famille d'impact se fait à l'adresse, pas à
la ville. Décision révisée le 2026-09-04 — la version initiale de la spec excluait
l'adresse au profit de la seule ville.

### Traçabilité

Chaque export est **journalisé** : qui l'a déclenché, quand, et combien de lignes il
contenait. Extraire des données personnelles est une action dont l'église doit pouvoir
rendre compte ; sans trace, la question « qui a sorti ce fichier ? » reste sans réponse.

### Scénarios alternatifs / cas limites

- **Si aucune demande ne correspond aux filtres**, l'export n'est pas proposé (ou reste
  sans effet) : on ne télécharge pas un fichier vide sans le dire.
- **Si une personne a saisi dans le formulaire public une valeur que le tableur pourrait
  prendre pour une formule** (un nom ou une adresse commençant par `=`, `+`, `-`, `@`), le
  fichier produit doit la présenter comme du **texte**, jamais comme un calcul à exécuter.
  Ces valeurs viennent de visiteurs non authentifiés : rien ne garantit leur innocuité, et
  le fichier sera ouvert sur le poste d'un membre de l'équipe.
- **Si l'utilisateur a changé d'église** (bascule multi-église) entre l'affichage de la
  liste et l'export, **aucune demande d'une autre église** ne peut se retrouver dans le
  fichier.
- **Si une demande a été archivée** (archivage automatique à 12 mois) elle n'apparaît ni à
  l'écran ni dans le fichier.
- **Si une demande a été modifiée ou supprimée** entre l'affichage et l'export, le fichier
  reflète l'**état au moment de l'export** ; une demande disparue en est simplement
  absente, sans message d'erreur bloquant.
- **Si la liste affichée est très longue** (plusieurs centaines de demandes), l'export
  aboutit tout de même, sans dégrader la page.
- **Quand une demande n'a pas franchi toutes les étapes** du parcours, les dates des étapes
  non atteintes sont **vides**, jamais remplies d'une valeur de remplacement.

## Critères d'acceptation

- [ ] Une action d'export est proposée sur la page « Demandes d'intégration » aux membres
      de l'équipe Intégration, aux Admin, Secrétaire et Super Admin.
- [ ] Cette action **n'est pas proposée** à un berger/co-berger au périmètre restreint.
- [ ] Une tentative d'export par un utilisateur sans le droit est **refusée**, même en
      contournant l'interface.
- [ ] Le fichier téléchargé s'ouvre dans un tableur et porte un nom contenant la **date du
      jour**.
- [ ] Le fichier contient **exactement** les demandes affichées à l'écran au moment de
      l'export : même nombre de lignes que le compteur de la page.
- [ ] Le filtre de **statut** est respecté par l'export.
- [ ] La **recherche texte** est respectée par l'export.
- [ ] Les deux filtres **combinés** produisent l'intersection, à l'écran comme dans le
      fichier.
- [ ] Le fichier comporte une ligne d'en-têtes en français et les **18 colonnes** listées
      ci-dessus, dans cet ordre.
- [ ] Les valeurs sont les **libellés affichés à l'écran**, pas des codes internes.
- [ ] Les colonnes « Appel au salut » et « Soin pastoral demandé » valent **Oui** ou
      **Non**.
- [ ] Les dates d'étapes non atteintes sont **vides**.
- [ ] Le fichier **ne contient ni** les notes internes, **ni** le motif d'abandon.
- [ ] La colonne « Adresse » reprend l'adresse postale quand elle est renseignée, et reste
      **vide** sinon.
- [ ] Une valeur commençant par `=`, `+`, `-` ou `@` est présentée comme du **texte** dans
      le tableur, et n'y est jamais évaluée comme une formule.
- [ ] Aucune demande d'une **autre église** ne figure dans le fichier, quelles que soient
      les données envoyées par le navigateur.
- [ ] Aucune demande **archivée** ne figure dans le fichier.
- [ ] Chaque export produit une **entrée de journal** indiquant l'auteur, la date et le
      nombre de lignes exportées.
- [ ] Un export de plusieurs centaines de lignes aboutit sans erreur.

## Hors périmètre

- **L'ajout de nouveaux filtres** au tableau de bord (période de soumission, famille,
  berger, tranche d'âge, marqueurs pastoraux). L'export se contente des deux filtres
  existants ; l'enrichissement des filtres fera l'objet d'une demande distincte.
- **Le choix des colonnes par l'utilisateur** au moment de l'export : le jeu de colonnes
  est fixe.
- **Tout autre format** que le tableur : ni CSV, ni PDF, ni impression.
- **L'export des autres écrans du module intégration** : parcours, bergers, statistiques,
  suivis MSDP.
- **L'export des demandes archivées**, et tout écran de consultation de l'archive.
- **L'envoi du fichier par email** ou son dépôt automatique quelque part : l'export est un
  téléchargement déclenché par l'utilisateur.
- **La modification du tableau de bord** au-delà de l'ajout de l'action d'export : les
  colonnes affichées, le bandeau « À traiter » et le compteur restent inchangés.
- **Toute évolution du modèle de données** : la feature n'expose que des informations déjà
  saisies.

## Questions ouvertes

*Toutes tranchées le 2026-08-30 :*

- **Colonnes** → « annuaire + marqueurs pastoraux ». Notes internes et motif d'abandon
  exclus (texte libre confidentiel). L'adresse postale, d'abord exclue elle aussi, a été
  réintégrée le 2026-09-04 : elle est nécessaire à la répartition géographique.
- **Filtres** → les deux filtres existants uniquement (statut + recherche texte).
- **Droit d'export** → équipe Intégration, Admin, Secrétaire, Super Admin. Le berger au
  périmètre restreint consulte mais n'extrait pas, par cohérence avec le traitement déjà
  retenu pour l'export de discipolat.
- **Traçabilité** → export journalisé (auteur, date, nombre de lignes).

---

*Étape suivante : `/plan`.*

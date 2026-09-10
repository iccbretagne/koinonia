# Spec — Feuille d'annonces d'un culte

- **Numéro** : 040
- **Statut** : Validée
- **Créée le** : 2026-09-11
- **Branche suggérée** : `feat/annonces-hebdomadaires`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Chaque semaine, le Secrétariat et/ou la Coordination préparent la **feuille d'annonces** lue
pendant le culte. Aujourd'hui c'est un document Word (docx) qui circule par WhatsApp ou mail :
le modérateur, la Coordination et les équipes techniques et médias ne savent pas toujours où
trouver la dernière version, ni si elle a été modifiée.

Koinonia gère déjà les **demandes d'annonce** déposées par les départements (circuit de
validation par le Secrétariat), mais pas le **document final consolidé** qui en résulte. Cette
feature donne un endroit unique où ce document est déposé et récupéré, **rattaché à l'événement
(culte) auquel il se rapporte**.

## Utilisateurs concernés

- **Déposent** (et peuvent retirer) :
  - le Secrétariat : rôle Secrétaire et membres du département ayant la fonction Secrétariat ;
  - la Coordination : le Ministre et les responsables de département du ministère
    « Coordination générale » ;
  - Admin et Super Admin.
- **Récupèrent** (téléchargement) :
  - les membres du département **Modération** (le modérateur de service en fait partie) ;
  - la Coordination ;
  - les membres des départements ayant la fonction **Communication**, **Régie** (captation) et
    **Production média** ;
  - les déposants eux-mêmes.
- Les autres rôles et membres ne voient pas la feuille d'annonces.

## Comportement attendu

### Scénario principal

1. En fin de semaine, une personne du Secrétariat ouvre le culte de dimanche prochain.
2. Elle y dépose la feuille d'annonces (docx ou PDF).
3. Le document apparaît immédiatement sur cet événement, avec la date de dépôt et le nom du
   déposant.
4. Les lecteurs reçoivent une notification dans l'application les invitant à la récupérer.
5. Le modérateur, la Coordination et les équipes Communication, Régie et Production média
   retrouvent la feuille depuis l'événement (et depuis une liste des feuilles des prochains
   cultes) et la téléchargent.

### Scénarios alternatifs / cas limites

- **Si** une nouvelle version est déposée pour le même culte, elle remplace la précédente pour
  les lecteurs ; la date de mise à jour est visible et les lecteurs sont de nouveau notifiés.
- **Si** aucune feuille n'est encore déposée pour un culte à venir, les lecteurs voient
  « pas encore disponible » plutôt qu'une ancienne feuille.
- **Si** le fichier n'est ni un docx ni un PDF, ou est trop volumineux, le dépôt est refusé avec
  un message clair.
- **Quand** une personne sans droit tente d'accéder à une feuille (lien partagé), l'accès est refusé.
- **Si** l'événement est supprimé, sa feuille d'annonces disparaît avec lui.
- **Multi-église** : une feuille n'est visible que dans l'église de son événement.
- Un déposant peut retirer une feuille déposée par erreur.
- Les feuilles des cultes passés restent consultables par les mêmes lecteurs.

## Critères d'acceptation

- [ ] Le Secrétariat, la Coordination, Admin et Super Admin peuvent déposer une feuille
      d'annonces (docx ou PDF) sur un événement.
- [ ] Une seule feuille est visible par événement ; un nouveau dépôt la remplace et affiche sa
      date de mise à jour.
- [ ] Les membres de la Modération, de la Coordination et des départements Communication, Régie
      et Production média peuvent la télécharger.
- [ ] Aucun autre utilisateur n'y a accès, y compris par lien direct.
- [ ] Les lecteurs sont notifiés dans l'application à chaque dépôt.
- [ ] L'absence de feuille pour un culte à venir est signalée explicitement.
- [ ] Un format autre que docx/PDF est refusé avec un message clair.
- [ ] Les feuilles sont cloisonnées par église.
- [ ] Dépôt et récupération sont utilisables sur mobile.

## Hors périmètre

- Génération automatique de la feuille à partir des demandes d'annonce validées.
- Édition ou prévisualisation du document dans Koinonia (le téléchargement suffit).
- Notification par e-mail.
- Diffusion externe (réseaux sociaux, site web).
- Modification du circuit existant des demandes d'annonce par les départements.

## Décisions (clarifications du 2026-09-11)

- Unité : **une feuille par événement** (culte).
- « Coordination » = le ministère **Coordination générale**.
- Modérateur de service = membres du **département Modération**.
- Départements lecteurs : fonctions **Communication**, **Régie** et **Production média**.
- Formats : **docx et PDF** ; **téléchargement** seul ; notification **dans l'application**.

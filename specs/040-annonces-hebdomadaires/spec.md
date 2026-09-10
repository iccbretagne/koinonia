# Spec — Feuille d'annonces hebdomadaire

- **Numéro** : 040
- **Statut** : Brouillon
- **Créée le** : 2026-09-11
- **Branche suggérée** : `feat/annonces-hebdomadaires`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Chaque semaine, le Secrétariat et/ou la Coordination préparent la **feuille d'annonces** lue
pendant le culte. Aujourd'hui c'est un document Word (docx) qui circule par WhatsApp ou mail :
le modérateur du culte, la Coordination et les départements concernés ne savent pas toujours
où trouver la dernière version, ni si elle a été modifiée.

Koinonia gère déjà les **demandes d'annonce** déposées par les départements (circuit de
validation par le Secrétariat), mais pas le **document final consolidé** qui en résulte. Cette
feature donne un endroit unique où ce document est déposé et récupéré.

## Utilisateurs concernés

- **Déposants** : le Secrétariat (rôle Secrétaire et membres du département fonction
  Secrétariat) et la Coordination [À CLARIFIER: « Coordination » = le ministère « Coordination
  générale » (son Ministre et ses responsables de département), ou un rôle/une personne précise ?].
  Admin et Super Admin peuvent aussi déposer.
- **Lecteurs** :
  - le **modérateur de service** du culte concerné [À CLARIFIER: comment Koinonia sait qui est
    modérateur — une tâche « Modération » assignée dans le planning d'un département, un
    département dédié, ou simplement un rôle existant ?] ;
  - la Coordination ;
  - les départements du **MCIM** [À CLARIFIER: quel ministère désigne « MCIM » ; tous ses
    départements (responsables et STAR) ou seulement les responsables ?].
- Les autres rôles ne voient pas la feuille d'annonces.

## Comportement attendu

### Scénario principal

1. En fin de semaine, une personne du Secrétariat ouvre l'espace « Annonces de la semaine ».
2. Elle choisit le culte concerné [À CLARIFIER: une feuille par **semaine** ou par **culte /
   événement** ? par défaut : par événement de type culte], et dépose le document (docx).
3. Le document apparaît immédiatement pour ce culte, avec la date de dépôt et le nom du déposant.
4. Le modérateur, la Coordination et les départements du MCIM retrouvent la feuille depuis leur
   espace et la téléchargent (ou la consultent directement dans le navigateur
   [À CLARIFIER: consultation en ligne attendue, ou le téléchargement suffit ?]).
5. [À CLARIFIER: les lecteurs reçoivent-ils une notification (cloche / e-mail) au dépôt ?
   par défaut : notification dans l'application.]

### Scénarios alternatifs / cas limites

- **Si** une nouvelle version est déposée pour le même culte, elle remplace la précédente pour
  les lecteurs ; la date de mise à jour est visible pour qu'on sache qu'elle a changé.
- **Si** aucune feuille n'est encore déposée pour le prochain culte, les lecteurs voient un
  message explicite (« pas encore disponible ») plutôt qu'une ancienne feuille sans avertissement.
- **Si** le fichier n'est pas dans un format accepté ou est trop volumineux, le dépôt est refusé
  avec un message clair [À CLARIFIER: docx seulement, ou aussi PDF ?].
- **Quand** une personne sans droit tente d'accéder à une feuille (lien partagé), l'accès est refusé.
- **Multi-église** : une feuille n'est visible que dans l'église où elle a été déposée.
- Un déposant peut retirer une feuille déposée par erreur.

## Critères d'acceptation

- [ ] Le Secrétariat et la Coordination peuvent déposer une feuille d'annonces rattachée à un culte.
- [ ] Le modérateur du culte, la Coordination et les départements du MCIM peuvent la récupérer.
- [ ] Aucun autre rôle n'y a accès, y compris par lien direct.
- [ ] Un nouveau dépôt remplace la version visible et affiche sa date de mise à jour.
- [ ] L'absence de feuille pour le prochain culte est signalée explicitement.
- [ ] Un format non accepté est refusé avec un message clair.
- [ ] Les feuilles sont cloisonnées par église.
- [ ] L'espace est utilisable sur mobile (dépôt et récupération).

## Hors périmètre

- Génération automatique de la feuille à partir des demandes d'annonce validées.
- Édition du document dans Koinonia.
- Diffusion externe (réseaux sociaux, site web).
- Modification du circuit existant des demandes d'annonce par les départements.

## Questions ouvertes

- [À CLARIFIER: « Coordination » — ministère Coordination générale ou rôle précis ?]
- [À CLARIFIER: identification du modérateur de service]
- [À CLARIFIER: périmètre « MCIM »]
- [À CLARIFIER: unité — semaine ou culte]
- [À CLARIFIER: formats acceptés]
- [À CLARIFIER: consultation en ligne ou téléchargement]
- [À CLARIFIER: notification au dépôt]
- Conservation de l'historique : par défaut, les feuilles passées restent consultables par les
  mêmes lecteurs.

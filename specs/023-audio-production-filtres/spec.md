# Spec — Filtres et tris multicritères de la file Production audio

- **Numéro** : 023
- **Statut** : Implémentée
- **Créée le** : 2026-08-28
- **Branche suggérée** : `feat/audio-production-filtres`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.

## Contexte & problème

L'onglet **Production** du module audio (page « Audio évènements ») présente la
file de tous les enregistrements de culte de l'église, du plus récent au plus
ancien. Aujourd'hui elle n'offre qu'**un seul filtre** (le statut) et **aucun
tri au choix** de l'utilisateur.

La migration des archives Audiobookshelf (spec 022) ajoute d'un coup environ 80
cultes historiques (2024 → aujourd'hui) à cette file. Sans moyen de filtrer ou
de trier finement, retrouver un enregistrement précis — pour le nommer, le
republier, vérifier son découpage — devient laborieux : il faut faire défiler
une longue liste homogène.

Le besoin : permettre de **restreindre** la file selon plusieurs critères
combinables et de **réordonner** selon la colonne pertinente, pour que
l'équipe de captation et le secrétariat travaillent efficacement sur un
historique volumineux.

## Utilisateurs concernés

Les utilisateurs qui accèdent à l'onglet Production :

- **Super Admin**, **Admin**, **Secrétaire** — accès complet à la file.
- **Membres du département de captation audio** (STAR de ce département) — accès
  à la file au titre de leur rattachement, sans rôle dédié.

Tous voient et utilisent les mêmes filtres et tris. La feature ne change aucun
droit : elle n'ajoute ni ne retire de visibilité, elle aide seulement à
naviguer dans ce qui est déjà visible. Les autres rôles, qui n'accèdent pas à
l'onglet Production, ne sont pas concernés.

## Comportement attendu

### Scénario principal

1. Un membre de la captation ouvre l'onglet Production. La file s'affiche
   complète, triée par date de service décroissante (comportement actuel
   inchangé par défaut).
2. Il veut retrouver les cultes de 2025 prêchés par un orateur donné. Il
   choisit l'**année 2025** dans le filtre de période et sélectionne cet
   **orateur** dans la liste déroulante. La file ne montre plus que les
   enregistrements correspondant aux deux critères à la fois.
3. Il clique sur l'en-tête de la colonne **Ouvertures** : la file se réordonne
   par nombre d'écoutes ouvertes décroissant. Un second clic inverse l'ordre.
4. Il ouvre un enregistrement pour le traiter, puis revient à la file : ses
   filtres et son tri sont toujours actifs.
5. Il efface les filtres d'un seul geste et retrouve la file complète.

### Filtres proposés (tous combinables entre eux — résultat = intersection)

- **Statut** — filtre existant, conservé (Brouillon, À nommer, Rendu en cours,
  Publié, Dépublié).
- **Type de rassemblement** — restreint à un type (Culte, Autre, etc.).
- **Période** — restreint à une plage de dates de service : sélection rapide
  par **année**, ou saisie d'une **date de début et/ou de fin**.
- **Recherche texte** — champ libre ; ne conserve que les enregistrements dont
  le **titre du message** ou le **nom de l'orateur** contient le texte saisi
  (insensible à la casse et aux accents).
- **Orateur** — liste déroulante des orateurs présents dans la file, plus une
  option **« Sans orateur »** qui isole les enregistrements sans orateur
  renseigné (cas fréquent des cultes 2024 migrés).

### Tris proposés (clic sur l'en-tête de colonne, bascule croissant / décroissant)

- **Date de service** — tri par défaut, décroissant.
- **Statut** — regroupe les enregistrements par statut, en plaçant en tête ceux
  qui demandent une action (À nommer, Rendu en cours).
- **Nombre de séquences** — pour repérer les dépôts vides ou anormaux.
- **Ouvertures** — par popularité d'écoute.

Un seul critère de tri actif à la fois ; changer de colonne remplace le tri
précédent.

### Scénarios alternatifs / cas limites

- **Si aucun enregistrement ne correspond** aux filtres, la file affiche un
  message explicite (« Aucun enregistrement ne correspond aux filtres ») et non
  une liste vide sans explication.
- **Si un enregistrement n'a ni titre ni orateur**, la recherche texte ne le
  fait jamais « planter » : il est simplement absent des résultats d'une
  recherche non vide, et présent quand la recherche est vide.
- **Quand la période saisie a une fin antérieure à son début**, le système
  n'affiche aucun résultat et signale l'incohérence de la plage.
- **Quand plusieurs enregistrements ont la même valeur** sur le critère de tri
  (même date, même nombre de séquences…), leur ordre relatif reste stable et
  prévisible (départage par date de service décroissante).
- **Quand l'utilisateur applique un filtre puis crée un nouvel enregistrement**
  depuis cette page, il revient à la file avec ses filtres toujours actifs.
- **La liste déroulante des orateurs** ne contient que des valeurs réellement
  présentes dans la file de l'église courante — pas d'orateurs d'autres
  églises, pas de doublons de casse.

## Critères d'acceptation

- [x] À l'ouverture, la file est identique à aujourd'hui : tout l'historique,
      trié par date de service décroissante, aucun filtre actif hormis un
      éventuel filtre mémorisé de la session.
- [x] Les cinq filtres (statut, type, période, recherche texte, orateur)
      peuvent être actifs simultanément ; le résultat est l'intersection.
- [x] Le filtre de période permet de sélectionner une année entière **ou** une
      plage début/fin ; seuls les enregistrements dont la date de service est
      dans l'intervalle restent affichés.
- [x] La recherche texte filtre sur titre **et** orateur, insensible à la casse
      et aux accents, sans erreur sur les enregistrements sans titre/orateur.
- [x] Le filtre orateur propose « Sans orateur » et cette option n'affiche que
      les enregistrements sans orateur renseigné.
- [x] Cliquer sur les en-têtes Date, Statut, Séquences, Ouvertures réordonne la
      file selon cette colonne ; un second clic inverse le sens.
- [x] Le tri par statut place les statuts « à traiter » (À nommer, Rendu en
      cours) avant les autres.
- [x] Un bouton / geste unique remet la file à zéro (tous filtres effacés, tri
      par défaut).
- [x] Après ouverture d'un enregistrement puis retour à la file, les filtres et
      le tri de l'utilisateur sont conservés.
- [x] Quand aucun résultat ne correspond, un message explicite est affiché.
- [x] Le compteur de résultats visibles est indiqué (« N enregistrements »)
      pour que l'utilisateur mesure l'effet de ses filtres.
- [x] Aucune donnée d'une autre église n'apparaît, quel que soit le filtre.

## Hors périmètre

- L'onglet **(re)Écouter** (bibliothèque d'écoute des membres) et sa recherche
  propre.
- L'onglet **Paramètres** du module audio.
- La **pagination** de la file et tout chargement incrémental : le volume
  attendu reste de quelques centaines de lignes.
- L'**export** de la file filtrée (CSV ou autre).
- Toute modification des colonnes affichées, du contenu des enregistrements, ou
  du parcours de dépôt / nommage / publication.
- La recherche ou le filtrage dans les écrans d'administration audio
  (`/admin/...`).

## Questions ouvertes

*Toutes tranchées le 2026-08-28 :*

- **Persistance des filtres** → conservés **pendant la navigation** (retour
  depuis un détail, création d'un enregistrement) ; **réinitialisés au
  rechargement complet** de la page. Pas d'état dans l'URL.
- **Ordre du tri par statut** → **À nommer → Rendu en cours → Brouillon →
  Publié → Dépublié**.
- **Filtre statut** → reste un **choix unique** (comportement actuel inchangé).

# Spec — Migration des cultes Audiobookshelf vers la bibliothèque d'écoute

- **Numéro** : 022
- **Statut** : Implémentée (script + tests unitaires) — critères d'acceptation à cocher lors de la passe recette (T38-T39)
- **Créée le** : 2026-08-28
- **Branche suggérée** : `feat/migration-audiobookshelf`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Le détail technique (lecture du système de fichiers Audiobookshelf, création
> des enregistrements, dépôt des fichiers, enchaînement du rendu) va dans
> `plan.md`. Le relevé d'inventaire et les décisions déjà arrêtées sont dans
> `reflexion.md` (même dossier).

## Contexte & problème

ICC Rennes publie depuis mi-2024 l'audio de ses cultes sur **Audiobookshelf**,
une application tierce hébergée sur le même serveur que Koinonia. Deux
bibliothèques y coexistent :

- **« cultes »** : ~79 cultes, un par date, chacun découpé en plusieurs pistes
  (prière des STAR, louange, modération, sainte cène, offrandes, prédication,
  prière de fin…). Période à deux cultes le dimanche (matin / après-midi).
- **« predications »** : ~31 prédications isolées (2025 → aujourd'hui), avec des
  métadonnées soignées (nom du prédicateur, titre du message, série).

Koinonia dispose désormais de son propre module audio et d'une **bibliothèque
d'écoute** (`/audio/ecouter`, spec 021) ouverte à tous les membres. Maintenir
deux outils est coûteux et déroutant : les membres ne savent pas où chercher un
culte, et les nouveaux cultes sont publiés dans Koinonia pendant que
l'historique reste ailleurs.

**Objectif** : rapatrier tout l'historique des cultes d'Audiobookshelf dans la
bibliothèque d'écoute de Koinonia, à l'identique de ce qu'un membre attend d'un
culte publié normalement (date, orateur quand il est connu, séquences nommées,
lecture et reprise d'écoute), puis arrêter Audiobookshelf.

C'est une **opération ponctuelle** : un import lancé une fois sur
l'environnement de recette pour vérification, puis une fois en production. Ce
n'est pas une fonctionnalité récurrente de l'application ; aucun écran nouveau,
aucune bascule d'import automatique n'est demandé.

## Utilisateurs concernés

- **Super Admin / mainteneur** : lance l'opération d'import et en vérifie le
  résultat. C'est le seul acteur de la migration elle-même.
- **Tous les rôles disposant de l'accès « (re)Écouter »** (Super Admin, Admin,
  Secrétaire, Ministre, Resp. département, Faiseur de Disciples, Reporter, et
  tout STAR) : après l'import, ils voient et écoutent les cultes migrés dans
  `/audio/ecouter` exactement comme les cultes publiés depuis Koinonia.
- **Régie audio** (rôles `audio:view` / membres du département de captation) :
  retrouvent les cultes migrés dans l'onglet Production comme des cultes
  publiés, avec la possibilité de les dépublier / corriger si besoin.

## Comportement attendu

### Scénario principal — import d'un culte

1. Le mainteneur prépare les fichiers audio d'Audiobookshelf sur
   l'environnement cible (recette d'abord).
2. Il lance l'opération d'import pour l'église ICC Rennes.
3. Pour chaque culte de la bibliothèque « cultes » :
   - un culte est créé dans Koinonia, rattaché à ICC Rennes, à la **date** lue
     dans le nom du dossier Audiobookshelf ;
   - l'**heure** du culte est celle de la prédication correspondante quand elle
     existe (voir ci-dessous), sinon une heure par défaut (10 h le matin ;
     pour une journée à deux cultes, 10 h et 12 h) ;
   - chaque piste du culte devient une **séquence** nommée, dans l'ordre
     d'origine, titre nettoyé (sans le préfixe de numéro, tirets bas remplacés
     par des espaces) ;
   - les pistes de **musique de fin** (« MLA », « MLA Balances ») ne sont pas
     importées ;
   - le culte est **publié** : ses séquences sont normalisées en volume et
     encodées comme pour un dépôt Koinonia normal, puis il apparaît dans la
     bibliothèque d'écoute.
4. À la fin, le mainteneur consulte `/audio/ecouter` et vérifie que les cultes
   attendus sont présents, écoutables, correctement datés et ordonnés.
5. Après validation en production, Audiobookshelf est arrêté.

### Scénario — substitution de la prédication par la version « riche »

- **Quand** un culte a, dans la bibliothèque « predications », une prédication à
  la **même date** (fichier daté et horodaté), la **séquence « prédication » du
  culte utilise ce fichier-là** (métadonnées soignées) à la place de la piste
  « prédication » du dossier « cultes ».
- Dans ce cas, l'**orateur** du culte et le **titre du message** sont repris des
  métadonnées de ce fichier. Le titre du culte affiché devient le titre du
  message.
- **Quand** la journée compte deux cultes et que la bibliothèque
  « predications » contient deux prédications à cette date (l'une le matin,
  l'autre à midi), la prédication du matin est rattachée au premier culte, celle
  de midi au second.

### Scénarios alternatifs / cas limites

- **Si** un culte n'a aucune prédication correspondante dans la bibliothèque
  « predications » (cas de tous les cultes 2024 et d'une partie de 2025-2026) :
  la séquence « prédication » utilise la piste du dossier « cultes » telle
  quelle ; l'**orateur reste vide** ; le titre du culte est le libellé du
  dossier (« Culte », « Culte 1 », « Culte 2 »).
- **Si** un culte n'a aucune piste identifiable comme prédication : le culte est
  importé sans séquence « prédication », avec ses autres séquences.
- **Si** un dossier de culte a une numérotation de pistes incomplète ou absente,
  ou des noms de fichiers irréguliers : les séquences sont quand même créées,
  dans l'ordre de lecture des fichiers, avec un titre lisible.
- **Cérémonie de baptêmes** : importée comme un culte de **type « autre »**, en
  une seule séquence.
- **Relance de l'opération** : si l'import est relancé (coupure, reprise après
  correction), il **ne recrée pas** les cultes déjà importés et ne produit pas
  de doublon dans la bibliothèque d'écoute.
- **Rendu long** : la mise en forme audio de ~350–450 séquences prend plusieurs
  heures cumulées ; les cultes apparaissent dans la bibliothèque au fur et à
  mesure que leurs séquences sont prêtes, pas tous en même temps.
- **Après import**, un culte migré se comporte comme n'importe quel culte publié
  Koinonia : lien de partage possible, dépublication possible par la régie,
  reprise d'écoute par séquence, filtres par orateur / type / période.
- **Isolation** : aucun culte migré n'est visible depuis une autre église que
  ICC Rennes.

## Critères d'acceptation

- [ ] Après l'import, chaque culte de la bibliothèque « cultes »
      d'Audiobookshelf (hors éléments explicitement hors périmètre) existe comme
      **un** culte publié dans `/audio/ecouter` pour ICC Rennes.
- [ ] Chaque culte migré porte la **date** de son dossier d'origine, et une
      **heure** cohérente (celle de la prédication rattachée, ou la valeur par
      défaut).
- [ ] Les séquences d'un culte migré sont dans le **même ordre** que les pistes
      d'origine, avec des titres lisibles et sans préfixe de numéro.
- [ ] Les pistes « MLA » / « MLA Balances » n'apparaissent dans **aucun** culte
      migré.
- [ ] Pour un culte ayant une prédication datée correspondante dans la
      bibliothèque « predications », la séquence « prédication » est **le fichier
      de cette bibliothèque**, et le culte affiche l'**orateur**, le **titre du
      message** et, s'il y en a une, la **série** issus de ses métadonnées.
- [ ] La **série** reprise est le nom du dossier de podcast d'origine ; le
      rangement par défaut « Prédications indépendantes » n'est pas traité comme
      une série (aucune série affichée). La série est visible en fiche Production
      et dans « (re)Écouter », et filtrable dans les deux vues.
- [ ] Pour une journée à deux cultes avec deux prédications datées, la
      prédication du matin est sur le premier culte et celle de midi sur le
      second.
- [ ] Pour un culte sans prédication correspondante, l'orateur affiché est
      **vide** et le culte est quand même publié et écoutable.
- [ ] Chaque séquence migrée est **écoutable** dans la bibliothèque (lecture,
      déplacement dans la piste, reprise d'écoute) au même titre qu'une séquence
      déposée via Koinonia.
- [ ] Le volume sonore des séquences migrées est **normalisé** au même niveau
      que les cultes déposés via Koinonia (pas d'écart de niveau perceptible en
      passant d'un culte migré à un culte récent).
- [ ] Relancer l'opération d'import **ne crée pas** de culte en double.
- [ ] Aucun culte migré n'est visible depuis une église autre qu'ICC Rennes.
- [ ] La bibliothèque d'écoute reste utilisable pendant que le rendu des cultes
      migrés est en cours (pas de blocage de l'application ni des dépôts
      Koinonia normaux).

## Hors périmètre

- **Import automatique / synchronisation continue** avec Audiobookshelf : c'est
  une migration unique, pas un pont permanent.
- **Bibliothèque « books »** d'Audiobookshelf (vide) et toute autre bibliothèque
  que « cultes » et « predications ».
- **Regroupement / navigation par série** : la série est reprise comme simple
  libellé sur le culte (stocké, affiché, filtrable). Aucune page « série », aucun
  tri hiérarchique, aucune gestion de l'ordre des messages dans une série.
- **Couvertures (visuels) par culte** : les images d'Audiobookshelf ne sont pas
  reprises ; les cultes migrés utilisent la couverture par défaut de l'église.
- **Rattachement à un événement de planning** : les cultes migrés ne sont pas
  reliés aux événements Koinonia (possible manuellement plus tard).
- **Progression d'écoute des utilisateurs** enregistrée dans Audiobookshelf :
  non reprise.
- **Reprise du texte / transcription** des prédications : non concernée.
- **Migration d'autres églises** : seul ICC Rennes est concerné à date.
- **Archivage ou suppression des fichiers Audiobookshelf** après import : décidé
  et fait hors de cette opération.

## Questions ouvertes

- Fenêtre d'exécution en production (heure creuse) pour absorber les heures de
  mise en forme audio sans gêner l'usage courant.
- Comportement souhaité si un titre de piste est ambigu au point qu'aucune
  séquence « prédication » ne peut être identifiée alors qu'on en attendait une :
  laisser sans prédication (défaut retenu) ou signaler pour traitement manuel ?

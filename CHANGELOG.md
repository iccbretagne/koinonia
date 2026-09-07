# Changelog

Toutes les modifications notables de ce projet sont documentées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Ce projet suit [Semantic Versioning](https://semver.org/lang/fr/).

## [v1.21.1] - 2026-09-06

### Corrigé

- **Formulaire public d'intégration famille inutilisable en production**
  (`/rejoindre/[churchSlug]`) : `NEXT_PUBLIC_TURNSTILE_SITE_KEY` est inlinée dans le bundle
  client au moment du build (`npm run build`), pas lue au runtime — le pipeline CI qui produit
  l'artefact déployé (`.github/workflows/ci.yml`) ne la passait pas à cette étape, le widget
  Turnstile ne s'affichait donc jamais, mais la soumission continuait d'exiger un jeton
  (fail-closed volontaire, spec 030) : impossible de valider le formulaire, sans CAPTCHA visible
  pour le résoudre. Turnstile est retiré de ce formulaire (la protection anti-spam repose
  désormais uniquement sur le rate-limit IP existant de `POST /api/integration/requests`) ; le
  formulaire de demande de RDV pastoral (`/agenda-public`) conserve Turnstile et récupère malgré
  tout la clé désormais correctement propagée au build (`ci.yml` et `deploy-staging.yml`).

## [v1.21.0] - 2026-09-06

### Ajouté

- **Adresse postale dans l'export des demandes d'intégration** : la colonne « Adresse »
  s'intercale entre « Email » et « Ville » et reprend l'adresse saisie sur le formulaire, cellule
  vide si non renseignée. La spec 033 excluait volontairement l'adresse précise au profit de la
  seule ville ; la décision est révisée, la répartition géographique par famille d'impact se
  faisant à l'adresse. Les notes internes et le motif d'abandon restent exclus de l'export.

### Modifié

- Mise à jour des dépendances (minor/patch) : `next` et `eslint-config-next` 16.3.3 → 16.3.4,
  `@aws-sdk/client-s3` et `@aws-sdk/s3-request-presigner` 3.1118.0 → 3.1124.0, `sharp` 0.35.3 →
  0.35.4, `mariadb` 3.5.3 → 3.5.4, `html2canvas-pro` 2.4.0 → 2.4.1, `tsx` 4.23.12 → 4.23.13.

### Documentation

- Achèvement de l'accentuation française de `docs/api.md` et correction d'une fence de code
  orpheline.

## [v1.20.0] - 2026-09-03

### Ajouté

- **Partage de bibliothèque audio entre églises** : une église peut ouvrir sa bibliothèque de
  cultes publiés à d'autres églises de la plateforme, depuis les paramètres de l'espace Audio.
  Le partage est unilatéral et dirigé — l'église propriétaire décide seule, en saisissant
  l'identifiant de l'église destinataire, sans qu'aucun annuaire des églises ne soit exposé aux
  administrateurs d'église. Chez l'église destinataire, les cultes reçus apparaissent dans la
  bibliothèque avec une marque d'origine et un filtre par église, qui n'apparaît que s'il y a
  effectivement un partage. L'accès est strictement en écoute : ni dépôt, ni publication, ni
  dépublication, ni génération de lien public sur le contenu d'autrui. Voir
  `specs/036-partage-bibliotheque-audio/`.

### Documentation

- **Dossier d'Architecture Technique (`docs/dat.md`)** : nouveau document de synthèse donnant la
  vue d'ensemble de l'architecture (fonctionnelle, applicative, données, sécurité,
  infrastructure, exploitation). Il référence les documents détaillés au lieu de les dupliquer —
  chacun reste la source de vérité sur son domaine.
- **ADR-0010** : accès transverse inter-églises borné au module demandeur — un partage entre
  églises s'implémente par un helper dédié au module concerné, jamais en élargissant
  `requireChurchPermission`.
- Mise en cohérence de la documentation technique avec le code : tableaux de permissions par
  rôle complétés (rôles et permissions manquants), champs audio non documentés ajoutés dans
  `database.md`, arborescence `/audio` et `/api/audio` ajoutée dans `architecture.md`,
  endpoints de partage documentés dans `api.md`.
- **Description du projet réécrite** (`README.md`, `docs/dat.md`, `CLAUDE.md`) : la précédente
  réduisait Koinonia à la gestion des plannings de service alors que l'application couvre onze
  modules métier. La nouvelle énonce le périmètre réel et le constat d'origine — sortir la vie
  de service des groupes WhatsApp et des tableaux Excel pour la ramener à une source de vérité
  unique.
- **Accentuation française normalisée** dans toute la documentation (`README.md`, `CLAUDE.md`,
  `CHANGELOG.md`, `docs/*.md`) : le corpus mélangeait des passages anciens sans accents et des
  ajouts récents accentués. Les blocs de code, le contenu entre backticks, les arborescences
  ASCII, les URLs et les valeurs d'enum sont restés inchangés ; `specs/` est exclu, les specs
  livrées étant des artefacts historiques.

### Sécurité

- Monté `fast-uri` en 3.1.7 via override (GHSA-5jgf-p345-68v8, GHSA-f65p-4m7j-42xc,
  GHSA-fph4-wmhf-6fwf, GHSA-jqff-g426-hqxp) — dépendance transitive de prisma 7.10 (ajv), la
  porte `npm audit --omit=dev --audit-level=high` de la CI.

## [v1.19.0] - 2026-09-01

### Ajouté

- **Module audio — publication des cultes par l'équipe de captation** : la diffusion audio des cultes, à l'arrêt depuis juin 2026 faute de temps de montage, redevient possible sans éditeur audio ni accès au serveur. L'équipe dépose l'enregistrement (séquences déjà découpées ou culte complet), nomme et ordonne les séquences (louange, prière des STAR, sainte cène, dîmes et offrandes, prédication, annonces…), puis publie. Le rendu sonore est normalisé automatiquement — fin de la saturation et des écarts de volume d'une séquence à l'autre — et la publication produit une page d'écoute partageable par lien.
- **Espace Audio accessible depuis la navigation** : le module était atteignable uniquement en tapant son adresse. Une entrée « Audio » apparaît désormais dans le menu, ouvrant un espace à trois onglets aux droits distincts : « (re)Écouter », « Production » (file d'attente, dépôt, nommage, publication) et « Paramètres » (couverture par défaut, modèle de séquences). La fiche d'un événement signale l'enregistrement qui lui est rattaché, on revient à la file depuis un culte ouvert, et la hiérarchie des actions (déposer, publier, dépublier, supprimer) a été reprise d'ensemble. La page `/admin/audio/settings`, jamais mise en production, est supprimée ; le département de captation se configure comme une fonction de département.
- **Bibliothèque d'écoute des cultes, ouverte à tous les membres** : l'onglet « (re)Écouter » liste tous les cultes publiés de l'église et les rend consultables sans lien de partage — auparavant, seul un STAR programmé sur l'événement y avait accès. Un membre absent au culte, ou qui cherche une prédication d'il y a trois mois, la retrouve désormais depuis l'application. La permission `audio:listen` est accordée à tous les rôles, STAR compris.
- **Reprise de l'historique audio d'Audiobookshelf** : les quelque 110 cultes et prédications publiés depuis mi-2024 sur l'application tierce Audiobookshelf ont été rapatriés dans la bibliothèque d'écoute (date, orateur quand il est connu, séquences nommées, reprise de lecture), ce qui permet d'arrêter le second outil. Opération ponctuelle par script, sans écran ni import automatique.
- **Filtres et tris multicritères de la file Production audio** : la file n'offrait qu'un filtre de statut et aucun tri au choix, ce qui devenait ingérable avec l'arrivée de l'historique migré. Elle accepte désormais plusieurs critères combinables et un tri sur la colonne pertinente.
- **Vue semaine multi-salles et suivi de ses réservations (`/rooms`)** : nouvelle vue « Semaine » (par défaut) en grille salles × jours — une ligne par salle, une colonne par jour — pour voir toutes les salles d'un coup et repérer immédiatement celles qui sont libres ; le calendrier mensuel devient lui aussi multi-salles et le choix d'une salle passe de sélection obligatoire à filtre facultatif. Un encart « Mes réservations » repliable, toujours visible quelle que soit la vue, liste les prochaines réservations de l'utilisateur avec les actions de main courante (déclarer l'ouverture/la fermeture) au plus près. Les réservations de l'utilisateur sont mises en évidence dans les grilles.
- **Emails multiples pour les notifications comptabilité et secrétariat** : une église peut désormais déclarer plusieurs adresses email de notification pour la comptabilité (nouvelle demande financière) et pour le secrétariat (digest planning hebdomadaire), au lieu d'une seule adresse par canal.
- **Export Excel des demandes d'intégration** : la liste des demandes d'intégration peut être exportée au format `.xlsx`. Le fichier contient exactement les demandes affichées à l'écran — les filtres actifs sont respectés, sans exception cachée. Les notes internes, le motif d'abandon et l'adresse postale en sont volontairement exclus. L'export est réservé aux rôles qui voient l'ensemble des demandes de leur église et il est tracé dans le journal d'audit.
- **Cycle de vie des offres d'emploi** : une offre publiée ne reste plus indéfiniment en ligne. Passé 60 jours sans modification, son auteur est relancé — par email et par notification dans l'application — pour confirmer qu'elle est toujours d'actualité, un bandeau et un bouton « Toujours d'actualité » apparaissant sur la page de l'offre. Sans réponse sous 14 jours, l'offre est archivée automatiquement. Toute modification de l'offre vaut confirmation et remet le compteur à zéro. Les offres dont la date limite de candidature est dépassée sont soldées de la même façon.
- **Message récapitulatif des offres au format WhatsApp** : un bouton « Copier pour WhatsApp » dans la liste des offres compose un message texte prêt à coller dans une conversation, résumant les offres affichées (le filtre de type actif est respecté) avec pour chacune son type, son intitulé, son entreprise, son lieu, sa date limite et le lien vers son détail. Les coordonnées de contact déposées par l'auteur n'y figurent pas : le message est destiné à être transféré, elles restent accessibles dans l'application. Si la copie automatique échoue, le texte est affiché à l'écran pour être copié manuellement.

### Modifié

- **Redirection après connexion selon le rôle** : tout le monde atterrissait sur `/dashboard`, page interdite à une partie des profils. Chacun arrive désormais sur la page correspondant à son rôle.

### Corrigé

- **Corrections audio invisibles pour ceux qui avaient déjà écouté** : les pistes étant mises en cache très longtemps sur l'appareil de l'auditeur, un culte remonté après publication (coupure d'un passage, réparation d'un problème de son) continuait d'être entendu dans son ancienne version, sans moyen de s'en apercevoir. Les pistes sont désormais adressées par leur contenu : une correction publiée est servie immédiatement.
- **Reprise fiable de la migration Audiobookshelf après un échec partiel** : un culte dont l'import échouait après création de données mais avant enregistrement de son traitement était réimporté en double à la relance, et la commande d'annulation ne pouvait pas le nettoyer. Un journal transactionnel garantit désormais la reprise.
- **Connexion impossible tant que les données du navigateur n'étaient pas purgées** : lorsqu'une session avait disparu côté serveur (expiration, réinitialisation) ou qu'une tentative de connexion Google avait échoué en cours de route, les cookies laissés derrière bloquaient toute nouvelle connexion — et rien ne les supprimait. L'utilisateur devait vider les données du site dans son navigateur, opération hors de portée de la plupart. Ces cookies sont désormais nettoyés automatiquement au retour sur la page de connexion, et un lien « Problème de connexion ? » permet de forcer cette remise à zéro en un clic.
- **Réservations de soirée affichées la veille dans le calendrier des salles** : le regroupement des réservations par jour se faisait sur la date universelle (UTC) et non la date locale ; une activité commençant tard le soir apparaissait le jour précédent.
- **Version affichée en recette figée sur la dernière version publiée** : le pied de page de l'environnement de recette affichait la version de `package.json`, qui n'est incrémentée qu'à la publication — la version annoncée n'était donc pas celle de la branche en cours de validation. Elle indique désormais le code réellement déployé (`1.19.0-abc1234`). La production est inchangée.
- **Tour guidé et guide utilisateur décalés par rapport à l'application** : le tour ne présentait ni la section « Ressources » (Salles, Comptabilité, Emploi) ni « Gestion pastorale », et son étape sur le discipolat ne s'affichait plus depuis que celui-ci a rejoint la section « Communauté ». Les intitulés « Membres (STAR) » et « Demandes » ont par ailleurs été réalignés sur les sections « Communauté » et « Opérations ». Le rôle Qualificateur d'agenda ne recevait aucune étape le concernant.
- **Guide utilisateur incomplet** : les Absences et les Tâches de département n'y figuraient pas du tout ; les paramètres audio et la dépublication d'un culte, le cycle de vie des offres d'emploi et leur récapitulatif WhatsApp, l'export Excel des demandes d'intégration et les sauvegardes de configuration ont été ajoutés. La fiche Salles décrit désormais la vue semaine multi-salles. Une capture d'écran non encore publiée affiche un cadre « Capture à venir » au lieu d'une image cassée.

### Sécurité

- **Périmètres d'accès réellement appliqués (spec 031)** : Koinonia distinguait depuis l'origine la permission (« a-t-il le droit ? ») du périmètre (« sur quel ministère, quels départements ? ») sans presque jamais appliquer la seconde. Un responsable de département pouvait créer et supprimer les tâches et consignes d'un département dont il n'a pas la charge ; un STAR pouvait obtenir par les routes de données la composition, les statistiques et le planning mensuel de n'importe quel département de son église, que l'interface lui masque pourtant. Le périmètre département/ministère est désormais appliqué aux routes et aux pages concernées, statistiques de planning comprises. Un STAR « pur » perd l'accès à la grille par département et au module Salles, et conserve « Mon planning », ses événements et l'auto-déclaration d'absences. La gestion des accès par un Ministre passe sur `access:manage`, bornée à ses ministères et aux rôles rattachables.
- **Isolation inter-églises des contrôles de permission (spec 024)** : les droits étaient évalués en agrégeant les rôles détenus dans *toutes* les églises de la personne, puis l'action s'appliquait à l'église courante choisie côté navigateur. Un Admin de l'église A, simple STAR dans l'église B, pouvait ainsi agir dans B avec les droits qu'il détient dans A. Toute vérification de permission cible désormais une église explicite, celle de la ressource visée faisant autorité. Les tableaux de bord Média, Secrétariat et Communication calculaient encore leurs permissions hors église courante : corrigé.
- **Autorisation à l'échelle de l'objet pour les médias et les pièces comptables (spec 025)** : un lien public de validation délégué à un *projet* média n'était soumis à aucun contrôle de périmètre — son porteur pouvait désigner n'importe quelle photo de la plateforme, toutes églises confondues, pour en obtenir l'original haute définition et en changer le statut. Le rattachement de l'objet visé est désormais vérifié sur ces chemins.
- **Retrait de l'intégration SSO MRBS (spec 027)** : la connexion unique avec l'application externe de réservation reposait sur un cookie de session partagé à l'échelle du domaine parent, donc lisible par tout service hébergé sur un sous-domaine. La réservation de salles étant assurée nativement par Koinonia, l'intégration et le cookie partageable sont supprimés plutôt que sécurisés.
- **Preuve d'humanité sur le formulaire public « Rejoindre une famille » (spec 030)** : chaque soumission déclenchait sans contrôle une géolocalisation externe, la création d'une demande d'intégration et d'un dossier de parcours, et surtout l'envoi d'un email de confirmation à une adresse choisie par celui qui remplit le formulaire — de quoi faire émettre des emails depuis le domaine de l'église et en abîmer la réputation d'expéditeur.
- **Bornes de dépôt et statut publié réellement vérifiés côté serveur (spec 029)** : la limite de taille des fichiers média n'était appliquée qu'à la taille *annoncée* par le navigateur, et publier deux fois le même culte simultanément déclenchait deux fois le même travail de rendu.
- Clé de limitation de débit, référence de déploiement et bornes d'upload audio corrigées ; graphe de dépendances de production ramené à zéro vulnérabilité, avec une porte dédiée en CI.
- Montée de `mysql2` (tiré par `prisma`) en 3.24 via un override : l'avis GHSA-3f6p-5ww8-9rcr (déclassement du plugin d'authentification vers `mysql_clear_password`, fuite des identifiants en clair) touchait la version 3.15 embarquée.

### Technique

- Retrait d'une table leurre `__prisma_migrations` (deux underscores) créée puis supprimée par deux migrations : sans lien avec la table interne de Prisma (`_prisma_migrations`, un seul underscore), elle n'avait aucun effet mais sa ressemblance suffisait à faire diagnostiquer à tort une corruption de l'historique des migrations. Règle correspondante ajoutée à `docs/database.md`.
- Verrouillage par test du nom du cookie de session attendu par le middleware : ce nom était supposé plutôt que lu depuis Auth.js, et un renommage lors d'une future montée de version aurait rendu tout le monde non authentifié, en silence.
- Extraction de la protection contre l'injection de formules dans les exports Excel, jusque-là dupliquée à l'identique dans trois routes et couverte par aucun test.
- Jeu de données de formation : le seed de développement accepte désormais une fixture externe (`SEED_FIXTURE_FILE`), ce qui permet de monter un environnement sur la structure et les comptes réels d'une église, avec un contenu métier entièrement fabriqué. Un script convertit l'export de configuration en fixture. Procédure documentée dans `docs/staging.md`.
- Diffusion audio : présence du fichier en cache garantie avant délégation du service à nginx, pour éviter une réponse vide sur une piste jamais encore demandée.
- Avertissements de lint soldés, seuil de couverture relevé et image de développement mise à jour.
- Déploiement : l'épinglage d'empreinte SSH est retiré — `scp-action` et `ssh-action` négocient deux clés d'hôte différentes, aucune empreinte unique ne convient ; risque documenté et accepté.
- Réinitialisation du seed rendue indépendante de l'ordre et du nombre de modèles : la liste des tables à vider était tenue à la main et avait dérivé (19 modèles sur 69 y manquaient), sans conséquence sur une base de développement mais bloquant sur toute base ayant réellement servi.

## [v1.18.0] - 2026-08-23

### Ajouté

- **Relance d'inactivité pour les suivis MSDP bloqués** : un suivi MSDP (appel au salut) non terminal resté sans mise à jour depuis 7 jours déclenche désormais une alerte automatique au conseiller assigné, ou à l'équipe MSDP si aucun conseiller n'est assigné — même mécanisme que celui déjà en place pour les demandes d'intégration familiale.
- **Guide utilisateur complété** : les modules Salles, Agenda pastoral, Comptabilité, Emplois et Intégration, absents du guide in-app malgré leur présence dans l'application, sont désormais documentés avec captures d'écran.

### Modifié

- **Rôle Reporter intégré au tableau des rôles transverses** : la page Accès & rôles gérait le rôle Reporter dans un onglet dédié, séparé des autres rôles transverses (Secrétaire, Faiseur de Disciples...) ; il est désormais géré au même endroit qu'eux, pour plus de cohérence.

### Technique

- Suppression de la route cron dupliquée `/api/cron/integration-inactivity`, orpheline depuis l'ajout de l'orchestrateur `/api/cron` principal.
- Introduction de la pratique des ADR (Architecture Decision Records) dans `docs/adr/`.

## [v1.17.1] - 2026-08-16

### Corrigé

- **Formulaire public « rejoindre l'église » inaccessible aux visiteurs non connectés** : le middleware bloquait les appels API du formulaire `/rejoindre/[churchSlug]` (création de demande, suggestion de famille) faute d'authentification, alors que ces routes sont conçues pour être publiques. Ajout d'un rate-limit par IP sur ces deux routes désormais accessibles sans session.

## [v1.17.0] - 2026-07-30

### Ajouté

- **Backup pour un tiers et gestion des absences par le Secrétariat** : quand un Super Admin, Admin, Secrétaire, Ministre ou Resp. département déclare ou modifie l'absence d'un STAR qui est lui-même Resp. département ou Ministre, l'option de désigner un backup est désormais proposée — avec le périmètre de la personne absente, jamais celui du déclarant. Le rôle Secrétaire peut désormais déclarer, modifier et annuler une absence pour n'importe quel STAR de l'église (comme Admin/Super Admin), plus seulement consulter la vue transverse.

### Corrigé

- **Export du planning STAR tronqué (copier image / télécharger PNG / export PDF)** : régression introduite par une mise à jour automatique de la librairie `html2canvas-pro` (2.3.1), corrigée en amont par l'éditeur — mise à jour vers 2.3.2.

## [v1.16.0] - 2026-07-30

### Ajouté

- **Évolutions du module Absences** : lors de la déclaration de sa propre absence, un Resp. département ou un Ministre peut désigner un ou plusieurs backups (STAR de son périmètre, Ministre de son ministère, ou pair Resp. département du même ministère) — notifiés de leur désignation et visibles dans la vue transverse. Une absence non passée peut désormais être modifiée (période, motif, backups) plutôt qu'annulée puis recréée, avec réévaluation des conflits. Nouvelle vue « frise temporelle » en alternative au tableau. Export Excel de la vue d'ensemble, respectant les filtres actifs. À la déclaration, la date de fin se pré-remplit sur la date de début.
- **Import des réservations futures MRBS vers Koinonia** : script d'import ponctuel (`prisma/scripts/import-mrbs-reservations.ts`) réutilisant le service métier de réservation (conflits, main courante), idempotent, avec option de rattachement des réservations sans créateur lié à un compte de repli.

## [v1.15.0] - 2026-07-29

### Ajouté

- **Gestion des absences des STAR** : un STAR peut déclarer ses absences prévues (ou son resp. de département/ministre pour son périmètre), avec détection de conflit à la volée avec le planning existant (badge visuel, notifications), vue transverse filtrable par ministère/département/rôle, et annulation. Nouvelles permissions `absences:view`/`absences:manage`.
- **Gestion des salles et de leur réservation** : réservation de salles multi-église (salles possédées + partagées via liste blanche), récurrence propre ou alignée sur un événement, refus immédiat en cas de conflit, main courante par réservation (déclaration d'ouverture/fermeture, contrôle par une équipe dédiée Sécurité/Entretien). Vue calendrier par salle, filtres/tri sur toutes les vues (liste, admin salles, contrôle des mains courantes), détail complet d'une main courante consultable à tout moment, saisie multi-lignes pour les notes/écarts.
- **Harmonisation et ergonomie du module Absences** : recherche par nom, filtre statut (historique des absences annulées accessible), filtre de période et tri sur la vue d'ensemble ; signal de conflit uniforme et cliquable depuis le planning, menant directement au détail de l'absence concernée ; ergonomie mobile des filtres.

### Corrigé

- **Confirmation avant les actions destructives non protégées** : plusieurs actions irréversibles (annulation d'une absence, suppression d'une pièce jointe comptable, refus/annulation d'une demande, rejet d'une demande d'agenda, suppression d'une note de planning) s'exécutaient au premier clic sans confirmation. Une confirmation est désormais requise, cohérente avec le reste de l'application.
- **Consolidation préventive des liens de partage média** (suite à v1.14.1/v1.14.2) : les pages publiques « Collection » et « Validateur »/« Pré-validateur » dupliquaient elles aussi leur logique de récupération de données depuis leur route API, avec le même risque de divergence silencieuse. La logique est désormais centralisée (`resolveCollectionData`, `resolveValidatorData`) et partagée entre routes API et pages SSR.
  - Bug latent corrigé au passage : la page « Collection » ignorait le paramètre `includeAllPhotos` d'un token (elle filtrait toujours sur les photos approuvées, contrairement à sa route API) — un lien collection configuré pour tout afficher masquait les photos non validées.
  - La page « Validateur »/« Pré-validateur » appelait deux fois la validation du token à chaque chargement, comptabilisant deux usages au lieu d'un dans les statistiques du lien.

## [v1.14.2] - 2026-07-18

### Corrigé

- **Pages publiques de téléchargement/galerie toujours vides sur les projets** : le correctif v1.14.1 avait bien réparé les routes API `/api/media/download` et `/api/media/gallery`, mais les pages publiques SSR (`/media/d/[token]`, `/media/g/[token]`) dupliquaient la même logique de récupération dans leur propre `page.tsx` — sans jamais avoir été alignées sur le fix. Un lien de partage sur un projet continuait donc d'afficher 0 média à l'ouverture. La logique de résolution (événement → photos, projet → fichiers) est désormais centralisée dans `resolveDownloadData`/`resolveGalleryData` (module `media`) et partagée par les routes API et les pages SSR, pour éviter toute nouvelle divergence.

## [v1.14.1] - 2026-07-18

### Corrigé

- **Liens de partage des projets médias** : les liens « Téléchargement (validées) », « Téléchargement (toutes) » et « Galerie » créés sur un projet média n'affichaient aucun contenu. Ces flux ne lisaient que les photos d'un événement et ignoraient les fichiers d'un projet ; ils exploitent désormais les fichiers du projet (validés `APPROVED`/`FINAL_APPROVED` pour les liens « validées »/galerie approuvée, tous les non-brouillons pour « toutes »). Les liens déjà partagés fonctionnent sans avoir à les recréer.

## [v1.14.0] - 2026-07-05

### Ajouté

- **Espace STAR — agenda hebdomadaire des événements** (#418) : les STAR disposent d'une nouvelle entrée « Événements » présentant tous les événements de l'église de la semaine en cours (intitulé, date, horaire, type), avec navigation entre les semaines. Vue en lecture seule. Conçu en spec-driven (`specs/006-star-navigation-evenements/`).

### Modifié

- **Recentrage de la navigation STAR** (#418) : « Mes demandes » est désormais réservé aux profils de gestion (Admin, Super Admin, Secrétaire, Ministre, Responsable de département) et « Réservation de salles » est masqué pour le STAR « pur » (conservé pour les autres rôles). Un utilisateur cumulant STAR + rôle de gestion conserve l'ensemble.

### Corrigé

- **Navigation mobile** (#418) : le lien « Événements » de la barre inférieure pointait vers une page interdite pour les STAR ; sa destination est désormais conditionnelle.
- **Accès pastoral à « Mes demandes »** (#419) : suite au recentrage, les profils pastoraux avaient perdu l'accès au périmètre « Mes demandes » ; il est rétabli via `members:view` (lecture des membres accordée, écriture toujours refusée).

## [v1.13.3] - 2026-07-05

### Corrigé

- **Gestion des STAR multi-départements par les responsables et ministres** (#416) : les responsables de département et ministres recevaient des erreurs 403 lors de l'affectation/désaffectation de STAR appartenant aussi à d'autres départements. Le contrôle de périmètre s'appuyait sur le seul département principal du STAR, incohérent avec la liste (filtrée sur « au moins un département partagé »).
  - Un responsable/ministre peut désormais gérer un STAR dès qu'il partage au moins un département avec lui ; il n'agit que sur ses propres départements, les autres affiliations (dont un principal hors périmètre) restent intactes.
  - La suppression d'un STAR est réservée aux STAR entièrement dans le périmètre (supprimer efface toutes les affiliations).
  - Le sélecteur « département principal » reste cohérent même quand le vrai principal est hors périmètre.

## [v1.13.2] - 2026-07-04

### Corrigé

- **Vue planning personnelle — filtrage des lignes** (#414) : seuls les services EN_SERVICE et EN_SERVICE_DEBRIEF s'affichent ; les lignes INDISPONIBLE et non-assignées sont masquées.
- **Vue planning personnelle — département en gras** (#414) : le nom du département est affiché en `font-semibold` pour le distinguer de la date.
- **Vue planning personnelle — tâches affichées sur le mauvais département** (#414) : les tâches (ex. Zone A/B) apparaissaient sur des départements qui n'en avaient pas, car elles étaient indexées par `eventId` seul. Corrigé avec une clé composite `eventId_departmentId`.

## [v1.13.1] - 2026-07-04

### Corrigé

- **Import config — conflit de slug cross-instance** (#411) : lors d'un import cross-instance (ex. prod → recette), `church.create()` échouait avec `Unique constraint on churches_slug_key` si la church existait avec le même slug mais un ID différent. L'import recherche maintenant par slug en fallback et utilise l'ID effectif de la cible pour toute la transaction.
- **Import config — FK violation sur `memberUserLink`** (#412) : `link.churchId` (ID de l'instance source) était utilisé dans `memberUserLink.create/findFirst`, provoquant `Foreign key constraint violated on churchId`. Remplacé par `church.id` (ID effectif résolu en début de transaction).

## [v1.13.0] - 2026-07-04

### Ajouté

- **Sauvegarde partielle — export et restauration de la configuration** (#409)
  - Nouveau panneau sur `/admin/backups` : export JSON à la demande de la configuration structurelle (églises, ministères, départements, membres, liaisons utilisateurs)
  - Import avec résumé avant confirmation (counts, existence en cible) et 3 stratégies de fusion : SKIP (ignorer les doublons) / UPDATE (mettre à jour) / REPLACE (tout remplacer + suppression des orphelins)
  - Import transactionnel : une erreur annule toutes les modifications de la session
  - Rapport post-import détaillé (créés / mis à jour / ignorés / warnings FK)
  - Réservé aux Super Admin, journalisé en audit
  - Conçu en spec-driven (`specs/005-sauvegarde-partielle/`)

## [v1.12.0] - 2026-07-04

### Ajouté

- **Module emploi — missions freelance** (#407)
  - Troisième onglet "Freelance" sur `/jobs` avec deux sous-flux : missions à confier (donneur d'ordre → prestataire) et profils freelance disponibles (prestataire → donneur d'ordre)
  - Champs spécifiques : TJM (taux journalier) + taux horaire (deux champs distincts, texte libre), modalité (remote/hybride/présentiel), domaine/stack, durée, localisation
  - Statuts : `ACTIVE` / `FILLED` (mission pourvue) / `UNAVAILABLE` (freelance indisponible) / `ARCHIVED` (modération)
  - Notifications in-app fire-and-forget avec deux nouveaux flags d'abonnement (`wantFreelanceMissions`, `wantFreelanceProfiles`)
  - Modération admin/secrétaire via onglet dédié dans `/admin/jobs`
  - Conçu en spec-driven (`specs/004-emploi-missions-freelance/`)

- **Module emploi — profils de recherche d'emploi** (#406)
  - Deuxième onglet "En recherche" sur `/jobs` : les membres peuvent publier leur recherche d'emploi (CDI/CDD/Stage/Alternance)
  - Champs : titre, types de contrat (3 booleans), secteur, localisation, télétravail, disponibilité, description, contacts
  - Statuts : `ACTIVE` / `FOUND` (emploi trouvé) / `ARCHIVED` (modération)
  - Notification in-app aux abonnés (`wantSeekers`)
  - Conçu en spec-driven (`specs/003-emploi-profils-recherche/`)

## [v1.11.0] - 2026-07-04

### Ajouté

- **Onboarding — liaison compte/STAR par email (anti-doublon)** (#403)
  - Réconciliation par email à la connexion : les fiches non liées correspondant à l'email vérifié du compte sont proposées → liaison directe (rôle STAR) sur confirmation, sans validation admin (garde-fou serveur : égalité email, fiche non liée, cohérence église)
  - Parcours par nom fiabilisé : matching flou (tolérance aux fautes, tokens), candidats classés par pertinence avec badges « Forte » / « Correspondance possible »
  - Confirmation anti-doublon obligatoire avant de créer une nouvelle fiche, et garde-fou serveur si email/nom déjà présent dans l'église (à la création admin et à l'approbation)
  - Capture de l'email à la création d'une fiche membre
  - Conçu en spec-driven (specs/002-onboarding-liaison-email/), livré en 3 phases (#400, #401, #402)

## [v1.10.0] - 2026-07-03

### Ajouté

- **Collections média — option « toutes les photos »** (#398)
  - À la création d'une collection, choix binaire : « photos validées uniquement » (défaut, comportement inchangé) ou « toutes les photos » (intégralité, tous statuts)
  - Photos uniquement (les visuels/fichiers restent limités aux éléments approuvés) ; aucune mention de statut côté destinataire ; choix journalisé
  - Rétrocompatible : les collections existantes restent en « validées uniquement »
- **Environnement de recette (staging)** (#397)
  - Workflow GitHub Actions `Deploy Staging` à déclenchement manuel (`workflow_dispatch`) vers une VM dédiée
  - Guide `docs/staging.md` (provisionnement, Environment GitHub `staging`, garde-fous)
- **Workflow spec-driven development** (#396)
  - Slash commands `/specify`, `/plan`, `/tasks`, `/implement` + `specs/constitution.md` et templates

## [v1.9.2] - 2026-07-01

### Corrigé

- **Upload médias** : crash silencieux restant sur Node.js 22 (#394)
  - `sharp.toBuffer()` peut aussi retourner un Buffer backed par `SharedArrayBuffer`
  - Les sorties de `processImage()` (original JPEG + miniature WebP) sont maintenant wrappées avec `Buffer.from(new Uint8Array(...))` avant passage au AWS SDK

## [v1.9.1] - 2026-07-01

### Corrigé

- **Upload médias / pièces jointes** : crash SIGSEGV de libvips sur Node.js 22 (#392)
  - `File.arrayBuffer()` et les chunks du streaming S3 SDK peuvent retourner des `SharedArrayBuffer`
  - `Buffer.from(new Uint8Array(...))` force une copie vers `ArrayBuffer` ordinaire avant sharp
  - Fichiers corrigés : upload photos média, pièces jointes comptabilité, `downloadFile` S3

## [v1.9.0] - 2026-06-28

### Ajouté

- **Vues pastorale** : espace pastoral enrichi avec vues événements, comptes rendus et comptabilité (#386)
  - Toggle sidebar pastoral ↔ classique persistent via cookie (30 jours)
  - Bouton de switch dans le header, labels courts sur mobile (Classique / Pastorale)
  - Suppression de la section Administration redondante dans la sidebar pastorale
- **Comptabilité — statistiques financières** : KPIs dédiés (#384)
  - Montant total engagé, délai moyen de traitement, répartition par statut/type
  - Carte « Rejetées » dans le dashboard comptabilité

### Corrigé

- **Comptabilité** : soumission étendue aux profils MINISTER, ADMIN et pastoral (#385)
  - Fix type Prisma `departmentId ?? undefined` (Prisma v7)
  - Scope des demandes visibles corrigé pour les pasteurs
- **Comptabilité** : notification in-app à la création automatique d'une occurrence récurrente (#389)
- **Mobile** : scroll horizontal tableaux, menu messages et formulaire responsive (#387)
- **Mobile** : EventsClient — barre de filtres et boutons d'action cartes responsive (#388)

### Modifié

- **Refactoring MSDP** : logique métier extraite dans `msdp-service.ts` (#390)
  - `hasMsdpManagementAccess`, `computeMsdpTransitionData`, `notifyMsdpCounselorAssigned`
  - Notification in-app au conseiller MSDP à l'assignation (#357)

### Dépendances

- Mise à jour des dépendances npm (mineures et correctifs) (#378)
- `actions/checkout` 6.0.2 → 6.0.3 (#343)

## [v1.8.0] - 2026-06-14

### Ajouté

- **Module pastoral multi-église** : un pasteur peut désormais être rattaché à plusieurs églises et superviser des églises tierces (#379, #381)
  - `PastoralProfile` par église, supervision via `Church.supervisorProfileId`
  - `pastoralChurchIds[]` en session — inclut les églises directes et supervisées
  - ChurchSwitcher disponible pour les utilisateurs pastoral-only
  - Page `/pastoral/members` avec barre de recherche, alignée sur le ChurchSwitcher
  - Composant `SwitchChurchLink` pour changer d'église depuis les liens du dashboard pastoral

### Modifié

- **Navigation — clarté des sections** (#382)
  - Labels intégration renommés : Demandes→Intégration, Bergers→Bergers de famille, Parcours→Parcours d'intégration, Statistiques→Statistiques intégration
  - Nouvelle section « Gestion pastorale » (entre Événements et Opérations) regroupant les liens agenda pastoral
  - Section Ressources : suppression du lien « Publier une offre », renommage « Modérer » → « Modération offres »
  - Correction : "Vue agenda" ne reste plus actif en naviguant sur les sous-pages de l'agenda

- **Réorganisation menu** (#380)
  - 6 sections principales : Planning, Communauté, Événements, Opérations, Ressources, Configuration
  - Lien « Familles » intégré dans la section Communauté
  - Navigation mobile refactorisée (bottom nav + sheet drilldown)

## [v1.7.1] - 2026-06-12

### Corrigé

- **Navigation mobile** : liens "Service d'accueil" et "Emploi" absents ou mal surlignés (#376)
  - Ajout du lien "Service d'accueil" dans le sous-menu Événements mobile
  - Correction de la surbrillance sur `/admin/welcome-duty` (Événements actif, Configuration inactif)
  - Correction de la surbrillance sur `/admin/jobs` (Emploi actif, Configuration inactif)

## [v1.7.0] - 2026-06-12

### Ajouté

- **Module Emploi** : offres d'emploi, stages et alternances accessibles à tous les utilisateurs authentifiés (#374)
  - Publication directe d'offres avec titre, type, entreprise, lieu, description, durée, date limite, contact
  - Expiration automatique après la date limite (offre filtrée de la liste publique)
  - Modération (archivage / suppression) par les administrateurs et secrétaires via `/admin/jobs`
  - Abonnements aux notifications par type (Emploi / Stage / Alternance) et canal (in-app + email)
  - Préférences d'abonnement gérables depuis le profil utilisateur
  - Section "Emploi" dédiée dans la sidebar (Offres, Publier, Modérer)

## [v1.6.4] - 2026-06-11

### Ajouté

- **Comptabilité** : email de réception des nouvelles demandes à l'adresse comptabilité configurée par église (#371)
  - Récapitulatif complet : type, intitulé, montant, département, demandeur, description
  - Lien direct vers la demande pour traitement immédiat
  - Champ "Email comptabilité" configurable dans Administration > Églises

## [v1.6.3] - 2026-06-11

### Ajouté

- **Comptabilité** : emails de notification aux demandeurs à chaque étape du workflow — prise en charge, validation, rejet, annulation, remise (totale ou partielle avec mention du solde reporté) (#369)

## [v1.6.2] - 2026-06-11

### Corrigé

- **CI** : permissions `accounting:*` manquantes dans `permissions.ts` pour SUPER_ADMIN, ADMIN et DEPARTMENT_HEAD — causait un échec du test de parité (#367)
- **CI** : shim TypeScript `src/types/sharp.d.ts` pour corriger `TS7016` avec sharp 0.35.0 qui ne bundle plus ses types (#367)
- **Comptabilité** : MINISTER manquant dans la liste `accounting:view` du module (#367)

## [v1.6.1] - 2026-06-11

### Corrigé

- **Comptabilité** : `require()` dans `file-storage.ts` remplacé par `import()` dynamique — corrige l'erreur ESLint `no-require-imports` qui faisait échouer la CI (#365)

## [v1.6.0] - 2026-06-11

### Ajouté

- **Module Comptabilité** : gestion des demandes de remboursement et avances de budget (#362)
  - Soumission de demandes (note de frais, avance) avec description, montant et pièces jointes
  - Workflows de traitement : SUBMITTED → PROCESSING (priorité normale/urgente) → APPROVED → remise
  - Plan de paiement multi-tranches avec dates prévisionnelles
  - Remise partielle : saisie du montant versé, création automatique d'une tranche résiduelle
  - Gestion des pièces jointes : upload (JPEG/PNG/PDF, max 5 Mo), téléchargement, suppression
  - Stockage fichiers : S3/MinIO si configuré, sinon système de fichiers local
  - Rôle `ACCOUNTANT` (accounting:view + accounting:manage)
  - Accès en lecture (accounting:view) pour `MINISTER` et `DEPARTMENT_HEAD`
  - Demandes récurrentes via séries (hebdomadaire / mensuel)
  - Notifications à chaque étape du workflow

## [v1.5.9] - 2026-06-08

### Ajouté

- **Module intégration v2** : suivi complet des nouveaux venus et convertis (#358)
  - Formulaire public `/rejoindre` : case à cocher "Appel au salut", réorganisation des sections, texte soins pastoraux revu
  - Workflow MSDP : suivi des nouveaux convertis (SUBMITTED → ASSIGNED → CONTACTED → IN_FORMATION → COMPLETED / ABANDONED), assignation d'un conseiller, notes, accès scopé par rôle
  - Dossier Parcours (`PersonJourney`) : 4 jalons avec timestamps (famille, PCNC, service STAR, discipolat), déduplication par téléphone/email, création automatique à la soumission du formulaire
  - Page `/integration/parcours` : liste avec filtres "sans X jalon", barre de progression, toggle inline des jalons
  - KPIs MSDP dans les statistiques d'intégration : entonnoir, délais moyens, tendance mensuelle, taux de réalisation des jalons
  - Fonctions INTEGRATION et MSDP dans la page "Fonctions des départements"

## [v1.5.8] - 2026-06-07

### Corrigé

- Collections média : le téléchargement échouait pour les visiteurs non authentifiés — le middleware bloquait `/api/media/collection/` avec 401, alors que la sécurité est gérée par le token de partage (#355)

## [v1.5.7] - 2026-06-07

### Corrigé

- Administration : la fonction système "Intégration" était absente de la page "Fonctions des départements" — impossible d'assigner la fonction à un département, bloquant la visibilité de la section Intégration pour les membres de l'équipe (#353)

## [v1.5.6] - 2026-06-07

### Corrigé

- Collections média : l'URL générée utilisait l'origine interne (Traefik ne forward pas le header Host sur `/api/admin/`) au lieu de l'URL publique — `APP_URL` est maintenant utilisé comme base (#351)

## [v1.5.5] - 2026-06-07

### Corrigé

- Sélection des bergers : inclut désormais les utilisateurs ayant un lien membre validé pour l'église, pas seulement ceux avec un rôle Koinonia explicite

## [v1.5.4] - 2026-06-07

### Corrigé

- Liens de partage collection : l'URL utilisait `localhost` au lieu de l'URL publique — l'origine est maintenant extraite de la requête HTTP entrante
- Formulaire rejoindre (`/rejoindre/[churchSlug]`) : sur mobile, la sélection d'une suggestion d'adresse ne déclenchait pas la détection de famille — passage de `onMouseDown` à `onPointerDown` avec `e.preventDefault()` pour garantir l'ordre des événements touch/mouse
- Module intégration : lien vers le formulaire public non cliquable dans la bannière du dashboard — rendu en balise `<a>` avec ouverture dans un nouvel onglet
- Compatibilité `AUTH_URL` (NextAuth v5) : tous les endpoints générant des URLs (emails berger, rappels inactivité, crons) tombaient sur `localhost` faute de prendre en compte la variable `AUTH_URL`

## [v1.5.3] - 2026-06-07

### Corrigé

- Migration intégration familles : collation explicite `utf8mb4_unicode_ci` pour éviter l'erreur errno 150 sur MariaDB 10.11 (qui utilise `utf8mb4_uca1400_ai_ci` par défaut)

## [v1.5.2] - 2026-06-06

### Corrigé

- Navigation : les sections Intégration et Médias n'apparaissaient pas pour les super admins sans rôle église explicite (`isGlobalManager` ne prenait pas en compte `isSuperAdmin`)

## [v1.5.1] - 2026-06-06

### Corrigé

- Formulaire rejoindre une famille : refonte UX section adresse — guidage visuel explicite, icône loupe dans le champ, message d'aide adaptatif, suggestions avec icône pin, résultat famille plus proéminent, dropdown plafonné pour le mobile

## [v1.5.0] - 2026-06-06

### Ajouté

- Module **Intégration familles** : suivi complet du parcours d'intégration des nouveaux membres (#346)
- Formulaire public `/rejoindre/[churchSlug]` : autocomplétion d'adresse (api-adresse.data.gouv.fr) et suggestion de famille en temps réel par géolocalisation point-in-polygon
- Workflow de demandes en 5 étapes : `SUBMITTED → ASSIGNED → CONTACTED → WHATSAPP_ADDED → INTEGRATED` + `ABANDONED`
- Dashboard demandes avec filtres par statut, recherche plein texte, vue table et cartes mobiles
- Page détail demande : transitions de statut, affectation berger/famille, édition des informations, notes internes
- Séparation des rôles : membres intégration (assign, rouvrir) vs berger assigné (contacter, WhatsApp, intégrer, abandonner, éditer)
- Page gestion bergers `/integration/leaders` : affectation berger/co-berger par famille
- Dashboard statistiques `/integration/stats` : KPIs, entonnoir de progression, tendance mensuelle 12 mois, distributions
- Cron inactivité 7 jours : notifie le berger (ASSIGNED/CONTACTED) ou les managers (SUBMITTED) avec anti-doublon
- Bannière lien public avec bouton copier sur le dashboard
- Notification in-app et email au berger lors de l'affectation d'une demande

## [v1.4.8] - 2026-05-23

### Corrigé

- Permissions médias : l'équipe production peut désormais créer/supprimer les liens VALIDATOR et PREVALIDATOR (#339)
- Permissions médias : l'équipe production peut supprimer les événements médias (#339)
- Permissions médias : l'équipe production peut valider les photos et fichiers (APPROVED/REJECTED/FINAL_APPROVED) (#339)
- Suppression d'événements médias : utilisation du bon bucket S3 (media au lieu de backup) (#339)
- Sidebar : lien "Sauvegardes" visible uniquement pour les super admins (#339)

## [v1.4.7] - 2026-05-22

### Corrigé

- Projets médias : miniatures non affichées, suppression bloquée, liens de validation projet (#336)
- Validation projet : refonte UX (swipe, raccourcis clavier, vue mobile/desktop, commentaires obligatoires pour la révision)
- Validation projet : décomptes fichiers en attente incorrects dans la vue validateur
- Validation projet : statistiques incomplètes dans la vue projet (statuts APPROVED, PREVALIDATED, PREREJECTED manquants)
- Upload nouvelle version : miniature non régénérée (`thumbnailKey = originalKey`)

## [v1.4.6] - 2026-05-21

### Ajouté

- Système de notifications complet — in-app + email sur tous les flux métier (#334) :
  - Demandes (secrétariat, médias) : notif aux équipes à la soumission, notif au demandeur à l'approbation/refus
  - Agenda pastoral : notif aux qualificateurs à la soumission, notif au demandeur au refus (email), notif Protocole à la validation, notif au demandeur à la planification (email)
  - Planning STAR : notifications in-app à l'affectation, au retrait et au changement de statut
  - Rôles : notif à l'utilisateur lors d'une nouvelle attribution
  - Fichiers médias : notif au créateur du projet sur approbation, refus, révision demandée et validation finale
  - Cron rappels planning : email vers le compte utilisateur lié (fallback `member.email`) + notif in-app au STAR

## [v1.4.5] - 2026-05-18

### Corrigé

- Dashboards Secrétariat, Communication et Production Média : le contenu des annonces était tronqué à 3 lignes sans possibilité de lire la suite — ajout d'un toggle "Voir plus / Voir moins" cohérent avec la vue "Mes demandes" (#331)

## [v1.4.4] - 2026-05-18

### Corrigé

- Migration `20260518000000_member_user_link_multi_church` : ordre ADD/DROP corrigé — MariaDB refusait de supprimer l'index `memberId_key` tant que l'index composite n'existait pas pour satisfaire la contrainte FK (#329)

## [v1.4.3] - 2026-05-18

### Corrigé

- Liaison STAR multi-église : migration BDD manquante dans v1.4.2 — la contrainte `memberId @unique` n'était pas supprimée en production, empêchant le lien d'un même STAR dans plusieurs églises (#327)

## [v1.4.2] - 2026-05-18

### Corrigé

- Liaison STAR multi-église : un STAR ayant déjà un lien compte dans une église n'apparaissait pas dans l'autocomplete de recherche des autres églises — la contrainte `memberId @unique` sur `MemberUserLink` a été remplacée par `@@unique([memberId, churchId])` pour permettre un lien par église (#325)
- Page d'accès en attente (`/no-access`) : la détection de demande en attente n'était pas scopée par église, bloquant les nouveaux utilisateurs souhaitant rejoindre plusieurs églises simultanément (#325)

## [v1.4.1] - 2026-05-17

### Corrigé

- Administration : la fonction système `PROTOCOLE` était absente de la page "Fonctions des départements" — les admins ne pouvaient pas l'assigner à un département
- Administration : le rôle `AGENDA_QUALIFIER` (Qualificateur Agenda) était absent du sélecteur de rôles dans la gestion des utilisateurs
- Administration : suppression de la section "Fonctions personnalisées" dans la page Fonctions des départements (labels sans comportement applicatif)

## [v1.4.0] - 2026-05-17

### Ajouté

- Agenda pastoral : module complet Phase 1 — flux de qualification (PENDING → VALIDATED → SCHEDULED), dashboard Qualificateur, dashboard Protocole, calendrier agenda, saisie directe activités/RDV, vue hebdomadaire par profil pastoral
- Agenda pastoral : formulaire public de demande de RDV (`/agenda-public/[churchSlug]`) accessible sans compte avec protection Turnstile
- Agenda pastoral : formulaire interne (`/agenda/request`) aligné sur le formulaire public (mêmes sections, pré-remplissage statut STAR et département depuis le lien membre)
- Agenda pastoral : email de confirmation envoyé au demandeur lors de la soumission (formulaire public et interne)
- Agenda pastoral : profils pastoraux configurables depuis `/admin/pastoral-profiles`
- Agenda pastoral : permissions `agenda:view`, `agenda:manage`, `agenda:qualify` et rôle `AGENDA_QUALIFIER`

### Corrigé

- Sidebar / navigation mobile : détection active de "Demande de RDV pastoral" corrigée (s'ouvrait dans l'accordéon Agenda au lieu de Demandes)
- Navigation : ordre du menu harmonisé, "Membres" renommé en "STAR"
- Sécurité : scope enforcement sur `PATCH /users/[userId]/roles` (T10)
- CI : coverage gate avec seuils minimaux (T09)
- Lint : react-hooks/set-state-in-effect dans BackupsClient et DownloadView

### Dépendances

- Mise à jour minor+patch de 6 dépendances npm (#317)

## [v1.3.6] - 2026-05-13

### Corrigé

- Événements : retirer un département d'un événement causait une erreur FK en production — les plannings associés sont maintenant supprimés avant la suppression du lien événement-département
- Annonces : soumettre une annonce avec diffusion externe/interne quand le département cible n'était pas configuré créait une demande orpheline invisible — une erreur explicite est maintenant retournée

## [v1.3.5] - 2026-05-13

### Corrigé

- Demandes : le texte complet des annonces n'était pas affiché dans "Mes demandes" — ajout du contenu avec un toggle "Voir plus / Voir moins" pour les textes longs
- Planning : retirer un STAR d'un département supprime désormais automatiquement ses affectations futures dans ce département (plannings et tâches)

## [v1.3.4] - 2026-05-09

### Corrigé

- Planning mensuel et hebdomadaire : l'export PDF/PNG capturait le layout mobile (~350px) au lieu de la largeur portrait A4 (672px) — la capture force désormais 672px quelle que soit la taille du viewport

## [v1.3.3] - 2026-05-09

### Corrigé

- Vue STAR : l'export PDF/PNG capturait le layout mobile (2 colonnes) — la capture force désormais un rendu A4 paysage (1122px, 4 colonnes) quelle que soit la taille du viewport

## [v1.3.2] - 2026-05-02

### Corrigé

- Demandes d'accès : la section "Demandes refusées" et la modale d'approbation avec sélecteur de département (DEPARTMENT_HEAD/DEPUTY) sont maintenant disponibles dans `/admin/access` (elles n'étaient présentes que dans `/admin/members`)
- Multi-église : un STAR servant dans plusieurs églises ne pouvait pas soumettre une demande de lien pour une seconde église si une demande était déjà en attente pour la première — la vérification de doublon est maintenant scoped par église

## [v1.3.1] - 2026-05-02

### Corrigé

- Projets média : les thumbnails ne s'affichaient plus après un `refreshProject()` — les URLs signées S3 sont maintenant embarquées dans la réponse API et le composant les consomme dynamiquement
- Projets média : suppression d'un fichier maintenant possible depuis le panneau latéral (bouton poubelle + confirmation, visible avec le rôle `media:manage`)
- Demandes d'accès : le sélecteur de ministère/département dans `/no-access` et `/profile` affichait tous les ministères de toutes les églises — filtrage par église sélectionnée ajouté
- Demandes d'accès : l'approbation d'une demande DEPARTMENT_HEAD/DEPUTY pour un STAR existant échouait si le departmentId stocké appartenait à une autre église — l'admin peut maintenant corriger le département dans la modale d'approbation

### Ajouté

- Demandes d'accès : section repliable "Demandes refusées" (30 dernières) avec motif, date et bouton "↩ Reconsidérer" pour remettre une demande en attente
- Demandes d'accès : rôle demandé et notes visibles dans chaque carte de demande en attente

## [v1.3.0] - 2026-05-02

### Ajouté

- Demandes de visuels : indicateur d'urgence (⚡) et tri prioritaire dans le dashboard Production Média quand la deadline est dans moins de 48h
- Demandes de visuels : bandeau d'avertissement dans le formulaire si la deadline choisie est dans moins de 48h
- Dashboard Production Média : liaison d'une demande à un projet média existant ou nouveau à la prise en charge ; lien de téléchargement affiché si un token de partage est disponible sur le projet

## [v1.2.9] - 2026-05-02

### Corrigé

- Demandes : la soumission d'une demande de visuel échouait avec "Type de demande invalide : undefined" — le champ `type` n'était pas envoyé au serveur

## [v1.2.8] - 2026-05-01

### Amélioré

- Notifications : bottom sheet plein-largeur sur mobile (poignée, fermeture par tap backdrop ou bouton ✕, scroll sécurisé iPhone) — le dropdown desktop reste inchangé

## [v1.2.7] - 2026-05-01

### Corrigé

- Membres : la fusion de comptes échouait avec une violation de clé étrangère quand les deux membres avaient des doublons (planning, tâches, présences discipolat, relation disciple) — les doublons non migrés sont désormais supprimés avant la suppression du membre source

## [v1.2.6] - 2026-05-01

### Corrigé

- Membres : fusion de comptes échouait avec une contrainte unique quand les deux membres avaient déjà un planning pour le même événement/département
- MRBS : `computeMrbsLevel` ne prenait en compte qu'un seul rôle par utilisateur — les utilisateurs avec plusieurs rôles pouvaient avoir un niveau MRBS sous-estimé

## [v1.2.5] - 2026-04-30

### Corrigé

- Mobile : lien "Salles" (MRBS) absent du menu mobile — `mrbsUrl` et `mrbsAdminLink` n'étaient pas transmis au `MobileNavSheet`

## [v1.2.4] - 2026-04-30

### Corrigé

- MRBS : cookie de session posé sur le domaine parent (`.iccrennes.fr`) via `AUTH_COOKIE_DOMAIN` — nécessaire pour que `booking.iccrennes.fr` reçoive le cookie posé par `koinonia.iccrennes.fr`
- CI : mise à jour des actions GitHub vers Node.js 24 natif (`checkout` v6, `setup-node` v6, `upload-artifact` v7)

## [v1.2.3] - 2026-04-30

### Corrigé

- MRBS : suppression des logs de debug dans `/api/auth/mrbs/session`

## [v1.2.2] - 2026-04-29

### Corrigé

- MRBS : credentials BDD masqués dans les logs (`mysql://***:***@host/db` au lieu de l'URL complète)
- MRBS : log de debug `[mrbs/session]` pour diagnostiquer les problèmes de niveau (userId, churchId, level)

## [v1.2.1] - 2026-04-29

### Corrigé

- MRBS : résolution de session toujours nulle (niveau 0 pour tous) — le plugin PHP envoyait le token via header `X-Mrbs-Session-Token` mais l'API le lisait en query param `?token=`
- MRBS : ajout logs d'erreur sur `fetchMrbsUsers` pour diagnostiquer les problèmes de connexion BDD
- MRBS : rôle SECRETARY passe en niveau 2 (admin MRBS) pour cohérence avec ses droits Koinonia

## [v1.2.0] - 2026-04-29

### Ajouté

- Module MRBS (optionnel) : SSO entre Koinonia et MRBS (réservation de salles) — les utilisateurs connectés à Koinonia sont automatiquement reconnus dans MRBS via cookie partagé
- Module MRBS : mapping automatique des niveaux MRBS (0 lecture, 1 utilisateur, 2 admin) selon le rôle Koinonia
- Module MRBS : page d'administration `/admin/mrbs-links` pour lier les comptes MRBS aux comptes Koinonia (auto-détection par email, liaison manuelle)
- Module MRBS : endpoints API `/api/auth/mrbs/*` pour la résolution de session et la récupération des utilisateurs
- Module MRBS : lien "Salles" dans la sidebar pointant vers l'instance MRBS configurée
- Migration BDD : table `mrbs_user_links` pour les liaisons manuelles de comptes

## [v1.1.13] - 2026-04-29

### Corrigé

- Médias : création d'un lien "Téléchargement (toutes)" (`MEDIA_ALL`) échouait avec "Données invalides" — `MEDIA_ALL` était absent du schéma de validation côté API

## [v1.1.12] - 2026-04-29

### Ajouté

- Médias : droits d'upload pour la team Communication — les membres peuvent désormais uploader des photos dans les événements et projets média

## [v1.1.11] - 2026-04-29

### Ajouté

- Médias : token `MEDIA_ALL` — lien de téléchargement donnant accès à toutes les photos (validées et non validées), pour l'équipe de Laval
- Médias : lightbox plein écran dans la vue téléchargement — clic sur une miniature ouvre la photo HD avec navigation ←/→, sélection et téléchargement intégrés
- Médias : vue de validation iso mediaflow — flux card-swipe photo par photo avec swipe gauche/droite, raccourcis clavier (← X / → V / Espace), toast undo, barre de progression temps réel, stats en bas d'écran
- Médias : lightbox HD inline dans la validation — touche H / Entrée ou clic sur le bouton HD ouvre l'original avec chargement progressif et boutons valider/rejeter intégrés
- Médias : bouton "X en attente →" dans le header de validation pour sauter directement au prochain PENDING
- Médias : récap de validation revu — fond noir cohérent, 3 cartes stats (validées / en attente / rejetées), grille 5 colonnes, badge de statut par miniature, toggle thème clair/sombre
- Médias : accès en lecture aux événements et projets pour la team Communication (vue uniquement, sans upload ni gestion)

### Corrigé

- Auth : erreur `CallbackRouteError: unexpected "iss"` sur le callback Google OAuth — ajout de `trustHost: true` dans la config NextAuth pour les déploiements derrière reverse proxy (Traefik)
- Médias : les droits de la team Communication sont limités à la vue uniquement (`requireMediaUploadAccess` et `requireMediaManageAccess` restent réservés à PRODUCTION_MEDIA)

## [v1.1.10] - 2026-04-28

### Ajouté

- Médias : upload de photos via presigned URL S3 — le fichier transite directement du navigateur vers S3 sans passer par Next.js (endpoints `POST /photos/sign` + `POST /photos/confirm`)

### Corrigé

- Médias : les uploads de photos > 10MB échouaient toujours via les route handlers — ajout de `middlewareClientMaxBodySize: 100MB` dans next.config.ts (le précédent fix `serverActions.bodySizeLimit` ne couvrait pas les routes API transitant par le middleware)
- Médias : erreur de parsing FormData retourne désormais un 400 explicite au lieu d'une exception non gérée
- Emails : le digest planning échouait avec `self-signed certificate` sur un relay SMTP local (localhost:25) — ajout de l'option `ignoreTLS` (variable `SMTP_IGNORE_TLS=true`)

### Documentation

- `.env.example` : ajout de `SMTP_IGNORE_TLS` et `SMTP_TLS_REJECT_UNAUTHORIZED`

## [v1.1.9] - 2026-04-28

### Corrigé

- Médias : l'upload de photos ne bloque plus sur la limite de 10MB de Next.js (portée à 100MB dans next.config.ts)
- Médias : correction d'un bug critique — les uploads de photos authentifiés retournaient 400 silencieusement (clé FormData `"file"` → `"files"`, en accord avec le serveur)

## [v1.1.8] - 2026-04-26

### Ajouté

- STAR : fusion manuelle de deux membres quelconques depuis la page des doublons
  - Deux sélecteurs avec recherche par nom/email (exclusion croisée automatique)
  - Réutilise le flow de résolution de conflits existant (modal côte à côte, champ par champ)

### Documentation

- CLAUDE.md : ajout des sections Setup local, Workflow contributeur et Pièges connus pour faciliter l'onboarding de nouveaux développeurs

## [v1.1.7] - 2026-04-25

### Ajouté

- STAR : fusion de doublons avec résolution de conflits champ par champ
  - Détection automatique par nom normalisé et/ou email identique
  - Page `/admin/members/duplicates` : liste des groupes, modal côte à côte (source / cible), bouton ⇄ pour inverser
  - Résolution par champ : prénom, nom, email, téléphone
  - Choix du compte Google à conserver si les deux membres ont un lien
  - Fusion transactionnelle : Planning, TaskAssignment, Discipleship, DiscipleshipAttendance, MemberDepartment (déduplication automatique)
- STAR : assignation automatique du rôle STAR lors de l'approbation d'une demande de liaison (si aucun rôle existant dans l'église)
- STAR : endpoint bulk pour rétroactivement assigner le rôle STAR aux membres déjà liés sans accès

### Corrigé

- Cron : les erreurs d'envoi d'email (rappels et digest planning) affichent maintenant le message d'erreur réel dans les logs

## [v1.1.6] - 2026-04-24

### Corrigé

- Médias : les liens de partage s'affichent immédiatement après création ou suppression
- Médias : correction d'un bug silencieux où `refreshEvent()` pouvait écraser les données photos complètes

## [v1.1.5] - 2026-04-24

### Ajouté

- Médias : téléchargement ZIP des photos approuvées depuis la page de téléchargement
  - Bouton "Tout télécharger (.zip)" pour toutes les photos
  - Bouton "Télécharger (N)" pour la sélection en cours

## [v1.1.4] - 2026-04-24

### Corrigé

- Médias : la team PRODUCTION_MEDIA voit et peut créer tous les types de liens de partage (section absente auparavant)
- Médias : modale de confirmation avant suppression d'un événement
- Médias : modale de confirmation avant suppression d'un lien de partage

## [v1.1.3] - 2026-04-24

### Corrigé

- Médias : la team PRODUCTION_MEDIA peut désormais créer, voir et supprimer les tokens VALIDATOR/PREVALIDATOR (liens de validation)

## [v1.1.2] - 2026-04-23

### Corrigé

- Mobile : BottomNav ne se décale plus sur les pages larges (overflow-x: hidden sur html)
- Mobile : onglets "Accès & rôles" scrollables horizontalement sur petits écrans
- Mobile : MobileNavSheet s'affiche au-dessus du BottomNav (z-index corrigé)
- Mobile : footer visible au-dessus du BottomNav (padding-bottom ajouté)
- Médias : accès en lecture et upload limités aux STARs membres d'un département PRODUCTION_MEDIA (auparavant inaccessible)

## [v1.1.1] - 2026-04-23

### Corrigé

- Authentification : erreur `OAuthAccountNotLinked` pour les utilisateurs migrés depuis Mediaflow — liaison automatique du compte Google à l'utilisateur existant par email

## [v1.1.0] - 2026-04-23

### Ajouté

- Comptes rendus : statistiques Sainte Cène (supports utilisés/restants) dans l'onglet Statistiques et l'export Excel
- Comptes rendus : section Navette (H/F/Enfants/Total) dans la saisie, les statistiques et l'export Excel
- Médias : édition d'un événement média (renommage et liaison à un événement planning)
- Admin : UI de gestion des sauvegardes (liste, déclenchement manuel, restauration avec double confirmation)

### Mis à jour

- Dépendances npm (minor/patch) — next-auth beta.31

## [v1.0.0] - 2026-04-17

### Sécurité — audit pré-v1.0

- BLOCKER-1 : gestion des rôles restreinte à `events:manage` — MINISTER exclu, SECRETARY autorisé (décision documentée)
- BLOCKER-2 : `getUserDepartmentScope(session, churchId)` — filtrage par église pour corriger le bypass scope multi-tenant
- BLOCKER-3 : clés S3 upload re-dérivées server-side — `originalKey`/`thumbnailKey` client ignorés
- HIGH-1 : recherche utilisateur scopée à l'église (`churchRoles ∨ memberLinkRequests PENDING/APPROVED`) ; éligibilité vérifiée dans `member-user-links`
- HIGH-2 : machine d'état validation photo — transitions bloquées par type de token (PREVALIDATOR/VALIDATOR) ; correction d'erreur APPROVED ↔ REJECTED intentionnellement autorisée
- HIGH-1 : filtre `memberLinkRequests` restreint aux statuts PENDING/APPROVED
- P0-1 : tokens VALIDATOR/PREVALIDATOR réservés à `media:manage` ; masquage pour `media:view`
- P0-2 : scope département enforced sur GET et PUT planning
- P0-4 : séparation S3 backup/media — `deleteMediaFiles()` dédié
- P0-5 : XOR strict `mediaEventId ⊕ mediaProjectId` à l'upload
- P0-6 : `MediaSettings` tenant-scoped par `churchId` (migration `20260416000000`)
- P1-1 : email retiré du select `/users/search`
- P1-3 : `xlsx` remplacé par `exceljs` (HIGH CVE)
- P1-4 : `lint:boundaries` couvre `src/core src/modules src/app`
- Exceptions sécurité résiduelles documentées dans `docs/security-exceptions.md`

### Ajouté

- Navigation mobile : bottom sheet avec drill-down à deux niveaux (remplace le drawer latéral)
- Planning mobile : liste plate avec séparateurs de ministère (suppression des accordéons imbriqués)
- Suppression du bouton "Planning" de la bottom nav mobile
- Endpoint `GET /api/health` — statut, version, db, uptime
- PWA : manifest + service worker
- Export PDF planning et comptes rendus
- Notifications email rappels de service (J-3, J-1)
- Module Discipolat : relations, suivi présences, export Excel, stats
- Module Média : événements, projets, phases, tokens de validation
- Système de demandes unifié (`Request`) — annonces + demandes secrétariat
- Dashboard comptes rendus avec export Excel/PDF
- Gestion des accès (`/admin/access`) : MINISTER, DEPARTMENT_HEAD, REPORTER, STAR
- Liaison compte STAR (`MemberUserLink`, `MemberLinkRequest`)
- Calendrier événements, récurrence, duplication planning
- Vue planning STAR (`/planning`)
- Statistiques présences par membre et département
- Audit log (`AuditLog`)
- Rate limiting sur routes sensibles
- CI/CD GitHub Actions (typecheck, lint, boundaries, tests, version check)
- Déploiement Docker multi-stage + Traefik

### Tests

- 267 tests (38 fichiers) — couverture routes RBAC, multi-tenant, S3, machine d'état

## [v0.19.7] - 2026-04-12

### Sécurité

- Audit sécurité P0 : `DEMANDE_ACCES` — whitelist des rôles attribuables (MINISTER, DEPARTMENT_HEAD, DISCIPLE_MAKER, REPORTER) ; escalade vers SUPER_ADMIN/ADMIN/SECRETARY bloquée (#209)
- Audit sécurité P0 : `isSuperAdmin(email)` renommée en `isBootstrapSuperAdminEmail()` (non-exportée) — seul `session.user.isSuperAdmin` (DB-backed, révocable) est utilisé pour les contrôles d'accès API (#209)
- Audit sécurité P0 : routes `/api/churches`, `/api/admin/backups`, `/api/churches/onboard` migrent vers `requireSuperAdmin()` DB-backed (#209)
- Audit sécurité P0 : `member-link-requests` — validation cross-tenant sur `ministryId` et `departmentIds` lors de l'approbation (#209)
- Audit sécurité P1 : récurrence non plafonnée — `MAX_RECURRENCE_OCCURRENCES = 104` dans `events/route.ts` et `request-executor.ts` ; dates invalides rejetées par Zod (#209)
- Audit sécurité P1 : réponse API honnête — `recurrenceTruncated: true` et `maxOccurrences: 104` retournés si le plafond est atteint (#209)

### Corrigé

- Planning : les admins (SUPER_ADMIN, ADMIN, SECRETARY) peuvent modifier le planning après la date limite (#208)

### Qualité

- ESLint : règle `@typescript-eslint/no-unused-vars` avec `argsIgnorePattern/varsIgnorePattern: "^_"` (#209)
- `.gitignore` : exclusion de `coverage/` et `.codex` (#209)
- Dépendances : `npm audit fix` — defu, dompurify, hono, brace-expansion, next (#206)

## [v0.19.6] - 2026-04-06

### Corrigé

- Dashboard : sélecteur de mois utilisait l'heure UTC — le mois courant pouvait être décalé en début de mois pour les utilisateurs hors UTC (#204)

### Amélioré

- Guide utilisateur : ajout des features manquantes (stats planning, calendrier, profil, discipolat ×3, demandes ×5, journaux d'audit, fonctions départements) (#204)
- Guide utilisateur : correction des niveaux d'accès par rôle selon la matrice de permissions réelle (#204)
- Tour interactif : SECRETARY ajoutée au discipolat, étape "Annonces" → "Demandes", accents corrigés, contenus réécrits (#204)
- Docs : ajout `docs/guide-screenshots.md` — liste des 24 captures et procédure de publication (#204)

## [v0.19.5] - 2026-04-06

### Corrigé

- Sélecteur d'église : remplacement de `router.refresh()` par `window.location.reload()` pour garantir le rechargement sur tous les navigateurs (#202)
- Accès & rôles : les utilisateurs membres d'une autre église sont maintenant visibles pour l'attribution de rôles (#202)
- Discipolat : seuls SUPER_ADMIN, ADMIN et SECRETARY ont la vue globale — les autres rôles (DISCIPLE_MAKER, MINISTER, DEPARTMENT_HEAD) sont scopés à leurs propres disciples (#202)

## [v0.19.4] - 2026-04-05

### Corrigé

- Discipolat : filtre "Mes disciples" invisible pour les SuperAdmins liés à une fiche STAR (#198)
- Discipolat : filtre "Mes disciples" actif par défaut quand disponible (#199)

## [v0.19.3] - 2026-04-05

### Corrigé

- Discipolat : filtre "Mes disciples" invisible pour les admins/secrétaires liés à une fiche STAR (#196)

## [v0.19.2] - 2026-04-05

### Corrigé

- Cron : middleware proxy bloquait `POST /api/cron` (sans slash final) → 401
- Doc : port `3000` hardcodé remplacé par `${PORT:-3000}` dans les services systemd et crontab
- Doc : typo restauration backup — `MYSQL_PWD` doit précéder `mysql`, pas `gunzip`

## [v0.19.1] - 2026-04-04

### Documentation

- Explication du cookie de session (`__Secure-authjs.session-token` en prod, `authjs.session-token` en dev) pour les appels API restore via curl

## [v0.19.0] - 2026-04-04

### Ajouté

- Digest planning secrétariat : email récapitulatif horaire des modifications de planning, configurable via `Church.secretariatEmail` (Configuration > Église)
- Endpoint cron orchestrateur `POST /api/cron` : remplace `/api/cron/reminders`, gère rappels J-1/J-3 (1x/jour par église) et digest planning (horaire si changements)
- Template email HTML pour le digest planning (`buildPlanningDigestEmail`)

### Technique

- Migration : `Church.secretariatEmail`, `Church.reminderLastSentAt`, `Church.planningDigestLastSentAt`
- Timer systemd `koinonia-cron.timer` (hourly) remplace `koinonia-reminders.timer`
- Doc : configuration SMTP, timer systemd pour les rappels, migration vers le nouveau timer cron

## [v0.18.7] - 2026-04-01

### Documentation

- Mise à jour stack technique (Node.js 22, Next.js 16, Prisma 7) dans architecture.md et CLAUDE.md
- Endpoints statistiques explicités : formules de calcul, colonnes exports Excel, conventions sections (#184, #185)
- Guide utilisateur : flux onboarding multi-étapes et onglet Demandes admin
- production.md : Node.js 22+, `prisma.config.ts` dans l'artifact

## [v0.18.6] - 2026-04-01

### Corrigé

- Onboarding : rôles transverses (Faiseur de disciples, Reporter) masqués pour les utilisateurs STAR (#182)
- Onboarding : bouton "sans STAR" renommé en "Je souhaite accéder à l'application dans un autre rôle" (#182)

## [v0.18.5] - 2026-04-01

### Corrigé

- Utilisateurs avec une fiche STAR liée mais sans rôle d'église invisibles dans Configuration > Utilisateurs (#180)

## [v0.18.4] - 2026-04-01

### Corrigé

- Déploiement : inclusion de `prisma.config.ts` dans l'artifact pour que `prisma migrate deploy` trouve l'URL de la base de données (Prisma 7)

## [v0.18.3] - 2026-04-01

### Ajouté

- Onboarding multi-étapes : identité → correspondance STAR → département → rôle → confirmation
- Recherche de membre insensible à la casse et aux accents (NFD + `utf8mb4_unicode_ci`)
- Demande de rôle lors de l'inscription : membre, responsable, adjoint, ministre, faiseur de disciples, reporter
- Rôles transverses (Faiseur de disciples, Reporter) sans fiche STAR requise
- Champ notes libre pour préciser la demande
- Onglet "Demandes" dans l'admin avec détails enrichis (département, rôle demandé, notes)
- Création automatique des rôles à l'approbation de la demande

## [v0.18.2] - 2026-04-01

### Technique

- Upgrade Prisma 6 → 7 (driver adapter MariaDB, `prisma.config.ts`, client généré dans `src/generated/prisma/`)

## [v0.18.1] - 2026-04-01

### Technique

- Upgrade Node.js 20 → 22 (CI + `.nvmrc`)
- Upgrade Next.js 15 → 16 (`src/middleware.ts` → `src/proxy.ts`)

## [v0.18.0] - 2026-03-31

### Nouveautés

- Calendrier : vue multi-mois avec sélecteurs de période (jusqu'à 12 mois simultanés)
- Calendrier : export PDF (impression), téléchargement PNG et copie dans le presse-papiers
- Discipolat : toggle global « Tous / Mes disciples » persistant sur les 3 onglets (Relations, Appel, Statistiques) pour les admins/secrétaires qui sont aussi FD

### Correctifs

- Tâches : erreur 400 lors de l'affectation à un membre dont le statut avait changé entre deux sessions

## [v0.17.5] - 2026-03-31

### Correctifs

- Pages `/admin/events/[eventId]` et `/admin/events/[eventId]/report` : `notFound()` au lieu de `ApiError(404)` quand l'eventId est invalide (corrige l'erreur 500 en production)

## [v0.17.4] - 2026-03-31

### Correctifs

- Cascade FK manquante lors de la suppression d'événements en lot : supprime désormais `DiscipleshipAttendance`, `EventReport`, `TaskAssignment` et `AnnouncementEvent` avant `event.deleteMany`

## [v0.17.3] - 2026-03-28

### Améliorations

- Gestion des membres : vue cartes responsive (1/2/3 colonnes), filtres persistants, tri alphabétique, sélection groupée

## [v0.17.2] - 2026-03-28

### Nouveautés

- Statistiques : sélection de période personnalisée (champs Du / Au) en plus des périodes prédéfinies (1, 3, 6, 12, 24 mois)

### Correctifs

- Saisie planning : l'EventSelector n'affiche plus que les événements auxquels le département est programmé
- Admin événements : refonte UX — tri ascendant, filtres persistants, édition de la récurrence, vue carte, gestion des séries

## [v0.17.1] - 2026-03-28

### Correctifs

- Lint CI : remplacement du `useMemo([], [])` par un `useState` lazy initializer dans `EventSelector`

## [v0.17.0] - 2026-03-28

### Nouveautés

- Vue hebdomadaire : affichage des tâches par STAR (pills colorées), aligné sur la vue mensuelle
- Sélection d'événement en deux temps : select mois → select événement avec auto-sélection
- Types d'événement standardisés : Culte (violet), Prière (orange), Réunion (bleu), Formation (rouge), Autre (vert) — badge coloré partout
- Lien Statistiques transmet le département courant pour pré-sélection directe

### Améliorations

- Vue hebdomadaire et mensuelle : carte élargie (`max-w-2xl`), noms STAR en gras
- Vue hebdomadaire : zone notice conditionnelle, bouton "Ajouter" dans la section membres, boutons d'action exclus des captures
- Vue hebdomadaire : bouton Supprimer pour les notices existantes
- Navigation dashboard : renommage des boutons — Saisie, Vue semaine, Vue mois
- Admin événements : saisie du type via select à la place d'un champ texte libre

### Correctifs

- Calendrier : correction du décalage des événements du dimanche (bug timezone UTC vs local)

## [v0.16.1] - 2026-03-28

### Améliorations

- Vue hebdomadaire : design aligné sur la vue mensuelle (header violet, cartes avec bloc date, notices intégrées par département)
- Vue hebdomadaire : ajout des boutons export — copier image, télécharger PNG, export PDF
- Vue hebdomadaire : bouton "Semaine" ajouté dans la navigation principale du dashboard

## [v0.16.0] - 2026-03-28

### Nouveautés

- Notice de service par département : les responsables peuvent rédiger une notice affichée sur la nouvelle vue planning hebdomadaire (#150)
- Nouvelle vue "Semaine" dans le dashboard : navigation semaine par semaine, événements groupés par jour, notices éditables inline

### Correctifs

- Artifact de déploiement : inclusion complète de `node_modules` — fin des erreurs de dépendances transitives Prisma manquantes (#155)

### Dépendances

- Bump actions/checkout 4.2.2 → 4.3.1 (#148)
- Bump actions/setup-node 4.1.0 → 4.4.0 (#147)
- Bump appleboy/ssh-action 1.0.3 → 1.2.5 (#146)
- Bump dépendances npm mineures/patch (#149)

## [v0.15.5] - 2026-03-28

### Améliorations

- Message WhatsApp du compte rendu reformaté : zéro émoji, en-têtes en gras, structure lisible centrée sur les informations (#151)

## [v0.15.4] - 2026-03-28

### Correctifs

- Inclut tout `node_modules/@prisma/*` dans l'artifact (fix complet après `@prisma/engines` seul ne suffisait pas — `@prisma/debug`, `@prisma/internals` etc. sont aussi requis par le CLI)

## [v0.15.3] - 2026-03-28

### Correctifs

- Inclut `@prisma/engines` dans l'artifact de déploiement pour corriger `Cannot find module '@prisma/engines'` lors de `prisma migrate deploy`

## [v0.15.2] - 2026-03-28

### Documentation

- Ajoute `SECURITY.md` : politique de divulgation responsable, périmètre, contact et délais de traitement

## [v0.15.1] - 2026-03-28

### Sécurité

- Restreint l'accès au détail des demandes internes (`GET /api/requests/[id]`) aux seuls propriétaires, membres du département assigné et gestionnaires (#132)
- Restreint l'accès au détail des annonces (`GET /api/announcements/[id]`) aux seuls propriétaires et gestionnaires (#133)
- Enforce le scope rôles : `MINISTER` requiert un ministère, `DEPARTMENT_HEAD` requiert au moins un département (#134/#135)
- Valide les références `departmentId`/`ministryId` cross-tenant dans `createDemand` ; utilise le payload fusionné effectif lors d'une approbation (#136)
- Supprime la journalisation du stderr mysqldump/mysql (risque d'exposition SQL) (#137)
- Chiffrement SSE-AES256 sur les uploads de backup S3 (#138)
- Supprime `scripts/deploy.sh` (build depuis les sources en production, contourne le CI) ; aligne `docs/production.md` sur le déploiement artifact-only (#139)
- Documente la limite single-instance du rate-limit et l'hypothèse proxy (#140)
- Échappe le HTML dans les emails de rappel ; masque les adresses email dans les logs d'échec SMTP (#142)

### Tests

- Ajoute test `ZodError → HTTP 400` dans `api-utils.test.ts` (#141)
- Ajoute tests de scope rôles (MINISTER, DEPARTMENT_HEAD, cross-church, escalade) (#141)

## [v0.15.0] - 2026-03-27

### Sécurité

- **Validation cross-tenant** : les demandes exécutables, annonces et routes de planification valident désormais que toutes les références (departmentIds, eventIds, ministryId) appartiennent au même `churchId` (#117, #118, #119)
- **Gestion des rôles** : scoping du périmètre de département par église dans les vérifications d'autorisation (#119)
- **Erreurs de validation** : les erreurs Zod retournent désormais 400 avec détails par champ au lieu de 500 (#121)
- **Logs sanitisés** : suppression des stack traces et données sensibles dans les logs d'erreur (#125)
- **Tokens OAuth** : confirmé non exposés dans la session client (#128)

### CI/CD

- Déploiement conditionné au succès complet du CI (`workflow_run`) (#122)
- Actions GitHub épinglées à des SHA immuables (supply chain) (#123)
- Build immutable en CI (Next.js standalone), déploiement sans build sur le serveur (#124)

### Configuration

- Docker : port MariaDB bindé sur `127.0.0.1` uniquement (#129)
- `.env.example` : placeholders explicitement non utilisables (#129)
- Documentation systemd hardening et sécurité bucket S3 (#127, #129)

### Tests

- +29 tests sur les routes sensibles : cron backup/reminders, admin backups/restore, requests, announcements (105 → 134 tests) (#126)

## [v0.14.1] - 2026-03-26

### Modifie

- **Vue STAR en service** : header indigo apaisé, fond clair, départements actifs uniquement, départements vides regroupés en ligne compacte
- **Planning mensuel** : badges rôle en outline inline après le nom, badge Debrief en violet plein, tâches rendues individuellement

## [v0.14.0] - 2026-03-26

### Nouveautes

- **Vue STAR en service redessinée** : header bicolore (violet + jaune), grille violet, badges Debrief/Remplaçant, optimisée pour export paysage WhatsApp (#116)
- **Planning mensuel redessiné** : blocs date proéminents, header violet, badges tâches et debrief, export image/PDF pour WhatsApp (#115)
- **Demande ajout événement enrichie** : sélection des départements, récurrence hebdomadaire, offset deadline (#116)
- **Demande modification événement** : champs type, date et deadline ajoutés (#116)
- **Demande modification planning** : réécriture en gestion des départements en service (#116)

## [v0.13.0] - 2026-03-25

### Nouveautes

- **Système de demandes unifié** : formulaire unique pour soumettre annonces et demandes au secrétariat (#105)
- **Nouveaux types de demandes** : ajout/modification/annulation d'événement, modification de planning, demande d'accès (#105)
- **Exécution automatique** : les demandes approuvées sont exécutées automatiquement (création d'événement, modification de planning, attribution de rôle) (#105)
- **Fonctions de département personnalisées** : les admins peuvent créer et supprimer des fonctions en plus des fonctions système (#105)

### Modifie

- Migration `ServiceRequest` → `Request` (modèle unifié avec payload JSON) (#105)
- Migration `DepartmentFunction` enum → `String?` (fonctions flexibles) (#105)
- Sidebar : section "Annonces" renommée "Demandes" avec nouvelles routes (#105)
- Pages annonces absorbées dans le système de demandes unifié (#105)

### Corrige

- Connexion super admin au premier démarrage (pas d'église configurée) (#105)
- Sélecteur "Dimanches de diffusion" restauré dans le formulaire d'annonce (#105)
- Attribution des rôles transverses (Admin, Secrétaire, Faiseur de Disciples) depuis la page Accès & rôles (#112)
- Migration Prisma idempotente pour production (tables existantes via db push) (#105)

## [v0.12.6] - 2026-03-24

### Corrections

- Deploy : ajout de `prisma generate` manquant dans le workflow de déploiement — corrige le crash de création d'événements après migration N-N (#102)

## [v0.12.5] - 2026-03-23

### Corrections

- Accès : les nouveaux utilisateurs sans rôle apparaissent dans la page "Accès & rôles" (#101)

## [v0.12.4] - 2026-03-23

### Nouveautés

- Discipolat : gestion complète pour admins et secrétariat — accès à toutes les lignées, modification du FD actuel et du premier FD (#100)
- Discipolat : le secrétariat obtient la permission `discipleship:manage`
- Discipolat : filtre "Mes disciples" pour les admins/secrétaires cumulant le rôle FD
- Discipolat : un admin/secrétaire avec le rôle FD conserve la vue admin complète

## [v0.12.3] - 2026-03-23

### Corrections

- TypeScript : correction des erreurs de lint après la migration N-N membres/départements (#99)
- Remplacement de toutes les références `member.department` par `member.departments` dans les routes API et composants
- Mise à jour des mocks de tests pour refléter le nouveau schéma N-N

## [v0.12.2] - 2026-03-22

### Corrections

- Mobile : touch targets agrandis sur la sidebar, les tabs et les boutons d'action
- Mobile : labels bottom nav passés de 10px à 11px, padding bas ajusté
- Mobile : grilles stats responsive (présence, intégration) sur les comptes rendus
- Mobile : export Excel layout vertical avec inputs pleine largeur
- Mobile : modales de la page Accès en bottom-sheet
- Mobile : titres d'annonces tronqués (line-clamp)
- Mobile : vue cartes pour les tables Relations et Statistiques du discipolat
- Mobile : sélecteur de période discipolat en layout vertical

## [v0.12.1] - 2026-03-22

### Documentation

- Tour guide : ajout des étapes Membres, Annonces, Discipolat, Comptes rendus
- Tour guide : visibilité par rôle (REPORTER voit les CR, DISCIPLE_MAKER voit le discipolat)
- Tour guide : renommage Administration→Configuration, Départements→Planning
- Guide utilisateur : description enrichie des comptes rendus (orateur, export Excel)
- API docs : champs speaker/messageTitle + endpoint export Excel
- Database docs : colonnes speaker et messageTitle sur event_reports
- Roadmap : items export Excel et champs orateur/titre cochés

## [v0.12.0] - 2026-03-22

### Ajouts

- Export Excel des statistiques hebdomadaires des cultes avec sélection de période
- Champs orateur et titre du message dans les comptes rendus d'événements
- Endpoint API `GET /api/events/reports/export` avec protection contre l'injection de formules Excel

## [v0.11.3] - 2026-03-22

### Sécurité

- Routes unitaires membres/départements : validation cross-tenant sur departmentId et ministryId cibles
- Comptes rendus : validation des departmentIds de section contre l'église de l'événement
- Duplication de planning : vérification que l'événement cible appartient à la même église
- Discipolat PATCH : enforcement du scope DISCIPLE_MAKER + validation cross-tenant du nouveau FD
- Discipolat POST : validation de tous les memberIds (disciple, FD, firstMaker) contre l'église
- Suppression membre : cascade complète incluant discipleship (unitaire et bulk)
- Middleware : exception /api/cron/* pour authentification par bearer token

### Tests

- 25 nouveaux tests de sécurité multi-tenant (105 total)
- Couverture : bulk ops, routes unitaires, discipolat, rapports, duplication planning

## [v0.11.2] - 2026-03-22

### Sécurité

- Bulk PATCH destination : validation que les champs churchId/ministryId/departmentId cibles appartiennent à la même église (ministères, départements, membres)
- Planning PUT : vérification que tous les memberIds appartiennent au département cible
- Service requests POST : validation des références departmentId et ministryId contre l'église spécifiée
- Service requests PATCH : application stricte du owner read-only (blocage de toute modification, pas seulement le statut)

## [v0.11.1] - 2026-03-22

### Sécurité

- Cohérence cross-tenant event↔département : vérification que le département appartient à la même église que l'événement (planning GET/PUT, event-departments POST/DELETE)
- Opérations bulk : validation que TOUS les IDs appartiennent à la même église (events, departments, members, ministries PATCH)
- Suppression de rôles privilégiés : blocage pour les non-super-admins (SUPER_ADMIN, ADMIN, SECRETARY)
- Service-requests canManage : scope du calcul de permissions à l'église demandée
- Bypass deadline planning : scope de la vérification des rôles à l'église de l'événement

## [v0.11.0] - 2026-03-22

### Sécurité

- Autorisation multi-tenant scopée par église sur toutes les routes API (requireChurchPermission + resolveChurchId)
- Server components scopés à l'église active via getCurrentChurchId (19 pages)
- Rate limiting activé sur les routes d'authentification et de mutation (3 presets : AUTH, MUTATION, SENSITIVE)
- Tests de sécurité : 36 tests couvrant l'isolation multi-tenant, le rate limiting, et le rejet cross-tenant

### Ajouté

- Audit logging systématique sur tous les endpoints de mutation (~50 opérations, 25 fichiers)
- Standardisation des actions d'audit : CREATE, UPDATE, DELETE
- churchId ajouté aux logs d'audit du planning

### Corrigé

- Suppression d'événements : résolution de la contrainte FK en supprimant les enregistrements dépendants dans l'ordre correct
- Routes discipolat : migration de prisma.auditLog.create direct vers le helper logAudit

## [v0.10.0] - 2026-03-21

### Modifié

- Renommage de l'application PlanningCenter en **Koinonia** (grec : communion, partage)
- Repo GitHub renommé en `iccbretagne/koinonia`
- Mise à jour de tous les fichiers : package.json, metadata, UI, PWA, emails, déploiement, documentation
- Utilisateur système et dossier de déploiement renommés (`planning` → `koinonia`)
- README réécrit pour refléter la vision élargie de l'application

## [v0.9.0] - 2026-03-21

### Ajouté

- Module Discipolat :
  - Rôle `DISCIPLE_MAKER` avec permissions `discipleship:view`, `discipleship:manage`, `discipleship:export`
  - Modèles `Discipleship` et `DiscipleshipAttendance` (schéma Prisma)
  - Champ `trackedForDiscipleship` sur les événements
  - API REST : `/api/discipleships` (CRUD), `/api/discipleships/attendance` (appel), `/api/discipleships/stats`, `/api/discipleships/export` (Excel)
  - Tableau de bord `/admin/discipleship` avec 3 onglets : Relations, Appel, Statistiques
  - Section "Discipolat" dans la sidebar, visible uniquement aux utilisateurs ayant `discipleship:view`
  - Onglet Appel : sélection d'événement (mois glissant, tri chronologique, sélection automatique sur l'événement le plus proche), présences groupées par FD, sauvegarde via PUT
  - Export Excel : feuille statistiques + feuille détail présences
- Comptes rendus d'événements :
  - Modèles `EventReport` et `EventReportSection` (schéma Prisma)
  - Flags `reportEnabled` et `statsEnabled` sur les événements
  - API REST : `/api/events/[eventId]/report` (GET/PUT)
  - Page de saisie `/admin/events/[eventId]/report` avec sauvegarde auto (debounce)
  - Statistiques par département (Accueil, Intégration, Sainte-Cène) avec champs configurables
  - Tableau de bord `/admin/reports` avec liste et onglet statistiques agrégées par mois
- Rôle `REPORTER` :
  - Permissions `events:view`, `reports:view`, `reports:edit`
  - Accès en lecture/écriture aux comptes rendus sans droits d'administration
  - Toggle d'attribution dans la page Accès & rôles
- Page Accès & rôles (`/admin/access`) :
  - Onglet "Rôles" : attribution des ministres et responsables de département (principal/adjoint via `isDeputy`)
  - Onglet "Comptes rendus" : toggle REPORTER par utilisateur
  - Remplacement du bouton "Ajouter un rôle" de la page Utilisateurs
- Réorganisation du menu sidebar :
  - 6 sections : Planning, Événements (Liste, Calendrier, Gestion, CR), Membres, Annonces, Discipolat, Configuration
  - Visibilité conditionnelle par permissions (REPORTER ne voit pas Planning)
  - BottomNav mobile adapté (Planning, Événements, Membres)
- Configuration événement : toggle "Suivre les présences pour le discipolat" sur la page de détail
- Configuration événement : toggles "Compte rendu" et "Statistiques" sur la page de détail
- Bouton "Configurer" (renommé depuis "Dep. service") sur la liste des événements admin
- Modale contextuelle par action (remplace la checkbox série globale)
- Export des comptes rendus :
  - Export PDF (jsPDF) avec stats par département, pagination et footer auteur
  - Copie message WhatsApp formaté (gras, emojis, stats typées par département)
- Filtres sur la liste des comptes rendus : mois, type d'événement, statut, recherche textuelle

### Amélioré

- Boutons Retour en haut/bas de la page CR, cohérence couleurs charte ICC
- Liaison compte utilisateur / membre STAR désormais indépendante de l'attribution de rôle
- Interface admin membres : colonne "Compte" et bouton "Lier" pour liaison directe sans flux de demande
- Page profil `/profile` : visualisation et demande de liaison STAR pour l'utilisateur connecté
- Recherche membres et utilisateurs insensible à la casse
- Guide utilisateur : ajout de l'onglet REPORTER avec matrice d'accès

### Corrigé

- Guards de permission manquants sur `/admin/audit-logs` et `/admin/churches/onboard`
- Permission `reports:edit` séparée de `reports:view` pour sécuriser l'écriture des CR

## [v0.8.1] - 2026-03-18

### Corrigé

- Motif de refus (`reviewNotes`) désormais visible par le demandeur dans "Mes annonces"
- `tsconfig.tsbuildinfo` désindexé de git (était déjà dans `.gitignore`)

### Amélioré

- ESLint configuré (`eslint-config-next`) avec script `npm run lint`
- TypeScript : activation `noUnusedLocals` + `noUnusedParameters`
- `PlanningGrid` : états d'erreur visibles (`fetchError` / `saveError`) en remplacement des `console.error` silencieux
- CI : `npm run lint` ajouté dans le pipeline
- Dépendances : `@types/node` 25.3.5 → 25.5.0, `vitest` + `@vitest/coverage-v8` 4.0.18 → 4.1.0

## [v0.8.0] - 2026-03-18

### Ajouté

- Module Annonces et Demandes de service :
  - Soumission d'annonces par les référents (`/announcements/new`) avec canaux Interne et/ou Externe
  - Génération automatique de `ServiceRequest` en transaction lors de la soumission (DIFFUSION_INTERNE, RESEAUX_SOCIAUX, VISUEL)
  - Dashboards opérationnels dédiés : Secrétariat (`/secretariat/announcements`), Production Média (`/media/requests`), Communication (`/communication/requests`)
  - Demandes de visuels standalone (`/media/requests/new`)
  - Configuration des fonctions départementales (`/admin/departments/functions`)
  - Badge de notification dans la sidebar pour les demandes en attente
  - Lien parent-enfant `parentRequestId` entre demande VISUEL et son canal (DIFFUSION_INTERNE ou RESEAUX_SOCIAUX)
  - Bouton "Annuler" dans "Mes annonces" : le demandeur peut annuler ses propres annonces

### Corrigé

- Annulation en cascade niveau 1 : annuler une `Announcement` annule automatiquement toutes ses `ServiceRequest` liées
- Annulation en cascade niveau 2 : refuser une demande `DIFFUSION_INTERNE` ou `RESEAUX_SOCIAUX` annule automatiquement la demande `VISUEL` enfant liée
- Synchronisation automatique du statut de l'annonce quand une SR parente change de statut (EN_COURS / TRAITEE / ANNULEE)

### Amélioré

- Statuts des demandes de service : badges colorés (amber/blue/green/gray) à la place de simples icônes
- Formulaire annonce : champ "Source" renommé en "Département demandeur"

## [v0.7.4] - 2026-03-07

### Corrigé

- Mobile : boutons de la page Utilisateurs qui débordaient hors du viewport (flex-wrap)
- Mobile : derniers items de la sidebar masqués par la BottomNav (padding-bottom)

### Documentation

- Ajout de la section Webcron dans docs/production.md (crontab et service externe)
- Ajout de CRON_SECRET dans .env.example et la checklist de production
- Roadmap mise à jour (guide utilisateur et déploiement production cochés)

## [v0.7.3] - 2026-03-06

### Ajouté

- Guide : zoom plein écran au clic sur les captures d'écran (modale avec fond sombre)

### Corrigé

- Tour guide : correction du bouton "Terminer" qui ne désactivait pas le tour au premier clic

## [v0.7.2] - 2026-03-06

### Amélioré

- Checkbox série : bandeau violet avec icône de récurrence pour meilleure visibilité

## [v0.7.1] - 2026-03-06

### Corrigé

- Ajout migration manquante pour la colonne `hasSeenTour` (tour guide)

## [v0.7.0] - 2026-03-06

### Ajouté

- Sidebar : départements groupés par ministère (accordéon imbriqué)
- Tour guide interactif (GuidedTour) avec étapes contextuelles
- API user preferences pour persister l'état du tour guide
- Attributs data-tour sur les composants pour le guidage

### Amélioré

- EventSelector, BottomNav, NotificationBell : améliorations responsive
- Planning route : optimisation des requêtes
- Suppression de ScreenshotPlaceholder (remplacé par images réelles)

## [v0.6.0] - 2026-03-06

### Ajouté

- Page Guide des fonctionnalités par rôle (`/guide`) avec onglets, badges d'accès et captures
- Conteneur images 16:9 (`aspect-video` + `object-contain`) sans déformation
- Descriptions d'actions pour chaque fonctionnalité du guide
- Filtrage par rôle : masquage des fonctionnalités inaccessibles
- Déploiement automatisé via SSH sur push de tag v* (workflow CD)
- Déclenchement manuel du workflow deploy
- Script de déploiement manuel `scripts/deploy.sh`

### Corrigé

- Symlink `.env` forcé lors du déploiement
- Utilisation de `prisma migrate deploy` en production

## [v0.5.0] - 2026-03-04

### Ajouté

- Modification en série des événements récurrents : modal de choix (cet événement / toute la série)
- Propagation de l'heure et du type à toute la série avec gestion du changement d'heure (DST)
- Délai de planification intelligent : sélecteur de délai (6h à 7j) avec pré-remplissage automatique
- Calcul de deadline relative par occurrence lors de la création et modification en série
- Tâches permanentes par département avec affectation par événement
- Filtres événements : recherche textuelle, filtre par mois (défaut : mois courant)
- Infrastructure de tests Vitest avec couverture V8
- Tests unitaires : permissions RBAC (10 tests), helpers API (9 tests)
- Tests API : departments (9 tests), events (8 tests), planning (8 tests)
- Mocks réutilisables pour Prisma et sessions d'authentification
- Migrations Prisma : migration baseline `0_init` (remplace `db push`)
- Scripts npm : `test`, `test:watch`, `test:coverage`, `db:migrate`, `db:migrate:deploy`, `db:reset`
- CI GitHub Actions : exécution des tests après le typecheck

### Amélioré

- Champ date des événements en datetime-local (date + heure)
- Affichage date+heure dans le tableau des événements
- Correction du décalage timezone (UTC vs heure locale) dans les formulaires
- Variants Button (edit, info) et corrections DataTable
- Documentation base de données : workflow migrations dev/production
- Roadmap : items responsive (R1-R4) marqués comme implémentés

### Corrigé

- Variable inutilisée dans cron/reminders (finding CodeQL)

## [v0.4.0] - 2026-03-03

### Ajouté

- Événements récurrents : création hebdomadaire/bi-hebdomadaire/mensuelle avec gestion par série
- Date/heure limite de planification : échéance par événement, lecture seule après échéance
- Duplication d'un planning d'un événement vers un autre
- Tâches/affectations par département (TaskPanel dans la grille planning)
- Vue calendrier des événements avec grille mensuelle interactive
- Historique des modifications (audit log) avec page admin dédiée
- Notifications in-app avec cloche, badge et polling (marquer tout comme lu)
- Notifications email (rappels J-3, J-1) via nodemailer et route cron
- Super Admin global (`isSuperAdmin` sur User) avec bypass permissions
- Onboarding nouvelle église (formulaire admin avec invitation)
- Statistiques par département : taux de présence, services par membre, graphiques recharts
- Filtre par mois dans le sélecteur d'événements
- Sélecteur de mois direct dans la vue planning mensuelle
- Export PDF du planning mensuel
- Rate limiting sur les API routes
- Logs structurés avec pino
- PWA : manifest, service worker (network-first), installation mobile
- Responsive mobile R3 : vues métier adaptées (cartes, grilles)

### Amélioré

- Calendrier et date pickers harmonisés avec le thème ICC (accent-color violet, en-têtes colorés, hover/today)
- Inputs date/month/select alignés sur le design system (border-2, rounded-lg, shadow-sm, focus ring violet)
- Navigation mois avec icônes SVG et boutons tactiles (min 44x44px)
- Sidebar : section Événements avec sous-menu Liste + Calendrier

## [v0.3.1] - 2026-03-01

### Ajouté

- Changement de ministère lors de l'édition d'un département (Select ministère + validation scope)

## [v0.3.0] - 2026-03-01

### Ajouté

- Permission `departments:manage` pour le rôle MINISTER (gestion des départements de son ministère)
- Chargement du `ministryId` dans la session utilisateur
- Scoping des départements par ministère pour les Ministres (page admin + API)
- Vérification du scope ministère dans les API departments (POST/PATCH/PUT/DELETE)
- Icône bulle de discussion pour le statut EN_SERVICE_DEBRIEF

### Corrigé

- Contraste EN_SERVICE_DEBRIEF : couleur jaune remplacée par violet (PlanningGrid, MonthlyPlanningView, StarView)
- Couleurs jaunes remplacées par violet dans la vue STAR événement
- Overflow de la liste départements sur la page admin événement (scroll vertical)

## [v0.2.1] - 2026-03-01

### Corrigé

- Bus error au build : import dynamique de `cookies` dans `getCurrentChurchId()` (évite le chargement de `next/headers` au niveau module)

## [v0.2.0] - 2026-03-01

### Ajouté

- Bootstrap SUPER_ADMIN : les utilisateurs déclarés dans `SUPER_ADMIN_EMAILS` peuvent créer la première église sans rôle préalable
- Auto-promotion : création d'une église assigne automatiquement tous les SUPER_ADMIN existants
- Sélecteur d'église : dropdown dans le header pour les utilisateurs multi-églises, persistance via cookie
- Helper `isSuperAdmin()` pour vérifier le statut Super Admin par email
- Helper `getCurrentChurchId()` pour résoudre l'église active (cookie avec fallback)
- Endpoint POST `/api/current-church` pour changer d'église courante
- Composant `ChurchSwitcher` (dropdown masqué si une seule église)
- Auto-génération du slug d'église depuis le nom (avec possibilité de modification manuelle)

## [v0.1.0] - 2026-02-28

### Ajouté

- Schéma Prisma complet : églises, utilisateurs, rôles, ministères, départements, membres, événements, plannings
- Authentification Google OAuth via NextAuth v5
- Système RBAC avec 5 rôles et matrice de permissions
- Dashboard de planning avec grille interactive et auto-save
- Vue mensuelle du planning
- Sidebar unifiée avec 3 sections accordion (Départements, Événements, Administration)
- Interface admin : CRUD églises, utilisateurs, ministères, départements, membres, événements
- API REST complète avec validation Zod
- Middleware de protection des routes
- Seed de données ICC Rennes (7 ministères, départements, membres, événements)
- Architecture multi-tenant par église
- Composants UI : Button, Input, Select, Modal, DataTable, BulkActionBar
- Export PDF des plannings
- Page événements avec sélecteur et vue par département
- Auto-promotion Super Admin par email (`SUPER_ADMIN_EMAILS`)
- Affectation ministère/départements aux rôles MINISTER et DEPARTMENT_HEAD depuis l'interface admin
- Composant `CheckboxGroup` pour la sélection multiple de départements
- Endpoint PATCH `/api/users/[userId]/roles` pour modifier les affectations
- Badges enrichis affichant le ministère/départements associés avec bouton d'édition
- Helper `requireAnyPermission()` pour vérifier plusieurs permissions
- Helper `getUserDepartmentScope()` pour le filtrage par département selon le rôle
- Permission `members:manage` accordée aux rôles MINISTER et DEPARTMENT_HEAD
- CI GitHub Actions : typecheck et validation de version sur tags
- Dependabot : mises à jour hebdomadaires npm et GitHub Actions (minor/patch uniquement)
- Affichage de la version dans le footer (depuis `package.json`)
- Script `typecheck` dans package.json
- Guide de déploiement production (Debian, Traefik, systemd)

### Corrigé

- Cascade de suppression des rôles avec départements associés (FK constraint MySQL)
- Permissions des liens sidebar admin (alignées avec les permissions des pages)

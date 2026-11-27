# Spec — Campagnes de collecte : évolutions post-recette

- **Numéro** : 091
- **Statut** : Validée
- **Créée le** : 2026-11-27
- **Branche suggérée** : `feat/campagnes-evolutions` (PR vers `feat/campagnes-collecte`)
- **Prolonge** : [spec 090](../090-campagnes-collecte/spec.md)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.

## Contexte & problème

Le module de campagnes de collecte (spec 090) est en recette. La campagne réelle « Bilan annuel
F9 2026 » y est créée en brouillon. Les premiers tests ont validé la création, l'import, le
pilotage et le contrôle des répondants à l'ouverture.

Avant le lancement du F9 (échéance interne le 4 décembre), les gestionnaires ont besoin de plus
d'autonomie :
- **communiquer** : la collecte se pilote surtout par WhatsApp, et chaque message est aujourd'hui
  écrit à la main ;
- **corriger le cycle de vie** : rouvrir une contribution soumise, changer un répondant ou une
  échéance ;
- **voir** un questionnaire comme le répondant le verra, avant l'ouverture ;
- **repérer** ce qui reste à rechercher.

Ensuite, réutiliser et créer des campagnes sans manipuler de JSON ni passer par un assistant IA.

Principe à préserver : l'éditeur graphique, l'import JSON et l'assistant IA produisent **un seul
et même modèle de campagne**. Ce modèle est validé, protégé et révisé par les mêmes règles, et
collecté par le moteur existant.

## Audit de l'existant (2026-11-27)

| Évolution | État | Déjà en place |
|---|---|---|
| EVOL-01 Message de demande | Absente | Lien direct d'une contribution, lien personnel (régénération seulement), échéance par destinataire |
| EVOL-02 Rouvrir une contribution soumise | Partielle | « Demander une correction » (motif obligatoire, statut « Correction demandée ») |
| EVOL-03 Aperçu répondant | Absente | Écran de saisie complet (sections, qualificatifs, groupes, fichiers) |
| EVOL-04 Communication et relances | Partielle | Relance par notification ou email (une fois par 24 h), relance automatique J-2, calcul de l'avancement |
| EVOL-05 Répondants et échéances après ouverture | Partielle | Ajout et retrait d'un répondant, personne sans compte, nouveau lien. Manquent : remplacer, changer l'échéance, empêcher le retrait du dernier répondant |
| EVOL-06 À rechercher | Partielle | Comptes globaux (estimations, à rechercher, manquantes, fichiers), contrôles croisés. Manquent : filtres, questions concernées, « exploitable » |
| EVOL-07 Dupliquer | Absente | Import idempotent (création en brouillon) |
| EVOL-08 Exporter la définition | Absente | Définitions stockées par questionnaire, règles stockées |
| EVOL-09 Contrat d'import au MCP | Absente | Schéma de validation unique, d'où le JSON Schema peut être produit |
| EVOL-10 Pilotage MCP enrichi | Partielle | Liste, avancement, import et changement d'état (aperçu puis confirmation) |
| EVOL-11 Création graphique | Absente | Import (aperçu, blocages, révisions), paramètres, gestionnaires, répondants |

## Utilisateurs concernés

- **Gestionnaire de campagne** (Admin avec `campaigns:manage` ou gestionnaire désigné) : il
  communique, rouvre, prévisualise, édite, exporte et duplique les campagnes qu'il gère.
- **Admin, Super Admin** (`campaigns:manage`) : crée les campagnes (vierges, importées ou
  dupliquées).
- **Répondant**, avec ou sans compte : il reçoit les messages, reprend une contribution rouverte
  et la soumet de nouveau.
- **Assistant IA d'un gestionnaire (MCP)** : il lit le contrat d'import et la structure non
  sensible, exporte une définition, rouvre une contribution (aperçu puis confirmation).

## Comportement attendu

### Communication (EVOL-01, EVOL-04)

1. Depuis la campagne, le gestionnaire ouvre « Communication ». Il choisit un type de message :
   - demande initiale ;
   - point d'avancement ;
   - relance collective ;
   - relance individuelle ;
   - rappel d'échéance dépassée ;
   - demande de nouvelle soumission.
2. Il choisit les contributions concernées : par statut, par retard, toutes celles restant à
   transmettre, ou une contribution précise. Il règle aussi le niveau de détail, l'affichage des
   services ayant répondu ou restant à répondre, et l'inclusion des destinataires confidentiels
   (exclus par défaut).
3. Le message est composé à partir de l'**état réel** de la campagne au moment de l'ouverture
   de la fenêtre :
   - nom de l'église, campagne, destinataire ;
   - échéance applicable ;
   - date du point ;
   - compteurs par statut et taux calculés **par contribution** (une contribution = un
     destinataire d'un questionnaire).
4. Le gestionnaire voit l'aperçu, modifie librement le texte, puis le copie en un clic. Le
   format est compatible WhatsApp (`*gras*`, `_italique_`, sauts de ligne, liens en clair).
5. Le message individuel d'une contribution contient son lien direct :
   - pour les comptes, l'adresse de la contribution dans Koinonia ;
   - pour une personne sans compte, son lien personnel actif. Ce message est strictement
     individuel : un message par personne.
   - Un raccourci « Ouvrir » mène au questionnaire.
6. Chaque modèle a un texte par défaut, personnalisable au niveau de la campagne.
7. Générer un message **n'envoie rien** : aucune notification, aucun statut changé, rien n'est
   compté comme relance envoyée.

### Rouvrir une contribution (EVOL-02)

1. Sur une contribution soumise d'une campagne ouverte, le gestionnaire choisit « Rouvrir ». Il
   confirme, avec un motif facultatif.
2. La contribution repasse « En cours », avec réponses et fichiers intacts. Le répondant est
   prévenu, l'avancement est recalculé et l'opération est tracée. Une nouvelle soumission est
   nécessaire.
3. Une contribution validée ne se rouvre pas directement. « Annuler la validation » (motif
   facultatif) la ramène à « Soumis » et retire la mention de la Pasteure. On peut ensuite la
   rouvrir. « Demander une correction » reste disponible tel quel.

### Aperçu répondant (EVOL-03)

1. Dès le brouillon, le gestionnaire ouvre l'aperçu d'un questionnaire. Il le voit exactement
   comme le répondant : sections, consignes, exemples, qualificatifs, obligatoires, groupes et
   demandes de fichiers.
2. Il peut basculer entre l'affichage pleine largeur et un format téléphone.
3. L'aperçu n'enregistre rien. On peut y essayer la saisie, rien n'est conservé.
4. L'éditeur graphique utilise le même aperçu sur la version en cours d'édition.

### Répondants et échéances (EVOL-05)

1. Sans réimport, le gestionnaire peut :
   - ajouter ou retirer un répondant, avec ou sans compte ;
   - **remplacer** un répondant par un autre en un seul geste ;
   - générer un nouveau lien personnel ;
   - consulter le lien personnel actif, réservé aux gestionnaires ;
   - modifier l'échéance d'une contribution.
2. Réponses et fichiers appartiennent à la contribution, pas au répondant. Le remplaçant reprend
   donc la contribution là où elle en était. Le répondant retiré perd tout accès immédiatement,
   y compris par son lien personnel.
3. Dans une campagne ouverte, retirer le **dernier** répondant valide d'un destinataire est
   refusé. Le message invite à utiliser « Remplacer ».

### Suivi de ce qui reste à rechercher (EVOL-06)

1. Le suivi permet de filtrer les contributions selon :
   - réponses « À rechercher » ;
   - estimations ;
   - obligatoires manquants ;
   - contrôles non respectés ;
   - demandes de fichier non satisfaites.
2. Chaque contribution affiche les questions concernées, par libellé, sans ouvrir le
   questionnaire.
3. Le suivi distingue « Soumis » de « **Exploitable** ». Une contribution est exploitable si elle
   est soumise ou validée, sans obligatoire manquant, sans « à rechercher », sans demande de
   fichier en attente et sans contrôle local non respecté. Les estimations restent permises.
4. La règle est générique : rien de propre au F9.

### Dupliquer, exporter, importer (EVOL-07, EVOL-08)

1. Le gestionnaire télécharge la définition d'une campagne au format `koinonia.campaign` v1 :
   - structure, règles, confidentialité, échéances et modèles de messages ;
   - jamais de réponse, fichier, répondant, lien ou secret.
2. Ce fichier se réimporte tel quel sans aucune perte. L'aperçu annonce « inchangé ». Modifié,
   il suit les règles d'import existantes : idempotence et blocages.
3. « Dupliquer » crée une nouvelle campagne en brouillon :
   - même structure, règles, confidentialité et modèles ;
   - nouveau titre, nouvelle clé, nouvelles dates ;
   - destinataires conservés ou non, au choix ;
   - jamais de réponses, fichiers, liens, validations ni historique.

### Créer et éditer graphiquement (EVOL-11)

1. Une campagne se crée de trois façons : vierge, par import ou par duplication. Elle est
   toujours en brouillon.
2. L'éditeur permet :
   - de modifier les paramètres généraux ;
   - d'ajouter, modifier, dupliquer, supprimer et réordonner questionnaires, sections et
     questions ;
   - de déplacer une question d'une section à l'autre ;
   - de régler tous les types de questions existants et leurs options : obligatoire, aide,
     exemples, bornes, décimales, unité, qualificatifs, choix et choix exclusifs, code de
     restitution, champ interne, groupes répétables, demandes de fichier ;
   - de gérer les destinataires et leurs échéances ;
   - de gérer les contrôles de cohérence simples : question ou valeur, opérateur, question ou
     valeur, message, et « si … alors … ». Les règles complexes restent éditables en JSON.
3. Le gestionnaire ne manipule aucun identifiant technique : ils sont générés, stables et jamais
   réutilisés.
4. Enregistrer passe par le **même aperçu et les mêmes blocages** que l'import. Une modification
   qui ferait perdre des réponses est refusée et expliquée. Les révisions s'incrémentent comme à
   l'import.
5. Une synthèse avant ouverture vérifie :
   - questionnaires, questions et définition valide ;
   - échéances ;
   - destinataires, et répondant valide pour chacun ;
   - contrôles ;
   - questionnaires confidentiels.
6. On peut aller et revenir sans perte : créer graphiquement, exporter, modifier ailleurs,
   réimporter, reprendre dans l'éditeur.

### Assistant IA (EVOL-09, EVOL-10)

1. Un outil en lecture donne le contrat d'import : version, JSON Schema produit depuis la
   validation de l'application, types, qualificatifs, règles, contraintes complémentaires et
   exemple minimal valide.
2. Un outil donne la structure non sensible d'une campagne : questionnaires, destinataires,
   catalogue des questions des questionnaires **non confidentiels**. Un questionnaire
   confidentiel n'y montre que son titre et son état.
3. Un outil exporte la définition **sans questionnaire confidentiel**. Un import fait ensuite
   par l'assistant conserve d'office ces questionnaires et les contrôles qui les lisent :
   l'assistant ne peut ni les voir ni les supprimer.
4. Rouvrir une contribution passe par un aperçu puis une confirmation.
5. Jamais exposé :
   - réponses ;
   - noms et contenus de fichiers ;
   - noms et emails de répondants ;
   - liens personnels ;
   - messages contenant un lien personnel.

## Critères d'acceptation

- [ ] Le gestionnaire génère et copie un message qui contient le bon lien direct et la bonne
  échéance ; rien n'est envoyé ni modifié.
- [ ] Un message collectif ne contient aucun lien personnel, aucune valeur, aucun email. Les
  destinataires confidentiels en sont exclus par défaut, et le périmètre est alors précisé.
- [ ] Point d'avancement : compteurs et taux exacts, calculés par contribution. Après une
  soumission ou une réouverture, un nouveau message reflète l'état à jour.
- [ ] Une contribution soumise se rouvre sans perte : elle repasse « En cours » et le répondant
  est prévenu. Les autres contributions ne changent pas. Le répondant reprend la saisie et la
  soumet de nouveau.
- [ ] Une contribution validée ne se rouvre qu'après « Annuler la validation ».
- [ ] L'aperçu d'un questionnaire est disponible en brouillon et n'enregistre rien.
- [ ] Remplacer un répondant préserve réponses et fichiers et coupe l'accès de l'ancien.
  Retirer le dernier répondant d'un destinataire d'une campagne ouverte est refusé.
- [ ] L'échéance d'une contribution se modifie sans réimport.
- [ ] Les contributions se filtrent selon « à rechercher », estimations, manquants, contrôles et
  fichiers. Les questions concernées sont listées, et « Exploitable » est distingué de « Soumis ».
- [ ] Export puis réimport du même fichier : « inchangé », aucune perte.
- [ ] La duplication crée un brouillon sans réponse, fichier, lien ni validation.
- [ ] Un gestionnaire non technique crée graphiquement une campagne complète, la prévisualise,
  l'exporte, l'ouvre et collecte. La campagne compte trois questionnaires, plusieurs sections,
  un groupe, une demande de fichier, plusieurs destinataires, une échéance propre, un
  questionnaire confidentiel et un contrôle.
- [ ] L'éditeur refuse une modification qui ferait perdre des réponses, avec le même message que
  l'import.
- [ ] Outils MCP : contrat d'import, structure, export et réouverture fonctionnent, et aucun
  ne laisse sortir une réponse, un fichier, une personne, un lien ou un questionnaire
  confidentiel.
- [ ] Les fonctions existantes restent opérationnelles : la suite de tests complète passe.

## Hors périmètre

- Aucun envoi WhatsApp et aucune intégration d'API de messagerie.
- Aucun éditeur graphique des règles complexes (sommes, chaînes, imbrications) : elles restent
  en JSON.
- Aucun historique des versions consultable au-delà des révisions existantes.
- Aucune nouvelle permission.

## Questions ouvertes

- Aucune.

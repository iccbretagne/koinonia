# Spec — Campagnes de collecte

- **Numéro** : 090
- **Statut** : En cours
- **Créée le** : 2026-11-26
- **Branche** : `feat/campagnes-collecte`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.

## Contexte & problème

ICC Rennes doit répondre au bilan annuel F9 2026 (79 indicateurs, 20 blocs) demandé par la
Coordination des Églises. Les chiffres sont détenus par une quinzaine de services (Secrétariat,
Intégration, PVS, Mission, Formation, Comptabilité, Pasteure…). La collecte se fait aujourd'hui
par messages et tableurs épars : impossible de savoir qui a répondu, ce qui manque, ce qui est
estimé, ni de transmettre en sécurité les exports nominatifs nécessaires aux rapprochements.

Échéances : réponses internes au **4 décembre 2026**, transmission officielle au **10 décembre**.

Le besoin est générique : bilans de ministère, recensements, enquêtes internes reprendront le même
outil. Le F9 est le premier cas d'usage, pas un module à part.

## Utilisateurs concernés

- **Admin / Super Admin de l'église** (`campaigns:manage`) : créent une campagne (import d'une
  définition), désignent les gestionnaires.
- **Gestionnaire de campagne** (donnée par campagne, ex. la Coordination générale) : pilote sa
  campagne — ouvre, clôture, ajoute des répondants, relance, demande des corrections, valide,
  exporte, télécharge les fichiers, ajoute ou retire d'autres gestionnaires. Voit **tout** le
  contenu de sa campagne, questionnaires confidentiels compris.
- **Répondant** : une personne désignée pour un questionnaire. Avec un compte Koinonia de
  l'église (cas normal), ou **sans compte**, par un lien personnel (exception).

## Comportement attendu

### Campagne

1. Une campagne a un titre, une description, une période de référence (début, date d'arrêté), une
   échéance et une durée de conservation des fichiers (30 jours après la clôture par défaut,
   paramétrable).
2. États : **Brouillon** (préparation, invisible des répondants), **Ouverte** (saisie possible),
   **Clôturée** (lecture seule ; peut être rouverte par un gestionnaire).
3. Une campagne contient plusieurs **questionnaires** ; chaque questionnaire est affecté à un ou
   plusieurs **destinataires** (ex. « Intégration »), chacun avec ses répondants nommés. Pour le
   F9 : un questionnaire par destinataire.
4. Création et mise à jour par **import d'une définition structurée** (fichier JSON versionné) :
   aperçu de ce qui sera créé, modifié ou inchangé, des répondants retrouvés ou non, et des
   modifications refusées ; puis confirmation. Réimporter la même définition ne crée **aucun
   doublon**. Une modification qui ferait perdre des réponses déjà saisies (question supprimée,
   type changé, choix retiré) est **refusée**, jamais appliquée en silence.

### Questionnaire

5. Sections (titre, consignes), questions (libellé court, aide, exemples non exhaustifs),
   obligatoires ou facultatives. Types : nombre entier, nombre décimal (dont pourcentage), texte
   court, texte long, oui/non, choix unique, choix multiple (avec choix exclusif, ex. « Aucun »),
   date, groupe répétable (avec « Aucune ligne »), demande de fichier.
6. Chaque question a un **code stable** (pour le F9 : le code officiel), jamais affiché au
   répondant, repris dans les exports.
7. Chaque réponse peut être qualifiée : **exacte** (par défaut), **estimation** (précision
   obligatoire), **à rechercher** (note obligatoire), **sans objet** ou **NSP** — ces deux
   derniers seulement là où la définition les autorise. **Zéro est une réponse** ; une case vide
   n'est jamais transformée en zéro.
8. Une **demande de fichier** se répond par un état : « chiffre croisé disponible », « fichier
   transmis » (au moins un fichier joint) ou « à rechercher ».
9. Des **contrôles de cohérence** déclarés dans la définition (ex. E3 ≥ E4 ≥ E5 ≥ E6, L4 = Non ⇒
   L5 = 0) s'affichent comme **alertes non bloquantes** pendant la saisie lorsque les valeurs
   concernées sont dans le même questionnaire ; les contrôles entre questionnaires s'affichent au
   pilotage.

### Répondant

10. Retrouve ses questionnaires dans Koinonia (« Collectes », carte sur l'Accueil) ou par le lien
    reçu à l'ouverture. Interface pensée pour le téléphone.
11. Saisie **enregistrée automatiquement** ; reprise à tout moment, à plusieurs le cas échéant.
12. **Soumet** quand tout est renseigné (une réponse « à rechercher » compte comme renseignée mais
    reste signalée). Après soumission : lecture seule, statut visible.
13. Dépose, remplace ou retire des fichiers (XLSX, CSV, PDF ; 10 Mo) tant que le questionnaire
    n'est pas soumis.
14. Sans compte : un lien personnel, révocable, ouvre **son seul questionnaire** (mêmes gestes).

### Pilotage (gestionnaire)

15. Tableau d'avancement : par destinataire, état (Non commencé, En cours, Soumis, Correction
    demandée, Validé), réponses manquantes, estimations et « à rechercher », fichiers attendus et
    reçus, échéance, taux global ; filtres par état et destinataire.
16. **Demander une correction** (motif) : le questionnaire redevient modifiable, les répondants
    sont prévenus. **Valider** un questionnaire soumis, avec une case « Validé par la Pasteure »
    qui consigne la validation pastorale.
17. **Relancer** les répondants d'un questionnaire non soumis (au plus une fois par 24 h) ; relance
    automatique 2 jours avant l'échéance.
18. **Exports** Excel et CSV : réponses en format long (une ligne par code et destinataire,
    nombres restés nombres, qualificatif et précision), lignes des groupes répétables, états,
    contrôles, métadonnées des fichiers ; global ou par questionnaire. Téléchargement des
    fichiers un par un.
19. Gestion des gestionnaires de la campagne : par l'Admin de l'église ou un gestionnaire.

### Notifications

20. Ouverture (ou ajout d'un répondant à une campagne ouverte) : les répondants reçoivent le lien.
    Correction demandée : les répondants. Soumission : les gestionnaires. Domaine « Collectes ».
    Aucun chiffre dans une notification.

### Assistants IA (MCP)

21. Un gestionnaire peut, depuis son assistant : lister ses campagnes, voir l'avancement et les
    contributions manquantes, les métadonnées des fichiers reçus ; prévisualiser puis confirmer
    l'import d'une définition, ouvrir ou clôturer une campagne. Jamais le contenu d'un fichier.

## Sécurité & confidentialité

- Une campagne appartient à une église ; tout accès d'une autre église répond « introuvable ».
- Les droits sont vérifiés côté serveur à chaque appel : un répondant ne voit que les
  questionnaires qui lui sont affectés ; un lien sans compte n'ouvre qu'un questionnaire, cesse de
  fonctionner à la clôture ou à sa révocation.
- Fichiers en stockage privé, jamais d'adresse publique permanente, type vérifié sur le contenu,
  macros refusées, aucune lecture de leur contenu, aucun effet sur les fiches membres ; supprimés
  automatiquement après la durée de conservation.
- Journal des opérations sensibles (import, ouverture, clôture, soumission, correction,
  validation, dépôt, téléchargement, export), sans valeur ni nom.

## Hors périmètre

Éditeur graphique de questionnaires, analyse du contenu des fichiers, rapprochement automatique
des personnes, intégration au formulaire officiel, BI.

## Critères d'acceptation

1. Import d'une définition F9 : 14 questionnaires, 79 codes officiels couverts ; réimport identique
   = aucun changement.
2. Un répondant saisit 0, une estimation avec précision, enregistre, revient, retrouve sa saisie.
3. Dépôt puis remplacement d'un XLSX ; un fichier renommé (ex. exécutable en `.xlsx`) est refusé.
4. Soumission refusée tant qu'une question obligatoire est vide ; acceptée ensuite.
5. Correction demandée → modifiable → nouvelle soumission → validée (avec case Pasteure).
6. Export XLSX : valeurs numériques en nombres, codes, destinataires, qualificatifs.
7. Accès refusé : répondant d'un autre questionnaire, compte d'une autre église, lien révoqué.
8. Aucune régression : typecheck, lint, frontières, tests existants.

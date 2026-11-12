# Spec — Connecter un assistant IA à Koinonia (serveur MCP)

- **Numéro** : 081
- **Statut** : Implémentée (lots 1 et 2) — lot 3 en spécification
- **Créée le** : 2026-11-11
- **Branche suggérée** : `feat/serveur-mcp`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.
> « MCP » désigne ici le protocole ouvert par lequel les assistants IA du marché (Claude,
> ChatGPT, outils de développement) se connectent à un service ; c'est le besoin exprimé, pas un
> choix d'implémentation.

## Contexte & problème

De plus en plus de serviteurs utilisent un assistant IA au quotidien. Pour lui faire préparer un
message d'équipe, un récapitulatif de la semaine ou une relance, ils copient à la main des
informations de Koinonia (planning, événements, demandes) dans la conversation — avec des
erreurs, des oublis et des données qui circulent sans contrôle.

L'assistant intégré à Koinonia (spec 075) répond aux questions sur l'application, mais ne
remplace pas l'assistant personnel que chacun utilise déjà.

Cette fonctionnalité permet à **chaque compte** de connecter son assistant IA à Koinonia, en
quelques clics, pour qu'il lise **ce que ce compte voit déjà dans l'application** — ni plus, ni
moins — et, dans un second lot, effectue quelques actions simples après confirmation.

## Utilisateurs concernés

| Qui | Ce qu'il peut faire |
|---|---|
| **Tout compte connecté** (tous rôles, STAR compris) | Connecter un assistant IA à son compte pour **une** église ; l'assistant lit ce que ce compte voit dans cette église ; voir et révoquer ses connexions |
| **Super Admin** | Activer ou couper la fonctionnalité pour toute l'instance ; voir l'activité globale (nombre de connexions, d'appels), sans contenu |
| **Admin d'église** | Activer ou couper la fonctionnalité pour son église (**coupée par défaut**) ; voir la **liste des comptes connectés** de son église (compte, assistant, date, dernière utilisation) et révoquer une connexion, sans jamais voir le contenu des échanges |

## Comportement attendu

### Scénario principal — connecter son assistant

1. Une responsable de département ouvre son assistant IA et ajoute Koinonia comme connecteur,
   à partir de l'adresse indiquée dans « Mon profil » (avec un mode d'emploi court par
   assistant courant).
2. L'assistant l'envoie vers Koinonia : elle se connecte comme d'habitude (compte Google).
3. Un écran Koinonia lui demande de **choisir l'église** (si elle en a plusieurs) et lui montre
   en clair ce que l'assistant pourra faire : « Lire votre planning, les événements, vos
   demandes… — uniquement ce que vous voyez déjà ». Elle **autorise**.
4. De retour dans son assistant, elle demande : « Qui est de service dimanche dans mes
   départements ? ». L'assistant interroge Koinonia et répond avec le planning de ses
   départements — exactement ce qu'elle verrait à l'écran.
5. Dans « Mon profil », une section **Assistants connectés** liste la connexion (nom de
   l'assistant, église, date, dernière utilisation) avec un bouton **Révoquer**.

### Ce que l'assistant peut lire (premier lot, lecture seule)

Toujours dans la limite des droits du compte, dans l'église choisie :

- **Mon planning** : mes services à venir, mes absences déclarées.
- **Planning des départements** dont le compte est responsable (ou Ministre).
- **Événements** à venir de l'église, et événements d'équipe le concernant.
- **Mes demandes** (financières, de visuel, d'annonce…) et leur état.
- **Demandes à traiter**, si le compte traite une file (secrétariat, comptabilité, médias…).
- **Comptes rendus et statistiques**, si le compte y a accès.
- **Bibliothèque audio** : cultes publiés (titres, dates, orateurs).
- **Guide de l'application** : les fiches de l'assistant intégré, filtrées par rôle.

### Ce que l'assistant ne lit jamais

- Le **suivi pastoral** (rendez-vous, accompagnements, nouveaux convertis) et les dossiers
  d'accueil, même si le compte y a accès dans l'application.
- Les **coordonnées bancaires** (IBAN, comptes de trésorerie), même pour la comptabilité.
- Les **coordonnées personnelles d'autrui** (téléphone, email, adresse).
- Les données d'une **autre église** que celle choisie à la connexion.

### Second lot — actions avec confirmation

Trois actions : **déclarer une absence**, **répondre à un service** (disponible ou
indisponible), **créer une demande en brouillon** (que la personne complète et envoie ensuite
dans l'application). Toute action est
**présentée puis confirmée** par la personne dans son assistant avant d'être faite, et
apparaît dans l'historique comme faite « via l'assistant IA ».

### Troisième lot — actions des responsables (à valider)

Des tâches répétitives, aujourd'hui faites écran par écran, que la personne confie à son
assistant. Même principe qu'au second lot : **toujours un aperçu, puis la confirmation de la
personne**, journalisé « via l'assistant IA », et **jamais au-delà des droits du compte** dans
l'application (périmètre de départements compris). Seulement si la case des actions a été
cochée à la connexion.

| Action | Pour qui (comme dans l'application) | Ce que l'aperçu montre |
|---|---|---|
| **Créer des événements** — un seul, ou une série (« tous les dimanches de décembre à 10 h ») avec leurs départements en service | Gestion des événements (Admin, Secrétaire) | La liste des dates, l'heure, le type, les départements ; les doublons possibles avec des événements existants |
| **Remplir le planning** d'un département pour un événement : l'assistant propose les STAR à mettre en service | Responsable du département, Ministre | Qui serait en service, et pourquoi (disponible, si besoin) ; les STAR absents ou indisponibles écartés ; ce qui remplace le planning déjà saisi |
| **Recopier un planning** d'un événement précédent sur un nouvel événement | Responsable du département, Ministre | Ce qui est recopié, département par département ; les STAR devenus absents ou indisponibles signalés |
| **Relancer les sans-réponse** à la demande de disponibilité du mois | Responsable du département, Ministre | Le nombre de STAR relancés, par département ; jamais leurs coordonnées |
| **Publier les consignes** d'un département pour un événement (« arrivée 8 h 30, tenue noire ») | Responsable du département, Ministre | Le texte, l'événement, le département ; la consigne existante remplacée |
| **Réserver une salle** | Réservation de salles | La salle, le créneau, les conflits éventuels |
| **Remplir le compte rendu** d'un événement : orateur, titre du message, statistiques et remarques par département, observations, décisions | Comptes rendus (Admin, Secrétaire, Reporter) | Chaque rubrique saisie, et ce qu'elle remplace si le compte rendu existe déjà |

Cas limites propres à ce lot :

- **Droits changés entre l'aperçu et la confirmation** (département retiré, rôle perdu) : la
  confirmation est refusée, rien n'est fait.
- **Données changées entre-temps** (planning modifié par quelqu'un d'autre, salle réservée,
  événement supprimé) : la confirmation est refusée avec la raison ; l'assistant refait l'aperçu.
- **Série d'événements** : bornée (au plus 12 événements par confirmation) ; aucun événement
  créé si l'un d'eux est invalide.
- **Notifications** : les mêmes que lorsque la personne fait l'action dans l'application (STAR
  mis en service, responsables, organisateurs) — ni plus, ni moins.

### Scénarios alternatifs / cas limites

- **Le rôle du compte change** (perte d'un département, retrait d'un rôle) : l'assistant voit
  immédiatement le nouveau périmètre, sans reconnexion.
- **Le compte perd tout rôle dans l'église choisie**, ou est désactivé : la connexion cesse de
  fonctionner ; l'assistant reçoit un refus.
- **Révocation** dans « Mon profil » : effet immédiat ; l'assistant doit refaire la connexion.
- **Inactivité** : une connexion inutilisée pendant **90 jours** expire d'elle-même.
- **Fonction coupée** par le Super Admin ou l'Admin d'église : toutes les connexions concernées
  cessent de fonctionner ; la section « Assistants connectés » l'indique. Réactiver la
  fonction ne réactive pas les connexions révoquées.
- **Utilisateur de plusieurs églises** : une connexion par église ; il peut en avoir plusieurs.
- **Trop de requêtes** : au-delà d'une limite par compte, l'assistant reçoit un refus
  temporaire explicite.
- **Question hors droits** : l'assistant reçoit la même réponse que si la donnée n'existait
  pas, sans indice sur son existence.
- **Déconnexion de Koinonia** dans le navigateur : n'affecte pas les connexions d'assistant
  (elles se révoquent explicitement).

## Critères d'acceptation

- [ ] Un compte de n'importe quel rôle connecte un assistant IA courant à Koinonia en se
      connectant avec son compte habituel et en autorisant, sans copier de code ni de clé.
- [ ] Une connexion est liée à un compte et à une seule église, choisie à l'autorisation.
- [ ] Pour chaque donnée lue, l'assistant obtient exactement ce que le compte verrait à l'écran
      dans cette église — vérifié pour au moins un STAR, un Resp. département, une Secrétaire
      et un Comptable.
- [ ] Le suivi pastoral, les coordonnées bancaires et les coordonnées personnelles d'autrui ne
      sont jamais renvoyés, quel que soit le rôle.
- [ ] Une connexion révoquée, expirée, ou dont la fonction est coupée cesse de fonctionner
      immédiatement.
- [ ] « Mon profil » liste les assistants connectés et permet de révoquer chacun.
- [ ] Le Super Admin coupe la fonction pour l'instance ; l'Admin d'église l'active (coupée par
      défaut) ou la coupe pour son église.
- [ ] L'Admin d'église voit la liste des comptes connectés de son église et peut révoquer une
      connexion.
- [ ] Une connexion inutilisée 90 jours expire.
- [ ] Au second lot, chacune des trois actions est présentée puis confirmée avant d'être faite,
      et journalisée « via l'assistant IA ».
- [ ] Chaque appel de l'assistant est journalisé (compte, église, type de donnée, date), sans
      le contenu de la conversation.
- [ ] Le nombre d'appels par compte est limité.
- [ ] Le premier lot ne permet aucune modification.
- [ ] Au troisième lot, chacune des sept actions n'est proposée qu'aux comptes qui peuvent la
      faire dans l'application, dans leur périmètre, et n'est faite qu'après aperçu et confirmation.
- [ ] Une confirmation dont les droits ou les données ont changé depuis l'aperçu est refusée sans
      rien faire.

## Hors périmètre

- Un assistant IA fourni ou payé par l'église (chacun utilise le sien).
- L'accès sans compte Koinonia, ou par une clé partagée entre plusieurs personnes.
- La lecture de fichiers (photos, visuels, audio) : seules les informations sont lues.
- Toute autre action que les trois du second lot et les sept du troisième (pas de remplacement
  automatique d'un STAR désisté, pas de suppression d'événement, pas d'action financière).
- Toute modification de l'assistant intégré (spec 075).
- Les intégrations automatiques sans personne derrière (robots, synchronisations).

## Questions ouvertes

Tranchées le 2026-11-11 :

- Expiration après **90 jours** d'inactivité.
- Second lot : déclarer une absence, répondre à un service, créer une demande en brouillon.
- L'Admin d'église voit la **liste des comptes connectés** (et peut révoquer).
- Activation par église : **coupée par défaut**, activée par l'Admin d'église — choix par
  prudence, à confirmer (question laissée sans réponse).

Ajoutées le 2026-11-12 (lot 3) : actions retenues par le porteur — créer des événements, remplir
et recopier un planning, relancer les sans-réponse, publier des consignes, réserver une salle,
remplir le compte rendu. Le remplacement d'un STAR désisté n'est pas retenu.

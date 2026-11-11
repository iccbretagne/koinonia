# Spec — Connecter un assistant IA à Koinonia (serveur MCP)

- **Numéro** : 081
- **Statut** : Implémentée (lot 1) — lot 2 à faire
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

## Hors périmètre

- Un assistant IA fourni ou payé par l'église (chacun utilise le sien).
- L'accès sans compte Koinonia, ou par une clé partagée entre plusieurs personnes.
- La lecture de fichiers (photos, visuels, audio) : seules les informations sont lues.
- Toute autre action que les trois du second lot.
- Toute modification de l'assistant intégré (spec 075).
- Les intégrations automatiques sans personne derrière (robots, synchronisations).

## Questions ouvertes

Tranchées le 2026-11-11 :

- Expiration après **90 jours** d'inactivité.
- Second lot : déclarer une absence, répondre à un service, créer une demande en brouillon.
- L'Admin d'église voit la **liste des comptes connectés** (et peut révoquer).
- Activation par église : **coupée par défaut**, activée par l'Admin d'église — choix par
  prudence, à confirmer (question laissée sans réponse).

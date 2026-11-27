# ADR-0033 — Architecture de l'information par métier, adresses par espace et politique de redirection

- **Statut** : Proposé
- **Date** : 2026-11-27

## Contexte

La navigation de Koinonia s'est construite module par module : un même métier se retrouve dans
plusieurs espaces (la comptabilité sous Demandes, Administration et une vue pastorale en double),
des libellés désignent deux écrans, des écrans n'ont pas de parent, et les adresses reflètent
l'historique des modules (`/accounting`, `/care`, `/admin/events`) plutôt que l'endroit où la
personne les trouve. La spec 092 réorganise la navigation en onze espaces par métier et aligne les
adresses sur ces espaces (audit et carte : `specs/092-navigation-par-metier/`).

Trois contraintes rendent la décision structurante :

- **Les sites d'événement** (ADR-0031) sont servis par hôte, et leurs pages par défaut s'appellent
  `accueil` et `billetterie` : une redirection appliquée avant le routage par hôte casserait ces
  sites. Les redirections de `next.config.ts` s'appliquent justement avant le proxy.
- **Les liens publics par jeton** (`/media/c|d|g|v/<jeton>`, `/f`, `/billet`…) partagent des
  préfixes avec des écrans connectés ; une redirection par joker les atteindrait.
- **ADR-0012** résout le propriétaire d'une adresse parmi les modules **actifs** : un écran d'un
  module coupé, placé sous un préfixe d'un module actif ou du noyau (`/admin/messages` sous
  `/admin`, `/accounting/navette` sous `/accounting`), est servi au lieu de répondre 404. Ce défaut
  existe déjà ; partager des préfixes d'espace entre modules le généraliserait.

## Décision

1. **Espaces par métier.** La navigation est une seule définition (`src/lib/navigation.ts`) en
   onze espaces : Accueil, Planning, Événements, Pastoral, Personnes, Demandes, Finances, Médias,
   Ressources, Administration, Plateforme. Un espace regroupe des écrans de plusieurs modules ;
   la navigation range, elle ne décide d'aucun droit. Plateforme n'est visible que du Super Admin.
   La vue pastorale est un **filtre** de cette définition, pas une seconde navigation.
2. **Registre unique des écrans** (`src/lib/paths.ts`, pur) : clé, motif d'adresse, constructeur
   typé, espace, parent, libellé. Tout lien interne (pages, services qui écrivent des liens de
   notification, assistant, MCP, emails) passe par ce registre ; un test interdit les littéraux
   d'écran ailleurs. Le parent d'un écran vient du registre, jamais d'une heuristique de segments.
3. **Convention d'adresse.** L'adresse d'un écran connecté commence par le préfixe de son espace
   (`/planning`, `/evenements`, `/pastoral`, `/personnes`, `/demandes`, `/finances`, `/medias`,
   `/ressources`, `/admin`, `/plateforme`), avec des segments en français. Exceptions énumérées :
   `/accueil`, `/profile/*`, `/guide`, `/messages/[id]`, `/mcp/autoriser`. Un écran a une seule
   adresse même s'il est atteint depuis deux espaces (demandes comptables d'un Ministre via Mes
   demandes : adresse `/finances/…`, parent Mes demandes). Les adresses publiques, les liens par
   jeton, les sites d'événement et toutes les adresses `/api/*` ne changent pas. La racine d'un
   espace sans écran propre est une page noyau qui redirige vers la première page accessible.
4. **Politique de redirection.**
   - Les anciennes adresses sont redirigées **dans le proxy** (`src/proxy.ts`), **après** la
     branche des hôtes de site, le test des fichiers statiques et de `/site` — jamais par
     `next.config.ts`, jamais sur un hôte de site ou un domaine dédié.
   - La table (`src/lib/legacy-paths.ts`, pure) est **explicite** : segments fixes et paramètres
     nommés limités à `[A-Za-z0-9_-]{1,64}`, aucun joker, aucune source sous une route publique ou
     un lien par jeton, aucune chaîne (cible jamais source). La cible est un modèle fixe sur la même
     origine ; la chaîne de requête est conservée.
   - Seuls `GET` et `HEAD` sont redirigés ; une autre méthode suit le chemin normal (404).
   - Si la cible appartient à un module coupé, l'ancienne adresse répond 404 comme la nouvelle.
   - **307 pendant l'observation** (deux à quatre semaines), puis **308**, conservées sans échéance.
   - Les adresses mémorisées en base (`AssistantEntry.href`/`screens`, `SystemMessage.linkUrl`,
     `Notification.link`) sont réécrites par un script idempotent, réversible et précédé d'une
     sauvegarde — pas par une migration.
5. **Correction de la résolution d'ADR-0012.** Le propriétaire d'une adresse est cherché parmi
   **tous** les manifestes (plus long préfixe) ; s'il est inactif, l'adresse est orpheline (404),
   même si un préfixe plus court appartient à un module actif ou au noyau.

## Alternatives considérées

- **Garder les adresses par module, ne changer que la navigation** : moins de risque immédiat,
  mais l'adresse continue de contredire l'endroit où l'écran se trouve et chaque nouvel espace
  ajoute une exception ; écarté par le propriétaire (spec 092).
- **Redirections dans `next.config.ts`** : simples et cachables, mais appliquées avant le proxy,
  donc aussi aux sites d'événement ; une condition sur l'hôte ne couvre pas les domaines dédiés,
  dynamiques.
- **Redirections par joker** (`/media/:path*`) : table courte, mais atteint les liens de partage
  publics ; écarté.
- **308 dès la bascule** : définitif dans les navigateurs, aucun retour arrière ; écarté.
- **Migration SQL pour les adresses mémorisées** : rejouée sur toute base vierge, non réversible
  proprement, fragile sur les préfixes JSON ; écarté au profit d'un script d'exploitation.
- **Lecture pastorale par ajout de permissions à `PASTORAL_READ_PERMISSIONS`** : étendrait en
  silence l'export, l'assistant et tout futur appelant ; écarté au profit d'un helper nommé, appelé
  par les seuls chemins de lecture concernés (plan 092, lot 3).

## Conséquences

- **Positives** : une adresse dit où est l'écran ; liens internes centralisés (la bascule change le
  registre, pas 960 littéraux) ; modules coupés réellement absents ; parenté vérifiable par test.
- **Négatives** : la table des anciennes adresses ne se supprime jamais (liens d'emails, WhatsApp,
  favoris) ; un préfixe d'espace est partagé par plusieurs modules, ce qui exige la correction
  d'ADR-0012 ; le script de réécriture est une étape d'exploitation à ne pas oublier.
- **À surveiller** : toute nouvelle page déclare son espace dans le registre et son préfixe dans
  son manifeste ; toute nouvelle adresse publique est vérifiée contre la table des redirections ;
  un nouvel hôte ou chemin servi par les sites (ADR-0031) reste en amont des redirections.

## Références

- Spec : `specs/092-navigation-par-metier/` (spec, audit, impacts, carte `url-mapping.txt`, plan)
- ADR-0012 (surface HTTP des modules), ADR-0019 (effacement par lien), ADR-0026 (écrans hors
  ligne), ADR-0031 (sites d'événement : routage par hôte), ADR-0018 (design system, navigation)

# ADR-0029 — Koinonia serveur d'autorisation OAuth pour ses connexions MCP

- **Statut** : Proposé
- **Date** : 2026-11-11

## Contexte

La spec 081 ouvre Koinonia aux assistants IA du marché (Claude, ChatGPT, outils de
développement) par le protocole MCP, pour **tous les comptes**, sans clé à copier. Ces clients
ne savent se connecter à un serveur MCP distant que par OAuth 2.1 (découverte RFC 9728/8414,
enregistrement dynamique RFC 7591, code d'autorisation + PKCE). Koinonia n'expose aujourd'hui
aucune API à un tiers : l'authentification passe uniquement par la session NextAuth (Google),
dans le navigateur.

## Décision

Koinonia joue lui-même le rôle de **serveur d'autorisation OAuth 2.1** pour une seule
ressource, son serveur MCP (`/api/mcp`) :

- clients **publics** enregistrés dynamiquement, PKCE S256 obligatoire, URI de redirection
  exactes (https, ou boucle locale) ;
- la personne s'identifie par la connexion existante (NextAuth) puis autorise sur un écran
  Koinonia, en choisissant **une église** ; une connexion = un compte, une église, un client ;
- jetons **opaques**, seule leur empreinte SHA-256 est stockée ; accès 1 h, rafraîchissement
  glissant 90 jours avec rotation et révocation en cascade en cas de réutilisation ;
- chaque appel reconstruit la session depuis la base et passe par les **questions de données**
  de l'assistant (ADR-0028), qui revérifient le droit de chaque écran.

Ces jetons n'ouvrent **que** `/api/mcp` : aucune autre route de Koinonia ne les accepte.

## Alternatives considérées

- **Jeton personnel à coller** — refusé par la spec (tous les comptes, sans clé), mal pris en
  charge par plusieurs clients, circule par message.
- **Serveur OAuth complet (`oidc-provider`, Keycloak) ou routeur OAuth de la bibliothèque MCP
  (Express)** — surface et exploitation bien plus lourdes que les cinq points d'entrée
  nécessaires ; intégration Express dans Next.js.
- **Déléguer à Google** (jetons Google présentés au serveur MCP) — les clients MCP attendent le
  serveur d'autorisation désigné par la ressource ; pas de choix d'église ni de révocation
  propre à Koinonia.
- **Jetons signés (JWT)** — révocation immédiate impossible sans liste de révocation ; une
  lecture en base par appel est acceptable à cette échelle.

## Conséquences

- Nouvelle surface de sécurité (OAuth) à revoir avant chaque évolution : redirections,
  rejeu, CSRF et clickjacking de l'écran d'autorisation.
- Les données lues par un assistant quittent Koinonia vers le fournisseur d'IA choisi par la
  personne : l'écran d'autorisation le dit ; la liste des outils exclut le suivi pastoral, les
  coordonnées bancaires et les coordonnées d'autrui.
- Toute nouvelle question de données de l'assistant devient candidate à un outil MCP : elle
  n'y entre que par la liste blanche du serveur.
- Fonction coupée par défaut par église, interrupteur d'instance pour le Super Admin.

## Références

- `specs/081-serveur-mcp/spec.md`, `specs/081-serveur-mcp/plan.md`
- ADR-0028 (assistant : données par questions déclarées)
- MCP Authorization (spécification), RFC 6749, 7591, 7636, 8414, 8707, 9728

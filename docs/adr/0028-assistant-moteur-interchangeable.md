# ADR-0028 — Assistant : moteur de réponse interchangeable, données par questions déclarées

- **Statut** : Accepté
- **Date** : 2026-11-05

## Contexte

L'assistant de prise en main (spec 075) répond aux questions sur l'application et sur les
données que la personne voit déjà. La V1 fonctionne sans service externe (base de
connaissances et recherche par le sens locale). Le porteur souhaite pouvoir brancher plus tard
une IA générative, externe ou installée sur le serveur, sans refaire l'assistant ni affaiblir
les droits.

Une IA qui interrogerait librement la base de données pourrait montrer plus que les écrans ;
une IA qui recevrait le contexte brut d'un écran pourrait recopier des coordonnées ou des
données pastorales.

## Décision

- Les réponses passent par une interface **`AnswerEngine`** (`answer(input, viewer)`), dont la
  V1 `LocalEngine` (recherche hybride sens + mots) est une implémentation ; un moteur IA en sera
  une autre, choisie par configuration et activée par le Super Admin.
- Les données ne sont accessibles **que par des questions déclarées** (`AssistantDataQuestion` :
  clé, description, paramètres Zod, exécution), **fournies par chaque module** avec ses propres
  services et règles de périmètre, et composées dans `src/app`. Un moteur, quel qu'il soit, ne
  peut qu'appeler ces fonctions : pas d'accès direct à Prisma, pas de requête libre.
- Le résultat d'une question de données ne contient que des libellés bornés, jamais de
  coordonnée ni de donnée pastorale (test automatique).
- La base de connaissances est un ensemble de fiches récupérables, servant de contexte à un futur
  moteur IA.
- Un moteur qui envoie des données hors de l'instance exige une activation explicite du Super
  Admin, une mention aux utilisateurs et un plafond de coût.

## Alternatives considérées

- **IA générative dès la V1** — coût, données hors de l'instance, réponses non prévisibles,
  serveur de 4–8 Go insuffisant pour un modèle local de qualité.
- **Accès direct de l'assistant aux tables** — duplique les règles de périmètre et permet de
  montrer plus que l'écran.

## Conséquences

- Ajouter une IA = écrire un `AnswerEngine` et des descriptions de questions, sans toucher à
  l'écran, aux droits ni aux modules.
- Chaque nouvelle question de données est du code dans le module concerné, testée avec ses
  règles de périmètre.
- Une question non couverte reste sans réponse tant qu'elle n'est pas déclarée : c'est voulu.

## Références

- [Spec 075 — assistant](../../specs/075-assistant-embarque/)
- ADR-0011, ADR-0012 (modules désactivables), ADR-0027 (composition dans `src/app`)

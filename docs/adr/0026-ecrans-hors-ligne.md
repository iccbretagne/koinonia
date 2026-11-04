# ADR-0026 — Écrans de terrain utilisables hors ligne

- **Statut** : Accepté
- **Date** : 2026-11-04

## Contexte

La billetterie (spec 074) impose de **savoir à tout instant combien de personnes sont dans le
bâtiment** : c'est une obligation réglementaire de sécurité. Le contrôle des entrées et sorties,
et la distribution des repas, se font au téléphone, dans des salles où le réseau est incertain
(sous-sol, foule, réseau saturé à minuit le 31/12). Jusqu'ici, Koinonia supposait le réseau
disponible : le service worker ne servait qu'un repli « hors ligne » des pages déjà vues, et
aucun écran n'enregistrait d'opération sans serveur.

## Décision

Un écran de terrain suit ce patron, dans un module et sans infrastructure nouvelle :

1. **Instantané** : à l'ouverture, puis toutes les 30 s quand la file est vide, l'écran
   télécharge ce qu'il lui faut pour travailler seul (`…/snapshot`). L'instantané contient des
   **empreintes** SHA-256 des codes, jamais les jetons : un QR scanné est haché sur l'appareil
   (`crypto.subtle`, `src/lib/offline/hash.ts`) puis comparé. Il ne contient que les données du
   rôle (l'accueil ne reçoit ni email, ni téléphone de contact, ni montant d'option). Il est gardé
   dans IndexedDB.
2. **File locale** : chaque geste devient une opération avec un **identifiant généré par
   l'appareil**, mise en file dans IndexedDB (`src/lib/offline/store.ts`) et appliquée tout de
   suite à l'état local (affichage optimiste).
3. **Synchronisation idempotente** : la file est envoyée toutes les 5 s et à chaque ajout
   (`…/sync`). Le serveur ignore une opération déjà reçue (même identifiant) et renvoie pour
   chacune `applied`, `duplicate` ou `rejected` ; l'appareil retire de sa file tout ce qui a reçu
   une réponse. Les gestes cumulatifs sont exprimés en valeurs absolues (« 2 repas remis au
   total ») pour rester rejouables.
4. **Horloge** : l'appareil envoie son heure ; le serveur corrige l'écart mesuré et ramène une
   heure future à maintenant. L'état (présences) est **calculé** à partir des opérations triées
   par heure de geste, jamais stocké : des opérations reçues en retard ou dans le désordre
   donnent le même résultat.
5. **Incohérence gardée** : une opération incohérente (entrée d'une personne déjà à l'intérieur,
   vue d'un autre téléphone) est enregistrée, marquée « anomalie » et signalée, jamais perdue.
6. **Rechargement hors ligne** : le service worker sert `/_next/static/*` (fichiers immuables à
   empreinte) en **cache d'abord** (cache `koinonia-v6`) ; les pages restent en réseau d'abord
   avec le cache en repli. Un écran ouvert une fois en ligne se recharge donc sans réseau.

## Conséquences

- Un écran de terrain fonctionne sans réseau pendant toute une soirée et rattrape tout au retour
  du réseau, sans doublon. La recette se fait sur deux téléphones réels en mode avion.
- Deux téléphones hors ligne peuvent diverger un temps (chacun ne voit que ses propres passages) :
  c'est accepté, la convergence se fait à la synchronisation et les anomalies sont signalées.
- Les opérations hors ligne ne vérifient que ce que l'instantané permet ; le serveur reste
  l'arbitre et peut refuser une opération (`rejected`, par exemple un billet annulé entre-temps).
- Pas de temps réel serveur (WebSocket) : l'infrastructure n'en a pas, et 5 s suffisent pour une
  ou deux portes.
- Tout nouvel écran hors ligne réutilise ce patron (`useFieldSync`, `src/lib/offline/`) plutôt
  que d'inventer le sien.

## Alternatives écartées

- **Tout en ligne** : inacceptable pour une obligation de sécurité dans une salle au réseau
  incertain.
- **Jetons dans l'instantané** : un téléphone perdu donnerait de quoi forger des billets ; les
  empreintes suffisent pour comparer.
- **Compteur stocké et incrémenté** : faux dès qu'une opération arrive en retard ou en double.

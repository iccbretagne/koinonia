# ADR-0008 — Cache disque local des renditions audio, servies par l'application

- **Statut** : Accepté
- **Date** : 2026-08-26

## Contexte

L'écoute publique d'un enregistrement passe aujourd'hui par
`GET /api/audio/public/[token]/stream/[segmentId]`, qui répond une redirection 302 vers une URL
S3 signée. Le choix était bon pour le P1 : les octets ne transitent pas par le serveur
applicatif et le Range HTTP natif de S3 permet le seek sans proxy.

Deux évolutions changent la donne.

**Le volume.** Tant que l'écoute n'est atteignable que par un lien de partage reçu, un
enregistrement est lu quelques dizaines de fois. La spec 021 ouvre une bibliothèque à tout
membre authentifié : le même enregistrement sera lu par une part significative de l'assemblée,
et réécouté. L'egress S3 est facturé au Go.

**L'anti-cache par construction.** `getSignedStreamUrl` regénère une signature à chaque appel,
donc l'URL diffère à chaque écoute. Aucun cache — navigateur ou partagé — ne peut s'y
raccrocher : réécouter la même séquence dix minutes plus tard la retélécharge intégralement.
Le seek en fait autant. C'est invisible aujourd'hui parce que l'audience est confidentielle.

Or une rendition est **immuable** : une fois produite, elle ne change plus. Un remplacement de
source produit un nouveau rendu, tracé par `sourceHash`. C'est le cas le plus favorable qui
soit pour du cache — et celui qu'on exploite le moins bien.

Contrainte d'exploitation : Koinonia tourne sur une VM Debian dédiée derrière Traefik, dont la
bande passante sortante est forfaitaire, face à un stockage objet dont l'egress est mesuré.

## Décision

**On sert les renditions audio depuis un cache disque local à la VM, alimenté à la demande
depuis le stockage objet, plutôt que par redirection vers une URL signée.**

- Une rendition est téléchargée depuis S3 **au premier accès** et conservée sur le disque de la
  VM ; les accès suivants sont servis localement, sans nouvel egress.
- La route de streaming sert le fichier elle-même, en honorant le `Range` HTTP — le seek et la
  reprise d'écoute (spec 021) en dépendent. C'est le mode livré : Traefik sert Koinonia en
  attaquant directement le process Node, sans reverse proxy applicatif intermédiaire.
  **Un point de sortie est prévu sans être activé** : si un nginx est un jour placé devant le
  process, la route peut répondre un corps vide portant un en-tête `X-Accel-Redirect` vers un
  emplacement `internal`, et lui déléguer l'envoi en `sendfile` avec gestion native du `Range`,
  libérant le handler applicatif immédiatement. Le comportement observable et le contrôle
  d'accès sont identiques dans les deux modes ; le choix est une variable d'environnement.
- Les réponses portent des en-têtes de cache long et `immutable` : le navigateur d'un auditeur
  cesse lui aussi de retélécharger ce qu'il a déjà.
- La clé de cache est celle de la rendition dans le stockage objet, qui change quand le rendu
  change — il n'y a donc pas d'invalidation à orchestrer.
- Le contrôle d'accès reste **avant** le cache : le token de partage est vérifié à chaque
  requête, et la publication du culte aussi. Le cache accélère la livraison, il n'autorise
  personne. La délégation à nginx ne change rien à ce point : l'emplacement est `internal`,
  donc inatteignable autrement que par un `X-Accel-Redirect` émis après vérification.
- L'espace disque est borné : au-delà d'un plafond, les entrées les moins récemment servies
  sont évincées. Le cache est un accélérateur, jamais une source de vérité — le stockage objet
  reste le seul endroit où une rendition existe durablement.

## Alternatives considérées

- **Rendre l'URL signée stable par fenêtre de temps** (expiration arrondie à l'heure pleine, de
  sorte que tous les auditeurs reçoivent la même URL pendant la fenêtre) — quelques lignes,
  aucune infrastructure, et le cache navigateur redevient opérant. Écartée comme solution
  principale car elle ne supprime pas l'egress : chaque premier auditeur, chaque nouvelle
  fenêtre et chaque appareil repaient le transfert. Reste intéressante en complément, et
  déjà couverte par les en-têtes de cache ci-dessus.
- **`proxy_cache` nginx en frontal du stockage objet**, nginx téléchargeant et cachant lui-même
  — la variante la plus « déléguée », qui supprimerait tout code de remplissage de cache.
  Écartée : nginx devrait s'authentifier auprès du stockage, ce qui impose de faire transiter
  une URL signée dans un `proxy_pass`, une clé de cache dissociée de la signature et un
  `resolver` — de la logique critique déplacée dans une configuration serveur que le dépôt ne
  versionne pas et que la CI ne teste pas. Le remplissage côté applicatif reste testable ;
  seul l'envoi est délégué.
- **CDN devant le stockage** (Cloudflare ou équivalent) — le plus efficace sur l'egress, et le
  plus adapté si l'audience devenait vraiment large. Écartée pour l'instant : elle complique la
  révocation d'un lien de partage et la dépublication, puisqu'une copie mise en cache hors de
  notre contrôle survit à la révocation. Le jour où le volume le justifiera, cet ADR devra être
  révisé plutôt que contourné.
- **Ne rien faire et surveiller la facture** — défendable tant que l'audience reste celle du P1,
  intenable dès la mise en service de la bibliothèque, qui est précisément ce qui multiplie les
  lectures. Repousser la décision reviendrait à découvrir le coût après l'avoir payé.

## Conséquences

**Ce que ça rend plus facile.** L'egress S3 devient proportionnel au nombre de renditions
publiées, non au nombre d'écoutes — le coût cesse de croître avec l'adoption, qui est
exactement l'objectif. La latence de démarrage d'une lecture s'améliore après le premier accès.
Le seek, très demandeur en requêtes de plage, tape sur le disque local.

**Ce que ça rend plus difficile.** Les octets transitent désormais par le processus Next.js, qui
n'était jusqu'ici jamais sur le chemin des données : une écoute mobilise une connexion
applicative pendant toute sa durée, là où la redirection la libérait immédiatement. Le streaming
doit être servi en flux, sans charger le fichier en mémoire, sous peine de faire tomber le
serveur sur quelques écoutes simultanées. Le dimensionnement attendu — quelques dizaines
d'écoutes simultanées au pic pour une église — reste très en deçà de ce qu'encaisse un
streaming avec contre-pression ; c'est à mesurer après mise en service, et deux issues sont
instruites si la mesure déçoit : la délégation `X-Accel-Redirect` derrière un nginx, ou le CDN.

Le disque de la VM devient une ressource à surveiller, avec un plafond et une éviction — une
préoccupation d'exploitation qui n'existait pas.

Enfin, la VM devient un point de passage obligé de l'écoute : si elle est saturée, l'écoute
l'est aussi, alors que la redirection déportait cette charge sur le stockage objet. C'est le
prix assumé de la décision, et la raison pour laquelle le CDN reste la porte de sortie si
l'audience change d'ordre de grandeur.

## Références

- [Spec 021 — Bibliothèque d'écoute des cultes](../../specs/021-audio-bibliotheque-ecoute/spec.md) — la
  fonctionnalité qui déclenche le volume, et son point de vigilance sur le coût de transfert.
- [Spec 020 — Ergonomie et navigation du module audio](../../specs/020-audio-ergonomie-navigation/spec.md) —
  récupération du lien d'écoute, qui élargit la diffusion.
- [ADR-0006 — Extraction de `modules/storage`](0006-extraction-module-storage.md) — le module par
  lequel passent les accès au stockage objet.
- `src/app/api/audio/public/[token]/stream/[segmentId]/route.ts` — la redirection 302 remplacée.
- [Plan de la spec 021](../../specs/021-audio-bibliotheque-ecoute/plan.md) — mise en œuvre :
  `rendition-cache.ts`, `stream.ts`, pré-chauffage par le worker de rendu, et la configuration
  nginx correspondante.

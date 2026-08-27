# Conception — Module audio des cultes

- **Statut** : Révision 7, 2026-08-23
- **Spec associée** : [`spec.md`](./spec.md) (phase P1 uniquement)
- **Figures et maquettes** : artefact « Koinonia Audio » — https://claude.ai/code/artifact/15e171f2-6469-471a-aed6-2f4a929f56b3
- **Source amont** : audit `iccbretagne/diffusion-audio`, `docs/analyse-pipeline-audio.md` (2026-08-22)

> Ce document porte le **raisonnement** et les **mesures** qui ont conduit aux décisions.
> La spec décrit le comportement attendu ; le `plan.md` décrira l'implémentation de P1.
> Ce qui est ici et nulle part ailleurs : les chiffres relevés sur les enregistrements réels,
> et le journal des erreurs de conception corrigées en route.

---

## 1. Le problème, en un chiffre

Publier un culte demande aujourd'hui **environ deux heures de réécoute** sous un éditeur audio
pour retrouver cinq frontières entre séquences, puis un export fichier par fichier, un dépôt en
ligne de commande et un `chown` qui exige `root`. La chaîne est à l'arrêt depuis le
**14 juin 2026** — faute de temps, pas faute d'outil de dépôt.

Test de validité de toute proposition, repris de l'audit : *si elle laisse quelqu'un devant un
éditeur audio deux heures par dimanche, elle échouera à nouveau.*

## 2. La proposition

1. Après le culte, la régie exporte la session depuis Capture et désigne le culte concerné.
2. Un agent sur le poste parcourt les sources **une seule fois** : il en tire les enveloppes
   d'énergie par canal et fabrique le mix stéréo, puis envoie ces deux-là vers le S3.
3. Un worker propose les frontières ; la régie les vérifie en écoutant quelques secondes autour
   de chacune, nomme les séquences, publie.
4. La découpe, la normalisation et les métadonnées sont automatiques. Un lien public part dans
   les groupes WhatsApp.

Aucun nouveau serveur, aucun broker, aucune seconde d'éditeur audio.

---

## 3. Ce que disent les enregistrements

Inventaire du 23 août 2026 sur `ICC/Rennes/MCIM/Sonorisation/audio`, en métadonnées seules
(plus un en-tête WAV de 100 octets et trois extraits de 120 Ko pour les comparaisons de canaux).

### Format et volumes

| Mesure | Valeur |
|---|---|
| Format des fichiers | PCM 48 kHz, 16 bits, 2 canaux |
| Durée d'une session | 10 434 s ≈ **2 h 53** (culte du 7 juin) |
| Taille par fichier | 2,00 Go (7 juin) — 2,90 Go (16 août) |
| Taille d'une session | **36 Go** (7 juin) — **52 Go** (16 août), 18 fichiers |
| Redondance interne | `R[i] = L[i+1]` à ±2 LSB près — chaque canal mono est écrit en stéréo décalé d'un échantillon |
| Archive Drive existante | ordre de 800 Go à 1 To, dont `cultes-icc-2024.tar` (18,8 Go) |

### Canaux

Le plan de patch **varie d'une session à l'autre** : 8, 13, 18 ou 20 fichiers selon les
dimanches. Structure constatée : `Ch01`–`Ch16` entrées, `Ch17`/`Ch18` Main L/R,
`Ch19`/`Ch20` Virtual in (inutilisés).

Quatre paires portent **le même signal dans leurs deux fichiers** — vérifié à trois instants du
culte du 7 juin :

| Paire | Écart max mesuré | Conclusion |
|---|---|---|
| `09/10` | ≤ 2 LSB | même signal |
| `11/12` | −48 dB | même signal |
| `13/14` | −32 à −26 dB | même signal |
| `15/16` | −33 dB | même signal |
| `17/18` | −2,5 dB | **réellement stéréo** (Main L/R, écartés par ailleurs) |

**Il y a donc 12 sources réelles** : 8 entrées mono + 4 paires lues sur un seul de leurs deux
fichiers. Conséquence double : un tiers d'octets en moins à lire (35 Go au lieu de 52), et
surtout un comptage « combien d'entrées actives » qui ne compte pas les paires en double —
c'est le trait le plus discriminant de la détection.

### Le dépôt est un second goulot

Décalage entre la date du culte et la date de dépôt sur le Drive :

| Mesure | Valeur |
|---|---|
| Décalage médian | **9 jours** |
| Décalage maximum | **125 jours** (culte du 19 avril, déposé le 22 août) |
| Rattrapages groupés | 4 juillet, 12 juillet, 22 août |

Sept sessions déposées le même jour, puis trois autres cinq semaines plus tard : ce n'est pas
une chaîne qui tourne, c'est une personne qui rattrape, sur sa machine et son compte personnels.

### Les découpes publiées contredisent l'hypothèse du déroulé fixe

| Culte | Ordre constaté |
|---|---|
| 3 mai | Louanges · Sainte-cène · Offrandes · Prédication · Annonces |
| 10 mai | Louanges · **Prédication** · Sainte cène · Offrandes · Annonces |
| 31 mai | Prière des STAR · Sainte cène · Offrandes · Prédication · Annonces · *MLA* |
| 14 juin | Prière des STAR · Sainte cène · Prédication · Dîmes et offrandes · Annonces |

La prédication n'est pas toujours en quatrième position, le 3 mai n'a pas de prière des STAR, le
31 mai a une séquence de plus, et les noms varient (« Sainte-cène » / « Sainte cène »,
« Offrandes » / « Dimes et offrandes »).

### Vérité terrain quasi inexistante

Sur 23 sessions, **deux dates seulement** ont à la fois un multipiste et une découpe publiée :
`20260222` (dossier de sortie vide) et `20260412` (2 segments sur 5). Aucun culte complet à
confronter — le corpus de test sera produit par les premières validations manuelles de P1.

### Qualité (mesures de l'audit amont)

Écrêtage jusqu'à **+5,4 dBFS** sur une prédication, quatre séquences sur cinq au-dessus de
0 dBFS, écart de **8 LU** entre séquences d'un même culte. Cinq écoutes en deux mois sur la
plateforme actuelle, zéro en juillet et août.

---

## 4. Décisions

| # | Décision | Destination |
|---|---|---|
| D1 | Module `audio` distinct, pas une valeur de plus dans `MediaFileType` | ADR |
| D2 | Extraire `modules/storage` hors de `media` | ADR |
| D3 | Worker hors Next.js, piloté par une table de jobs | ADR |
| D4 | Le multipiste ne quitte pas le poste ; seules enveloppes et mix montent | conception |
| D5 | Détecter les frontières sans deviner les étiquettes | `plan.md` P2 |
| D6 | Diffusion par lien public à jeton, pensé pour l'aperçu WhatsApp | `plan.md` P1 |
| D7 | La régie valide et publie en autonomie, portée par département | `plan.md` P1 |
| D8 | Un agent sur le poste de la régie, qui réduit à la source | conception |
| D9 | Un dépôt appartient à un culte, désigné au dépôt | conception |
| D10 | Le mix est fabriqué depuis les sources, pas récupéré de la console | `plan.md` P2 |
| D11 | La bibliothèque est publique | `plan.md` P1.5 |
| D12 | La bibliothèque justifie la reprise des 413 fichiers existants | conception |

### D1 — Module `audio` distinct

Le modèle de `media` est *un fichier, des versions, un statut* : bon pour un visuel qu'on révise.
Un culte est l'inverse — **une source unique découpée en N intervalles ordonnés**, dont aucun
n'existe avant traitement. Loger cela dans `MediaFile` imposerait sept champs nullables et deux
workflows de validation dans le même écran.

*Écarté* : étendre `media`. Économise une migration aujourd'hui, coûte un modèle ambigu pour
toujours.

### D2 — Extraire `modules/storage`

`media/services/s3.ts` exporte déjà tout ce dont l'audio a besoin (`createMultipartUpload`,
`getSignedPartUrl`, `getS3ObjectStream`, `getSignedPutUrl`). Faire dépendre `audio` de `media`
pour y accéder créerait une dépendance de domaine à domaine sans justification métier : l'audio
n'a pas besoin des galeries photos. Déplacer `s3.ts` et le primitif de jeton vers
`src/modules/storage`, `media` les ré-exporte pour ne rien casser.

*Écarté* : dupliquer le client S3 dans `audio`.

### D3 — Worker hors Next.js, table de jobs

C'est le manque d'infrastructure du dépôt : `ModuleManifest` déclare un type `JobDescriptor`
mais **aucun runner ne l'exécute**, et `MediaZipJob` existe en base sans code qui le consomme
(le ZIP est streamé en synchrone). Un `ffmpeg` de deux heures ne peut pas vivre dans un route
handler. Un process `npm run worker`, unité systemd distincte, prend un bail sur `audio_jobs`
(`SELECT … FOR UPDATE SKIP LOCKED`, supporté par MariaDB 10.11). **La base est le seul canal.**

*Écarté* : BullMQ/Redis (un service de plus pour un job par semaine) · un cron shell (ni
progression, ni reprise, ni erreur remontée) · un traitement dans la route (timeout, mémoire,
et un déploiement qui tue un rendu en cours).

### D4 — Réduire à la source

52 Go par session contre 71 Go libres sur le serveur : une seule session dépasse la moitié de
l'espace disponible. Or la détection n'a pas besoin du *son* des seize pistes, seulement de
savoir lesquelles étaient actives et quand — moins d'un mégaoctet d'enveloppes. Et la découpe
se fait sur un mix stéréo de 200 Mo.

*Écarté* : téléverser le multipiste complet comme prérequis.

### D5 — Détecter les frontières, pas les étiquettes

L'audit posait que l'ordre du déroulé est connu d'avance ; les découpes publiées le démentent
(§3). Deux ajustements, tous deux simplificateurs :

- **Trouver *où* ça coupe** est robuste — une rupture d'activité multicanal se voit. **Deviner
  *quoi*** est fragile et variable, jusque dans le nom. La régie choisit dans une liste, cinq
  secondes, dans un écran déjà ouvert. Le composant le plus incertain du projet disparaît.
- **Traits agrégés, pas rôles par canal.** Ne pas écrire « Ch03 = micro pupitre » : compter,
  seconde par seconde, *combien d'entrées* sont actives et si l'énergie est portée par une
  seule. Louanges = beaucoup, prédication = une. Insensible au plan de patch, qui varie.

L'alignement reste contraint et monotone, mais le template devient un jeu de séquences possibles
— chacune vue au plus une fois, ouverture et clôture contraintes — et non une liste rigide.
La fonction reste **pure et testable en CI**.

*Écarté* : classification par signature sonore (mesurée et invalidée par l'audit : prédication et
offrandes ont des plages dynamiques identiques) · `silencedetect` seul, conservé en repli ·
journal du logiciel de projection : **FreeShow ne journalise pas** ses changements de vue, et un
écouteur ajouté remettrait la chaîne sous la dépendance d'un poste allumé pendant le culte.

### D6 — Diffusion par lien public

Deux exigences que les routes de partage de `media` ne satisfont pas :

- **Métadonnées Open Graph** sur la route publique — sans quoi le lien apparaît nu dans la
  conversation et personne ne clique.
- **Requêtes Range HTTP** sur le flux audio — sans quoi impossible d'avancer dans une prédication
  de 45 minutes, et le navigateur retélécharge tout à chaque reprise.

Une séquence est adressable seule : on partage « la prédication de dimanche », pas « le culte ».

*Écarté* : améliorer Audiobookshelf (OIDC pourtant supporté par le binaire 2.35.1) — améliorer
l'accès à une plateforme à zéro écoute ne produit rien · Castopod, pertinent seulement si un
flux RSS public devient un objectif.

### D7 — La régie en autonomie

`audio:view`, `audio:upload`, `audio:review`, `audio:manage`, portées par le **département de
captation** via `getUserDepartmentScope`, pas par le secrétariat. Arbitrage d'interface autant
que de permissions : le module s'ouvre sur la file d'attente de la régie, pas sur une page
d'administration. `logAudit` trace chaque publication — la traçabilité remplace le contrôle
a priori.

*Écarté* : un rôle `AUDIO_EDITOR` · une relecture pastorale obligatoire — si elle devient
nécessaire, scinder `audio:review` (frontières) et `audio:publish` (lien public) suffit.

### D8 — Un agent sur le poste de la régie

Deux révisions ont cherché à éviter d'installer quoi que ce soit (page navigateur, puis
connecteur Drive côté serveur). Les mesures ferment cette porte : retards de dépôt de cinq à
dix-huit semaines, machine et compte personnels, et un poste qui enchaîne deux cultes le même
matin. L'agent fait quatre choses : repérer les sessions non envoyées, demander le culte (D9),
une passe locale (enveloppes + mix, D10), un envoi S3 reprenable.

**Règle absolue** : ne rien traiter tant qu'une captation tourne. Mixer douze pistes est le seul
moment où l'agent consomme la machine, et ce moment ne doit pas tomber pendant le culte suivant.

Enveloppe technique : React dans Tauri, `ffmpeg` en sidecar ; non signé pour commencer (clic
droit « Ouvrir » sur macOS, avertissement SmartScreen sur Windows), la signature ne se paie que
si l'usage s'élargit. Electron ferait le même travail en plus lourd — préférence d'outillage,
pas arbitrage de conception.

*Écarté* : connecteur Drive côté serveur (déplace la corvée sans la supprimer, et fait dépendre
l'église d'un compte personnel) · page navigateur seule (exige un onglet ouvert et quelqu'un
devant — conservée comme repli).

### D9 — Un dépôt appartient à un culte

Le poste sert deux assemblées le même matin, EJP puis ICC Rennes — un enregistrement par culte,
mais deux sessions dans la matinée. La désignation se fait **au dépôt**, quand le contexte est
frais, pas trois semaines plus tard devant deux dossiers du même jour. Bénéfice incident : ce
clic fixe le `churchId`, donc l'isolation multi-tenant est acquise à l'entrée du pipeline.

Ce que l'enchaînement impose vraiment n'est pas de découper une session en deux, mais de **ne
jamais bloquer le poste** : un clic pour désigner, le traitement attend son tour.

*Écarté* : déduire le culte de la date du dossier — échoue précisément les dimanches à deux
cultes, c'est-à-dire le cas qui motive la règle.

### D10 — Le mix est fabriqué, pas récupéré

Prendre `Main L`/`Main R` revient à hériter d'un réglage fait pour la salle : la sono d'une
assemblée n'est pas un mixage d'écoute. C'est très probablement l'origine de l'écrêtage mesuré
par l'audit (+5,4 dBFS). On ne rattrape pas un mix écrêté ; on évite de partir de lui.

L'agent somme les sources lui-même avec de la marge, puis `loudnorm` ramène à −16 LUFS au rendu.
Le profil de mixage par église décrit le **groupement** (12 entrées, dont 4 paires lues sur un
seul fichier), le gain et l'actif/inactif par entrée. V1 volontairement pauvre : somme à gain
unitaire, canaux exclus à la main ; si le mix déçoit, on ajuste le profil et on re-rend — gratuit
puisque le rendu est idempotent (`sourceHash`).

*Écarté* : un mixage automatique pondéré par l'activité — non reproductible d'un dimanche à
l'autre et impossible à corriger à la main.

**Recette de mixage réellement pratiquée** (précision terrain, rév. 8) — c'est elle que le
profil de mixage devra décrire quand l'agent la reproduira en P2 :

1. mixer les pistes des **chantres** entre elles ;
2. y intégrer les micros **dédiés par rôle** : le **modérateur** (annonces, optionnellement
   sainte cène et dîmes), le **pasteur** (prédication, optionnellement dîme et sainte cène), et
   optionnellement un micro dédié à la **prière du début** (« prière des STAR »).

L'intérêt de micros dédiés par rôle n'est pas cosmétique : il **minimise les interférences des
autres micros** dans le mix, ce qui permet d'extraire des séquences de meilleure qualité. C'est
donc aussi une aide à la segmentation — mais elle reste **indirecte** : D5 continue de segmenter
sur l'activité agrégée des canaux, sans attribuer de rôle sémantique à un canal. Faire dépendre
la détection d'un mapping « ce canal = le pasteur » la casserait dès qu'une église câble
autrement, ou qu'un dimanche le modérateur prend le micro du pasteur.

En P1, ce mixage est fait **hors Koinonia** — c'est ce qui arrive déjà mixé, que ce soit sous
forme d'un mix complet à découper ou de séquences déjà découpées (voir rév. 8).

### D11 — La bibliothèque est publique

Celui qui cherche « la prédication sur le pardon » est l'assemblée, pas l'équipe : une recherche
thématique réservée à trois personnes en interne ne sert personne. Le risque supplémentaire est
nul — ce sont les mêmes cultes, déjà diffusés publiquement par lien. Ce qui reste interne : la
file d'attente, les découpages en cours, les compteurs de production.

**L'unité de recherche est la séquence, pas le culte.** Personne ne cherche « le culte du
12 juillet ». Les facettes portent donc sur la séquence (type, orateur, série, période), et le
culte n'est que le contexte affiché.

Thématique sans champ supplémentaire à remplir chaque semaine : le **titre** (déjà saisi à la
validation), la **série** (un clic, et elle porte le thème pour six prédications — l'archive
existante est déjà organisée ainsi), et plus tard le **texte transcrit**. La recherche est conçue
pour être médiocre au début et bonne plus tard, sans réécriture.

*Écarté* : une bibliothèque derrière authentification — reproduirait le défaut d'Audiobookshelf,
dont l'audit a mesuré le résultat.

### D12 — Reprendre les 413 fichiers existants

Sans bibliothèque, les garder en archive interne ne coûtait rien et investir dessus, si. Avec
une recherche par orateur, série et période, deux ans d'archive deviennent **la moitié de la
valeur de l'écran** : une bibliothèque à trois cultes n'intéresse personne. L'import est bon
marché — les dossiers portent la date, les fichiers l'ordre et le type, et le dossier des
prédications est déjà organisé en séries.

Deux limites assumées : l'orateur n'est nulle part dans les fichiers existants, et ces fichiers
gardent leurs défauts de niveau à moins d'être repassés au même traitement que les nouveaux.

*Écarté* : migrer d'abord, publier ensuite — l'import est un remplissage, pas un préalable.

---

## 5. Modèle de données envisagé

| Modèle | Champs structurants | Raison d'être |
|---|---|---|
| `AudioService` | `churchId` · `planningEventId?` · date · orateur · `seriesId?` · statut · couverture | Le culte enregistré. Le lien vers l'`Event` fournit le déroulé et le titre. |
| `AudioSource` | `serviceId` · kind (MIX / ENVELOPES / SOURCE) · `channelKey` · `s3Key` · `durationMs` · `purgeableAt` | Ce qui a été déposé. Mix et enveloppes requis ; sources FLAC archivées et purgeables à la main après validation. |
| `AudioSegment` | `serviceId` · ordre · kind · `startMs` · `endMs` · titre · confiance · `detectedBy` · statut | Le cœur du domaine : une séquence est un intervalle, pas un fichier. `detectedBy` trace l'origine et permet de mesurer la détection. |
| `AudioRendition` | `segmentId` · `s3Key` · format · `lufs` · `truePeak` · `sourceHash` | Le fichier produit. `sourceHash` rend le rendu idempotent. |
| `AudioServiceTemplate` | `churchId` · `eventType` · séquences possibles · profil de mixage | Déroulé et profil de mixage : ce qui rend le module adaptable à une autre console et à une autre église sans toucher au code. |
| `AudioJob` | type (PROBE / ALIGN / RENDER / TRANSCRIBE) · statut · progression · tentatives · `leasedUntil` · payload | Le canal entre l'app et le worker. `leasedUntil` permet la reprise après redémarrage. |

Partage public : table de jetons propre au module plutôt qu'une troisième relation mutuellement
exclusive sur `MediaShareToken`. Le primitif cryptographique vient de `storage` (D2).

Transcription : `AudioTranscriptCue` en P3, mais l'alignement doit accepter dès P2 une liste de
repères horodatés en entrée, pour que son arrivée soit une source de plus et non une réécriture.

---

## 6. Découpage

| Phase | Contenu | Livre |
|---|---|---|
| **P0** | Extraire `modules/storage`, ré-export depuis `media` | Le module audio peut naître sans dépendre des galeries |
| **P1** | Modèles, worker, dépôt manuel du mix, écran de validation à frontières manuelles, découpe + normalisation + métadonnées, lien public, lien croisé avec l'événement | Un culte publié de bout en bout, sans éditeur audio ni accès serveur |
| **P1.5** | Bibliothèque publique, facettes, pages de série et d'orateur, import de l'archive | Deux ans d'archive trouvables, et une adresse pour l'église |
| **P2** | Agent de dépôt, profil de mixage, détection des frontières | Les frontières arrivent proposées ; la validation tombe à deux minutes |
| **P3** | Transcription, repères lexicaux réinjectés, recherche plein texte | Le texte que l'assemblée partage déjà à la main |
| **hors flux** | Rapatriement Drive → S3 par `rclone`, tri des `Main L/R` et `Virtual in`, conversion mono | L'église cesse de dépendre d'un compte personnel |

**Pourquoi P1 avant la détection**, contrairement à l'ordre de l'audit : avec une forme d'onde,
un déroulé pré-rempli et une découpe automatique, placer cinq frontières à la main prend une
dizaine de minutes — les deux heures sont déjà mortes. La détection fait ensuite passer de dix
minutes à deux, mais c'est la partie la plus incertaine : la mettre en premier, c'est risquer de
ne rien publier avant qu'elle marche. Elle produit en outre son propre corpus de test (§3).

---

## 7. Questions ouvertes

- Le compte S3 OVH et sa rétention : quel volume est acceptable pour l'archive FLAC des sources
  (≈ 10 Go par culte) avant purge manuelle ?
- La liste des noms de séquences est configurable par église — faut-il pouvoir la réordonner pour
  refléter le déroulé habituel, ou un jeu de noms suffit-il ?
- Le renvoi depuis la page d'écoute vers l'événement doit-il aussi pointer vers la galerie photos
  du même dimanche quand elle existe ?
- Un code à scanner affiché en fin de culte court-circuiterait la dépendance à « quelqu'un qui
  pense à coller le lien ». Techniquement trivial, humainement une habitude à tester. Non retenu
  à ce stade.

---

## 8. Journal des révisions

Ce document a changé d'avis plusieurs fois. Les erreurs sont conservées : elles disent quelles
hypothèses sont fragiles.

| Rév. | Ce qui a changé | Ce qui l'a provoqué |
|---|---|---|
| 1 | Conception initiale, D1–D7 | Audit amont + lecture du code |
| 2 | D8 : dépôt par page navigateur plutôt que scripts par OS | Contrainte macOS + Windows 11 |
| 3 | D8 : connecteur Drive côté serveur — **erreur** | Lecture hâtive de l'inventaire : « 23 sessions déposées » pris pour un maillon sain |
| 4 | D8 corrigé : agent sur le poste. D9 ajouté | Décalages de dépôt mesurés (médian 9 j, max 125 j) et poste partagé entre deux cultes |
| 5 | D10 : le mix est fabriqué, pas récupéré des `Main L/R` | Les sorties console sont réglées pour la salle — origine probable de l'écrêtage |
| 6 | 12 sources et non 18 ; archive FLAC avec purge manuelle | Comparaison des paires de canaux à trois instants |
| 7 | D11, D12 : bibliothèque publique et reprise de l'archive | Besoin de recherche par orateur, titre, thématique et période |
| 8 | **Deux chemins de dépôt et non un** : le mix à découper *et* les séquences déjà découpées (un MP3 par séquence). Recette de mixage précisée sous D10 | Précision terrain : la régie envoie soit les pistes WAV brutes pour traitement, soit directement x MP3 déjà mixés et découpés — ce second cas est le plus courant |
| 9 | **Jalonnement P1 / P1.5** : P1 ne livre que le dépôt de séquences déjà découpées ; le mix à découper et l'écran de forme d'onde passent en P1.5 | Le chemin « séquences » est celui réellement pratiqué et suffit à relancer la diffusion ; l'écran de découpage est le poste le plus coûteux du module et ne sert que le cas minoritaire |

Deux hypothèses de l'audit amont ont été invalidées par la mesure : **l'ordre fixe du déroulé**
(§3) et **la solidité du dépôt existant** (§3). Une troisième a été confirmée : la signature
sonore seule ne permet pas de segmenter.

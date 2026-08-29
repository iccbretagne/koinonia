# Spec — Garanties réellement appliquées sur les dépôts et les publications audio/média

- **Numéro** : 029
- **Statut** : Implémentée
- **Créée le** : 2026-08-29
- **Branche suggérée** : `feat/integrite-objets-audio-media`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Trois règles que Koinonia annonce appliquer ne sont aujourd'hui garanties par rien de solide :
elles reposent soit sur une **déclaration du client** que le serveur ne vérifie jamais, soit sur
une **vérification faite avant l'écriture** sans garantie que rien n'a changé entre les deux.
Elles sont regroupées ici parce qu'elles partagent ce même défaut de fond, sur la même chaîne
dépôt → publication → écoute.

**1. La limite de taille des fichiers média n'est jamais appliquée.**
Quand un membre de la Production Média dépose un visuel ou une vidéo, l'application annonce une
limite de taille et refuse un fichier annoncé au-delà. Mais cette vérification porte uniquement
sur la taille **annoncée** par le navigateur : rien n'empêche ensuite de déposer un fichier
beaucoup plus volumineux, qui sera accepté et conservé. La taille enregistrée dans Koinonia est
celle qui avait été annoncée — elle peut donc n'avoir aucun rapport avec le fichier réellement
stocké. Conséquences : l'espace de stockage consommé n'est pas maîtrisé, la limite affichée aux
utilisateurs est fictive, et les tailles affichées dans l'interface peuvent être fausses.

**2. Publier deux fois le même culte en même temps déclenche deux fois le même travail.**
Quand un culte audio est publié, Koinonia prépare les fichiers d'écoute pour chaque séquence, en
ne refaisant que ce qui a changé. Mais si deux personnes publient le même culte au même moment
(ou si quelqu'un double-clique), les deux publications peuvent chacune constater que le travail
reste à faire et le lancer en double. Le résultat produit est identique — les auditeurs entendent
le bon contenu — mais la machine refait deux fois le même calcul et la file de traitement se
remplit de travaux redondants. C'est un défaut de robustesse, pas un problème de contenu servi.

**3. Les écoutes continuent d'être comptées sur un culte dépublié.**
Quand un culte est dépublié, l'écoute est bien refusée à quiconque tente d'ouvrir un ancien lien
de partage. En revanche, le compteur d'écoutes de ce culte, lui, continue d'accepter d'être
incrémenté par le détenteur d'un ancien lien. Les statistiques d'un culte retiré de la
bibliothèque continuent donc de monter alors que plus personne ne peut réellement l'écouter, ce
qui fausse les chiffres sur lesquels s'appuient les responsables.

**Pourquoi maintenant** : les trois points sont issus de l'audit du 2026-08-29 et touchent des
fonctionnalités déjà en production. Aucun n'expose de données à une personne non autorisée, mais
tous les trois font que Koinonia se comporte différemment de ce qu'il annonce — sur la
consommation de stockage, sur la charge machine, et sur des statistiques utilisées pour décider.

## Utilisateurs concernés

- **Admin / Secrétaire / Super Admin, et tout membre habilité au dépôt média** — déposent des
  visuels et vidéos ; c'est leur limite de taille qui doit être réellement appliquée, et les
  tailles affichées dans l'interface qui doivent être exactes.
- **Admin / Secrétaire / Super Admin habilités à publier un culte audio** — publient les cultes ;
  ce sont leurs publications simultanées ou répétées qui ne doivent plus produire de travail en
  double.
- **Responsables consultant les statistiques d'écoute** (Super Admin, Admin, Secrétaire,
  Ministre, Responsable de département) — s'appuient sur des compteurs qui doivent refléter des
  écoutes réellement possibles.
- **Auditeurs disposant d'un lien de partage public** (y compris hors Koinonia) — leur expérience
  ne change pas : ils sont déjà correctement empêchés d'écouter un culte dépublié.

## Comportement attendu

### Scénario principal

**Dépôt d'un fichier média**

1. Un membre de la Production Média sélectionne un fichier et lance son dépôt.
2. Le fichier est transmis, puis Koinonia constate la taille **réellement** déposée avant de
   l'accepter.
3. Si cette taille respecte la limite, le fichier est accepté et entre normalement dans le
   circuit de revue ; la taille enregistrée et affichée est celle du fichier réel.
4. Si cette taille dépasse la limite, le dépôt est refusé avec un message explicite, et le
   fichier déposé ne reste pas stocké.

**Publication d'un culte audio**

5. Deux personnes publient le même culte au même moment (ou une personne clique deux fois).
6. La préparation des fichiers d'écoute n'est déclenchée qu'une seule fois par séquence
   concernée ; la seconde publication ne relance pas le même travail.
7. Le culte devient écoutable exactement comme aujourd'hui — le comportement observable par les
   auditeurs est inchangé.

**Comptage des écoutes**

8. Un culte est dépublié par un responsable.
9. Une personne détenant encore un ancien lien de partage tente de l'écouter : l'écoute est
   refusée (comportement actuel, inchangé).
10. Le compteur d'écoutes de ce culte n'est pas incrémenté par cette tentative.

### Scénarios alternatifs / cas limites

- **Si un fichier déposé dépasse la limite**, il doit être refusé **et** ne pas laisser de fichier
  résiduel occupant de l'espace de stockage — un refus qui conserverait le fichier ne résoudrait
  pas le problème.
- **Si la taille réellement déposée est inférieure à celle annoncée** (compression, fichier
  tronqué), le dépôt reste accepté tant que la limite est respectée, mais c'est la taille réelle
  qui est enregistrée et affichée.
- **Si le fichier attendu est introuvable au moment de la vérification** (dépôt jamais abouti,
  interrompu), la confirmation doit être refusée clairement plutôt que d'enregistrer un fichier
  qui n'existe pas.
- **Quand un culte est republié sans qu'aucune séquence n'ait changé**, aucun travail de
  préparation ne doit être déclenché — comportement actuel à préserver, la correction ne doit pas
  le remettre en cause.
- **Quand un culte est dépublié puis republié**, le comptage des écoutes redevient possible
  normalement : la règle suit le statut courant du culte, elle n'est pas définitive.
- **Si un lien de partage est révoqué** alors que le culte reste publié, le comportement actuel
  s'applique déjà et reste inchangé (écoute et comptage refusés).

## Critères d'acceptation

- [x] Un fichier média réellement déposé au-delà de la limite de taille est refusé à la
      confirmation, quelle que soit la taille annoncée au départ.
- [x] Un fichier refusé pour dépassement de taille ne reste pas stocké.
- [x] La taille enregistrée et affichée pour un fichier média accepté correspond à la taille du
      fichier réellement déposé, pas à celle annoncée.
- [x] Une confirmation de dépôt portant sur un fichier absent est refusée avec un message
      explicite.
- [x] Deux publications simultanées du même culte ne produisent pas deux préparations de fichier
      d'écoute pour une même séquence.
- [x] Une republication d'un culte dont aucune séquence n'a changé ne déclenche toujours aucune
      préparation (comportement actuel préservé).
- [x] Le compteur d'écoutes d'un culte dépublié n'est plus incrémentable, y compris via un lien
      de partage non révoqué.
- [x] Le compteur d'écoutes redevient incrémentable si le culte est republié.
- [x] L'écoute d'un culte publié via un lien valide, et son comptage, fonctionnent exactement
      comme aujourd'hui (aucune régression).

## Hors périmètre

- **La limite de taille des dépôts audio** : elle présente la même faiblesse déclarative, mais
  le mécanisme de dépôt y est différent et la contraint bien davantage en pratique. L'audit ne la
  vise pas ; à traiter séparément si le besoin s'en confirme.
- **Changer la façon dont les fichiers média sont transmis** depuis le navigateur : la correction
  doit s'appuyer sur les étapes déjà existantes du dépôt, sans imposer aux utilisateurs un
  nouveau parcours ni une nouvelle attente.
- **Revoir les valeurs des limites de taille** elles-mêmes : cette spec fait appliquer la limite
  existante, elle ne la rediscute pas.
- **Toute forme de coordination entre plusieurs instances de l'application** (verrouillage
  distribué) : la robustesse visée ici est celle de publications simultanées sur le déploiement
  actuel, pas une refonte de l'architecture d'exécution.
- **Le nettoyage rétroactif** des fichiers déjà déposés hors limite ou des tailles déjà
  incorrectes en base : cette spec empêche le problème de se reproduire ; un éventuel
  assainissement de l'existant est un travail distinct.
- **Les statistiques d'écoute elles-mêmes** (affichage, agrégation, correction rétroactive des
  compteurs déjà gonflés) : hors périmètre, seule la règle d'incrémentation change.

## Questions ouvertes

- Aucune — les trois comportements attendus sont entièrement déterminés par le comportement déjà
  en place ailleurs dans l'application (limite annoncée à l'utilisateur, idempotence déjà visée à
  la publication, refus déjà appliqué à l'écoute d'un culte dépublié).

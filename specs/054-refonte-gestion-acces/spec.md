# Spec — Refonte de la gestion des accès (ergonomie et cohérence)

- **Numéro** : 054
- **Statut** : Validée
- **Créée le** : 2026-09-26
- **Branche suggérée** : `feat/refonte-gestion-acces`
- **Issue source** : [#583](https://github.com/iccbretagne/koinonia/issues/583)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

La gestion des accès de Koinonia est aujourd'hui répartie sur plusieurs onglets organisés **par
type de rôle** (rôles par ministère, rôles transverses à l'église, STAR) plutôt que par personne.
Elle n'a pas suivi la croissance du nombre de rôles et de mécanismes d'accès :

- **Impossible de répondre simplement à « que peut faire cette personne ? »** : il faut parcourir
  plusieurs onglets pour reconstituer l'ensemble des accès d'un même individu.
- **Mur de boutons** pour les rôles transverses à l'église (jusqu'à six boutons d'attribution par
  utilisateur) : impossible de répondre simplement à « qui est comptable ? » ou à toute question
  du même type.
- **Aucune explication au moment d'attribuer un rôle** : on coche une case sans savoir ce qu'elle
  donne concrètement comme droits.
- **Des accès réels restent invisibles sur cette page** : appartenir à certains départements
  spécialisés, ou être affecté nominativement à un dossier (par exemple comme accompagnant d'une
  famille ou d'un suivi), donne des droits réels qui n'apparaissent nulle part dans la gestion des
  accès — on ne peut pas savoir, en regardant la fiche d'une personne, que ces droits existent.
- **Les rôles sont présentés à plat**, alors qu'ils recouvrent des natures différentes :
  administration de l'église dans son ensemble, responsabilité sur un périmètre (un ministère, un
  ou plusieurs départements), fonction spécialisée rattachée à une équipe.
- **Les libellés d'un même rôle divergent** d'un écran à l'autre (page d'accès, guide utilisateur,
  documentation), ce qui entretient la confusion sur qui fait quoi.

Un problème de sécurité concret découle de cette confusion : une des demandes internes de
l'application (le traitement des dossiers d'accueil de nouveaux arrivants, qui contiennent des
coordonnées personnelles et peuvent être exportés) est aujourd'hui accessible à un périmètre plus
large que ce que la documentation de l'application décrit — un rôle de responsabilité générale
(Ministre, Responsable de département) y donne accès **quel que soit son département**, alors que
la documentation dit que cet accès est réservé à l'administration de l'église et à l'équipe
dédiée à l'accueil. L'écran qui présente le lien vers cette fonctionnalité, lui, respecte bien la
restriction documentée — seul le traitement réel de la demande ne la respecte pas. Cette
incohérence entre l'intention documentée et le comportement réel doit être corrigée dans le cadre
de cette refonte, puisqu'elle illustre exactement le problème de fond (un accès réel qui ne
correspond à aucune vérité affichée nulle part).

Ce cas n'est pas nécessairement isolé : le même raisonnement défaillant — une permission large
accordée pour une raison légitime (par exemple gérer les membres, ou gérer les événements)
réutilisée ailleurs comme raccourci pour « est administrateur » — peut exister à d'autres endroits
de l'application sans que la documentation ne le signale. Cette refonte ne se limite donc pas au
seul cas des dossiers d'accueil : tout endroit où ce même raisonnement défaillant est confirmé
pendant les travaux doit être corrigé dans le même mouvement.

L'audit du RBAC mené avant le plan l'a confirmé à deux autres endroits : le suivi du parcours des
nouveaux arrivants (coordonnées, notes, suppression de dossiers) et la gestion des comptes
utilisateurs (où un Ministre ou un Responsable de département peut supprimer un compte préparé à
l'avance, y compris destiné à un administrateur — alors que l'écran correspondant est réservé à
l'Admin).

Il a aussi mis au jour un problème voisin : certains gestes sur les membres ignorent le périmètre
de responsabilité de l'appelant, alors que la consultation et la modification des fiches le
respectent. Un Ministre ou un Responsable de département peut ainsi agir sur **toute l'église**
pour : repérer et fusionner des fiches en doublon, lier ou délier un compte à une fiche, attribuer
en masse le rôle STAR, et valider ou refuser les demandes d'accès. Aucune documentation ne dit que
ces gestes doivent échapper au périmètre.

Sans cette refonte, chaque nouveau rôle ou mécanisme d'accès aggrave la situation : la page
devient chaque fois moins lisible, et l'écart entre ce que dit la documentation et ce que fait
réellement l'application peut se reproduire ailleurs sans que personne ne le remarque.

## Utilisateurs concernés

- **Super Admin / Admin** : gèrent l'ensemble des accès de l'église ou de la plateforme ; ce sont
  les principaux utilisateurs de la gestion des accès refondue.
- **Secrétaire** : gère les accès au même titre qu'Admin sur son périmètre.
- **Ministre** : attribue des rôles rattachables dans son ou ses ministères (responsable de
  département, STAR) — utilise une gestion des accès à périmètre restreint.
- **Responsable de département** : peut être consulté depuis une fiche personne comme détenteur
  d'une responsabilité, mais n'attribue pas de rôle lui-même.
- **STAR et tout autre rôle** : n'utilisent pas cette page, mais leurs accès réels (y compris
  hérités) doivent être représentés correctement dessus, puisque c'est la seule source de vérité
  sur qui a accès à quoi.

## Comportement attendu

### Scénario principal

1. Un Admin ouvre la gestion des accès et arrive sur une liste de personnes de son église,
   cherchable par nom, chacune résumée par ses accès principaux.
2. Il recherche une personne et ouvre sa fiche.
3. Sur cette fiche, il voit en un seul endroit : les rôles d'église que porte cette personne
   (chacun accompagné d'une phrase expliquant ce qu'il donne), ses responsabilités (ministère,
   département(s), y compris en tant qu'adjoint), et les accès qu'elle détient par un autre
   mécanisme (appartenance à un département spécialisé, affectation nominative à un dossier),
   présentés en lecture seule avec l'origine de chacun.
4. Il coche un rôle d'église supplémentaire directement depuis cette fiche ; le changement est
   immédiatement reflété partout où les accès de cette personne sont montrés.

### Scénarios alternatifs / cas limites

- **Si** un Admin veut savoir qui détient un rôle donné (« qui est comptable ? ») **alors** il
  peut consulter ce rôle et voir la liste de ses détenteurs, avec la possibilité d'y ajouter
  directement une personne.
- **Si** une personne ne détient aucun rôle d'église mais a un accès réel via un autre mécanisme
  (par exemple une affectation nominative à un dossier), **alors** cet accès apparaît quand même
  sur sa fiche, en lecture seule, avec son origine — elle n'est pas absente de la gestion des
  accès sous prétexte qu'elle n'a pas de rôle classique.
- **Quand** un Ministre au périmètre restreint consulte ou modifie des accès, **alors** il ne voit
  et ne peut agir que sur les personnes et rôles de son ou ses ministères, jamais sur un rôle
  transverse à l'église.
- **Si** deux écrans différents désignent le même rôle **alors** ils utilisent exactement le même
  libellé.
- **Quand** un dossier d'accueil de nouveaux arrivants est consulté ou exporté **alors** seules
  les personnes réellement habilitées d'après la documentation en vigueur (administration de
  l'église, équipe dédiée à l'accueil) y accèdent — un Ministre ou un Responsable de département
  qui n'appartient pas à cette équipe n'y accède plus du seul fait de son rôle général.

## Critères d'acceptation

- [ ] Une liste de personnes, cherchable par nom, montre pour chacune un résumé de ses accès.
- [ ] Depuis une seule fiche par personne, un administrateur habilité voit l'ensemble des accès
      réels de cette personne (rôles d'église, responsabilités, accès hérités avec leur origine)
      sans devoir consulter plusieurs écrans.
- [ ] Chaque rôle proposé à l'attribution est accompagné d'une phrase expliquant ce qu'il donne.
- [ ] Un accès hérité d'un autre mécanisme (appartenance à un département spécialisé, affectation
      nominative à un dossier) apparaît sur la fiche de la personne concernée, en lecture seule,
      avec son origine, même en l'absence de tout rôle d'église.
- [ ] Les accès peuvent aussi être consultés par rôle : liste de tous les détenteurs d'un rôle
      donné, avec la possibilité d'y ajouter quelqu'un.
- [ ] Un changement d'accès effectué depuis la fiche d'une personne est immédiatement reflété si
      on consulte ensuite ce rôle depuis la vue « par rôle », et réciproquement.
- [ ] Un même rôle est désigné par le même libellé sur tous les écrans où il apparaît (gestion
      des accès, guide utilisateur intégré, documentation).
- [ ] Un Ministre au périmètre restreint ne voit et ne peut agir que sur les personnes et les
      rôles rattachables de son ou ses ministères ; il ne voit ni ne peut attribuer un rôle
      transverse à l'église.
- [ ] L'accès aux dossiers d'accueil de nouveaux arrivants (consultation des coordonnées
      personnelles, export) est restreint aux personnes réellement habilitées d'après la
      documentation en vigueur — un Ministre ou un Responsable de département n'y accède plus par
      défaut du seul fait de son rôle général, sauf s'il appartient par ailleurs à l'équipe dédiée
      à l'accueil.
- [ ] Tout autre endroit de l'application où une permission large est utilisée comme raccourci
      pour un rôle administratif précis — sur-octroyant ainsi l'accès à des rôles qui détiennent
      cette permission pour une autre raison légitime — est corrigé pour respecter la restriction
      réellement documentée, dès qu'un tel cas est confirmé pendant les travaux — au minimum le
      suivi du parcours des nouveaux arrivants et la gestion des comptes utilisateurs.
- [ ] Les gestes sur les membres (repérage et fusion de doublons, liaison et déliaison d'un
      compte à une fiche, attribution en masse du rôle STAR, validation ou refus des demandes
      d'accès) respectent le périmètre de responsabilité de l'appelant, comme la consultation et
      la modification des fiches : un Ministre ou un Responsable de département n'agit que sur les
      membres et les demandes de son périmètre ; l'administration de l'église garde un accès
      global.

## Hors périmètre

- Créer de nouveaux rôles ou en supprimer des existants.
- Changer le processus par lequel une appartenance à un département spécialisé confère des droits
  (voir décision ci-dessous : ce mécanisme reste tel quel, seule sa **visualisation** change).
- Un moyen de demander ou d'accorder un accès temporaire aux dossiers d'accueil pour une personne
  qui n'appartient pas à l'équipe dédiée (voir décision ci-dessous).
- Refonte visuelle globale de l'application : seul l'espace de gestion des accès est concerné.
- Toute incohérence entre documentation et comportement réel qui ne relève ni de cet anti-motif
  (permission large utilisée comme raccourci de rôle administratif) ni d'un périmètre de
  responsabilité ignoré — à traiter séparément, même si elle est découverte en cours de refonte.
- Les endroits où une permission sert de raccourci pour « Admin ou Secrétaire » **sans
  sur-octroyer d'accès aujourd'hui** (la permission n'est détenue que par ces rôles) : ils sont
  signalés dans la documentation comme fragiles, mais pas corrigés.

## Décisions

- **Appartenance à un département spécialisé** : reste un mécanisme distinct des rôles d'église,
  inchangé dans son fonctionnement. La fiche d'une personne se contente de l'afficher clairement,
  en lecture seule, avec son origine — elle ne devient pas un rôle qu'on coche/décoche. Choisi
  pour ne pas risquer de casser l'automatisme existant (équipe d'accueil, captation audio,
  médias…), utilisé par plusieurs modules.
- **Découpage en deux lots** : lot 1 — ergonomie de l'écran (fiche par personne, vue par rôle),
  sans toucher au modèle de droits sous-jacent ; lot 2 — mise en cohérence du RBAC, dont la
  correction du périmètre d'accès aux dossiers d'accueil. Choisi pour livrer le correctif de
  sécurité sans attendre la fin du chantier ergonomique, plus long et plus visible côté interface.
- **Accès ponctuel aux dossiers d'accueil** : hors périmètre. Une personne qui en aurait
  ponctuellement besoin sans appartenir à l'équipe dédiée passe par cette équipe ou par un
  administrateur, qui y accède déjà. Aucun mécanisme de demande d'accès temporaire n'est ajouté
  par cette feature.
- **Portée de la correction RBAC (lot 2)** : généralisée à tout endroit confirmé où le même
  anti-motif est reproduit — pas seulement le cas des dossiers d'accueil déjà identifié. Choisi
  pour ne pas livrer un correctif de sécurité partiel alors qu'un audit du RBAC actuel est mené en
  parallèle de cette feature ; reste borné à ce seul anti-motif (voir « Hors périmètre »), pas à
  toute incohérence documentation/comportement.
- **Périmètre de responsabilité sur les gestes « membres » (lot 2)** : les quatre gestes relevés
  par l'audit (doublons et fusion, liaison de comptes, attribution en masse du rôle STAR,
  validation des demandes d'accès) entrent tous dans cette feature, et pas seulement ceux qui
  relèvent strictement de la gestion des accès. Choisi pour corriger le RBAC d'un seul coup
  plutôt que de laisser des écarts connus dans une issue à part.

## Questions ouvertes

Aucune — voir « Décisions » ci-dessus.

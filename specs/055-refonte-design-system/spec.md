# Spec — Refonte du design system

- **Numéro** : 055
- **Statut** : En cours
- **Créée le** : 2026-09-26
- **Branche** : `feat/design-system`

> Cette spec décrit **QUOI** et **POURQUOI**. Le **COMMENT** est dans `plan.md`. La référence
> visuelle (charte, tokens, composants, maquettes) est dans `docs/design-system/`.

## Contexte & problème

L'interface de Koinonia a grandi écran par écran, sans système commun : les couleurs sont écrites
en dur dans chaque page (environ 3 000 classes grises), il n'y a ni mode sombre ni état de
chargement, plusieurs contrastes sont insuffisants (texte d'erreur, bordures de champ), la
navigation mobile se limite à deux destinations plus un menu, et rien ne confirme qu'une action a
réussi. L'application est surtout utilisée sur téléphone, souvent dans l'urgence avant un culte :
chaque hésitation coûte.

## Périmètre

**Refonte visuelle et ergonomique uniquement.** Aucune fonctionnalité nouvelle côté serveur : pas
de nouvelle route d'API, pas de nouvelle donnée ni migration, pas de nouvelle règle métier ou de
permission. Chaque écran conserve ses fonctions, ses données et ses droits actuels.

## Utilisateurs concernés

Tous les rôles, sur mobile et desktop. Aucun droit ne change : un rôle voit exactement les mêmes
sections et les mêmes actions qu'avant, présentées autrement.

## Comportement attendu

1. L'application reprend la charte ICC Rennes (violet, jaune, rouge, bleu ; Montserrat ; logo aux
   plumes) avec des couleurs d'interface lisibles et une police de texte courant plus compacte.
2. Chaque utilisateur choisit Clair, Sombre ou Système dans « Mon profil » ; le choix est retenu
   par son navigateur et s'applique à tous les écrans sans flash au chargement.
3. Sur mobile, une barre du bas donne accès aux destinations principales du rôle, et « Plus »
   ouvre un panneau listant toutes les sections accessibles. Sur desktop, une sidebar regroupe
   les sections et peut se replier.
4. Une recherche de pages (« Aller à… ») permet d'atteindre n'importe quelle section accessible
   au clavier (⌘K / Ctrl K) ou depuis l'icône loupe sur mobile.
5. Chaque navigation affiche une silhouette de chargement ; chaque action de formulaire donne un
   retour visible (message de confirmation ou d'erreur).
6. Les statuts (service, demandes, suivis) portent toujours un mot et une couleur, jamais la
   couleur seule.

### Cas limites

- **Couleur propre à une église** : elle identifie l'église (pastille, filet sous la barre
  supérieure) sans colorer l'interface.
- **Page non encore redessinée** : elle reste lisible dans les deux thèmes (aucune couleur en dur
  ne subsiste à la fin de la refonte).
- **Mode recette** : le bandeau de recette reste visible en permanence.

## Critères d'acceptation

- [ ] Aucune route d'API, migration Prisma, service métier ou permission n'est ajouté ou modifié
      pour les besoins de la refonte.
- [ ] Les couleurs de l'interface passent par des tokens sémantiques ; plus aucune classe grise,
      `bg-white` ou couleur hexadécimale en dur dans `src/` hors exceptions justifiées (garde
      ESLint).
- [ ] Le thème Clair / Sombre / Système se choisit dans « Mon profil » et s'applique partout.
- [ ] Les textes atteignent un contraste de 4.5:1 dans les deux thèmes (tokens vérifiés).
- [ ] Barre du bas adaptée au rôle et panneau « Plus » sur mobile ; sidebar repliable sur desktop.
- [ ] Recherche de pages accessible au clavier et sur mobile, limitée aux sections du rôle.
- [ ] Chaque segment de route authentifié a un état de chargement.
- [ ] Les composants communs (bouton, champ, dialogue, tableau, pastille de statut, message de
      confirmation, état vide) sont réécrits sur les tokens et utilisés par les écrans.
- [ ] Logo ICC Rennes et icône d'application remplacent l'icône « PC ».
- [ ] `typecheck`, `lint`, `lint:boundaries` et `test` passent ; recette sur staging.

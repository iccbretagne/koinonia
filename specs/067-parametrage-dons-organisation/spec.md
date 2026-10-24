# Spec — Organisation de l'écran de paramétrage des dons

- **Numéro** : 067
- **Statut** : Implémentée
- **Créée le** : 2026-10-21
- **Branche suggérée** : `feat/parametrage-dons-organisation`
- **Prolonge** : [spec 065 — page « Donner » et slide](../065-page-donner/spec.md),
  [spec 066 — nom et logo de l'église](../066-nom-eglise-page-donner/spec.md)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

L'écran « Page de dons » règle deux supports : la page publique « Donner » et la slide
« Dîmes & Offrandes » projetée au culte. Avec les specs 065 et 066, il a grandi section par
section. Une revue de l'écran (ordinateur et téléphone) relève trois défauts d'organisation :

- **Les réglages de la slide sont dispersés.** Il y en a à trois endroits : le nom et le logo
  pour la slide (dans « Nom et logo de l'église »), le verset (dans « Verset et pied de page »,
  avec la mention « apparaît aussi sur la slide ») et l'adresse courte (dans une dernière section
  « Slide de projection »). L'aperçu ne montre que la page publique. Pour voir l'effet d'un
  réglage sur la slide, il faut enregistrer, quitter l'écran et ouvrir la slide.
- **Deux façons d'enregistrer coexistent sans se distinguer.** Le logo est enregistré dès son
  dépôt ou son retrait. Tout le reste attend le bouton « Enregistrer ». Rien n'indique qu'il
  reste des modifications à enregistrer, et quitter l'écran les perd sans prévenir. Un trésorier
  qui a corrigé un IBAN peut croire l'avoir publié.
- **La publication est mêlée au contenu.** L'interrupteur « Page active » partage sa carte avec
  le texte d'introduction. Rien en tête d'écran ne dit si la page est en ligne. Or c'est la
  première question de qui arrive sur l'écran : « est-ce que les gens voient la page ? ».

Le contenu, les règles d'intégrité (IBAN vérifié, alertes à la comptabilité) et les droits
restent ceux des specs 065 et 066. Seule l'organisation de l'écran change.

## Utilisateurs concernés

| Rôle | Ce qu'il peut faire |
|---|---|
| Super Admin, Admin, Secrétaire, Comptable | Paramétrer la page et la slide, comme aujourd'hui (droit de gestion des dons) |
| Autres rôles | Aucun accès à l'écran, inchangé |
| Visiteur de la page publique, assemblée | Aucun changement visible : la page et la slide s'affichent comme avant |

## Comportement attendu

### Scénario principal — vérifier et publier

1. Une Comptable ouvre « Page de dons ». En tête d'écran, un statut lui dit tout de suite si la
   page est **publiée** ou **non publiée**, tel qu'enregistré.
2. Elle complète l'IBAN. L'écran signale aussitôt qu'il y a **des modifications non
   enregistrées**, et ce signal reste visible pendant qu'elle fait défiler l'écran, sur
   ordinateur comme sur téléphone.
3. Elle publie la page. Le statut indique que la publication prendra effet à l'enregistrement
   tant qu'elle n'a pas enregistré.
4. Elle enregistre. Le signal de modifications disparaît et le statut passe à « publiée ».

### Scénario — régler la slide

1. Un Secrétaire veut préparer la slide de dimanche. Il trouve **en un seul endroit** tout ce qui
   la concerne : affichage et taille du nom, affichage du logo, verset repris sur la slide,
   adresse courte écrite sous le QR code.
2. À côté de l'aperçu de la page publique, un **aperçu de la slide** reflète ses réglages en
   direct, avant l'enregistrement, avec les mêmes règles d'ajustement que la vraie slide (rien
   ne déborde, le QR code reste carré).
3. Il enregistre, puis ouvre la slide pour la projeter : elle est identique à l'aperçu.

### Scénario — quitter avec des modifications

1. Une Admin modifie le libellé du virement, puis clique sur un autre lien du menu.
2. L'écran la prévient qu'elle va perdre des modifications non enregistrées. Elle peut rester
   sur l'écran ou partir en abandonnant ses modifications.
3. Le même avertissement apparaît si elle ferme l'onglet ou recharge la page.

### Scénarios alternatifs / cas limites

- **Le logo est déposé ou retiré pendant qu'il y a des modifications non enregistrées** :
  le logo est enregistré aussitôt, comme aujourd'hui. Les autres modifications restent en
  attente et toujours signalées. L'écran dit clairement que le logo, lui, est déjà enregistré.
- **Aucune modification** : aucun signal, aucun avertissement en quittant l'écran.
- **Modification puis retour à la valeur d'origine** : l'écran ne signale plus rien à
  enregistrer.
- **L'enregistrement échoue** (IBAN invalide, réseau) : les modifications restent signalées
  comme non enregistrées, et le statut de publication reste celui de la dernière version
  enregistrée.
- **Page jamais enregistrée** (textes proposés par défaut) : statut « non publiée ». Les textes
  par défaut ne comptent pas comme des modifications ; seule une saisie de l'utilisateur en est
  une.
- **Le verset sert aux deux supports** : il reste un seul texte, modifiable à un seul endroit
  (avec la page publique). Les réglages de la slide le montrent tel qu'il sera projeté, avec un
  accès direct à l'endroit où le modifier.
- **Téléphone** : l'aperçu de la page et l'aperçu de la slide restent consultables. Le statut de
  publication et le signal de modifications non enregistrées restent visibles sans être cachés
  par la barre de navigation du bas.
- **Page non publiée** : l'aperçu de la slide reste disponible dans l'écran de paramétrage (on
  prépare la slide avant de publier). Seule la slide plein écran reste réservée à une page
  publiée et enregistrée, comme aujourd'hui.

## Critères d'acceptation

- [x] En arrivant sur l'écran, le statut « publiée » ou « non publiée » de la page est visible
      en tête, sans faire défiler, sur ordinateur et sur téléphone.
- [x] La publication a son propre emplacement, distinct du texte d'introduction.
- [x] Changer la publication sans enregistrer indique que le changement prendra effet à
      l'enregistrement ; le statut affiché reste celui de la version enregistrée.
- [x] Tous les réglages propres à la slide (nom : affichage et taille ; logo : affichage ;
      adresse courte) sont regroupés en un seul endroit, qui montre aussi le verset projeté et
      mène en un geste à l'endroit unique où le modifier.
- [x] Un aperçu de la slide, au format 16:9, reflète les réglages en direct avant
      l'enregistrement, avec le même ajustement que la slide réelle (rien ne déborde, QR code
      carré).
- [x] Après enregistrement, la slide projetée correspond à l'aperçu.
- [x] Toute modification non enregistrée est signalée, et le signal reste visible en faisant
      défiler l'écran, sur ordinateur et sur téléphone (jamais caché par la barre du bas).
- [x] Revenir à la valeur d'origine retire le signal.
- [x] Quitter l'écran par un lien de l'application, fermer l'onglet ou recharger avec des
      modifications non enregistrées déclenche un avertissement ; sans modification, aucun.
- [x] Déposer ou retirer le logo l'enregistre aussitôt, sans enregistrer ni effacer les autres
      modifications en attente, et l'écran dit que le logo est déjà enregistré.
- [x] Un enregistrement refusé laisse les modifications signalées comme non enregistrées.
- [x] La page publique et la slide affichées au public sont inchangées par rapport aux specs 065
      et 066.

## Hors périmètre

- Nouveau contenu sur la page ou la slide (champs, sections, mise en page publique).
- Changement des droits, des règles d'intégrité, des alertes à la comptabilité ou du journal.
- Enregistrement automatique des champs au fil de la saisie.
- Brouillon conservé entre deux visites, ou historique des versions.
- Plusieurs slides ou plusieurs pages de dons par église.

## Questions ouvertes

- **Tranché — verset** : un seul champ, avec la page publique ; la slide le montre et y renvoie.
  Un texte modifiable à deux endroits ferait douter de « lequel est le bon ».
- **Tranché — publication** : elle reste enregistrée avec le reste, au bouton « Enregistrer ».
  On publie ainsi une page complète d'un seul geste, jamais une page à moitié remplie ; le statut
  dit « prendra effet à l'enregistrement » tant que ce n'est pas fait.
- Organisation de l'écran (deux onglets « Page publique » / « Slide », ou une seule colonne
  regroupée par support) : choix de conception laissé au plan, tant que les critères ci-dessus
  sont tenus.

# Spec — Logo de l'église dans l'interface

- **Numéro** : 072
- **Statut** : Implémentée
- **Créée le** : 2026-10-27
- **Branche suggérée** : `feat/logo-eglise-interface`
- **Voisine de** : [spec 066](../066-nom-eglise-page-donner/spec.md), logo de la page de dons, et
  [spec 069](../069-icone-application/spec.md), icône de l'application (toute l'instance)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.

## Contexte & problème

Dans Koinonia, la barre latérale et la barre du haut affichent le même logo pour toutes les
églises : les plumes ICC. Une église qui utilise Koinonia ne s'y reconnaît pas. De plus, une
instance qui accueille plusieurs églises ne distingue pas visuellement l'église dans laquelle on
travaille, en dehors de son nom et de sa couleur.

L'Admin de l'église doit pouvoir déposer le **logo de son église**. Ce logo s'affiche dans
l'interface pour tous ceux qui travaillent dans cette église.

## Utilisateurs concernés

- **Admin** et **Super Admin** : déposent, remplacent ou retirent le logo de l'église dans
  « Paramètres de l'église ». C'est le même droit que pour la couleur de l'église.
- **Tous les rôles** : voient le logo de l'église courante dans la barre latérale (ordinateur)
  et dans la barre du haut (mobile).

## Comportement attendu

- Dans « Paramètres de l'église », un bloc **« Logo de l'église »** propose deux emplacements :
  - **Logo pour fond clair** : c'est le logo principal ;
  - **Logo pour fond sombre** : facultatif, utilisé en thème sombre. S'il est absent, le logo
    pour fond clair s'affiche aussi en thème sombre.
- **Formats acceptés** : PNG, JPEG ou WebP, 2 Mo au plus. Le format est vérifié sur le contenu
  du fichier : un SVG ou un fichier qui n'est pas une image est refusé avec un message clair.
  Koinonia prépare l'image avant de l'afficher ; le fichier déposé n'est jamais servi tel quel.
- **Aperçu** : l'écran montre le logo tel qu'il apparaîtra sur fond clair et sur fond sombre.
- **Affichage** : dès qu'un logo pour fond clair est déposé, il remplace les plumes ICC dans la
  barre latérale et la barre du haut, pour l'église courante. Le nom « Koinonia » reste affiché à
  côté. Changer d'église change le logo.
- **Retrait** : « Retirer » remet les plumes ICC, après confirmation.
- **Traçabilité** : déposer, remplacer ou retirer un logo est inscrit dans l'historique de
  l'église, avec l'auteur et la date.

### Scénario principal

1. L'Admin d'ICC Rennes ouvre « Paramètres de l'église » et dépose le logo de l'église pour fond
   clair, puis une version blanche pour fond sombre.
2. Il vérifie les deux aperçus. Chaque logo est enregistré dès son dépôt, indépendamment du
   bouton « Enregistrer » du formulaire.
3. Tout le monde voit le logo d'ICC Rennes à la place des plumes, dans la barre latérale et dans
   la barre du haut. En thème sombre, c'est la version blanche qui s'affiche.

### Cas limites

- **Image refusée** (SVG, format inconnu, trop lourde, illisible) : message explicite, et le
  logo en vigueur ne change pas.
- **Logo très large ou très haut** : il est réduit pour tenir dans l'emplacement, sans
  déformation.
- **Personne de plusieurs églises** : elle voit le logo de l'église dans laquelle elle travaille.
- **Page de connexion** : elle garde les plumes ICC, car l'église n'y est pas encore connue.

## Critères d'acceptation

- [x] Seuls l'Admin et le Super Admin déposent, remplacent ou retirent le logo de leur église ;
  tout autre rôle est refusé, même par appel direct.
- [x] Un PNG, JPEG ou WebP de 2 Mo au plus est accepté ; un SVG, un fichier trop lourd ou
  illisible est refusé avec un message, sans changer le logo en vigueur.
- [x] Le logo pour fond clair remplace les plumes ICC dans la barre latérale et la barre du haut,
  pour l'église courante, pour tous les rôles.
- [x] En thème sombre, le logo pour fond sombre s'affiche ; sans lui, celui pour fond clair.
- [x] « Retirer » rétablit les plumes ICC.
- [x] Déposer, remplacer et retirer apparaissent dans l'historique de l'église.
- [x] Le logo d'une église ne s'affiche jamais dans une autre église.
- [x] La page de connexion garde les plumes ICC.

## Hors périmètre

- Remplacer le nom « Koinonia » par celui de l'église dans l'interface : le sélecteur d'église
  l'affiche déjà.
- Le logo de la page de dons (spec 066) et l'icône de l'application (spec 069), qui ont déjà leur
  propre réglage.
- Recadrer ou retoucher l'image dans Koinonia.
- Le logo dans les emails.

## Décisions

Décisions prises pour tenir la demande sans aller-retour, à revoir en recette si besoin :

- le logo se règle dans « Paramètres de l'église », avec le droit `church:settings` (Admin) ;
- il y a deux versions, fond clair et fond sombre, cette dernière étant facultative ;
- la page de connexion n'est pas concernée.

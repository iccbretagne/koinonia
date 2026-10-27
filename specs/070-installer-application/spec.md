# Spec — Installer Koinonia sur son appareil

- **Numéro** : 070
- **Statut** : Brouillon
- **Créée le** : 2026-10-27
- **Branche suggérée** : `feat/installer-application`
- **Prolonge** : [spec 068 — notifications natives](../068-notifications-push/spec.md), qui
  exige l'application installée sur iPhone, et [spec 069 — icône de l'application](../069-icone-application/spec.md)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Koinonia peut s'installer comme une application : une icône sur l'écran d'accueil, l'ouverture
en plein écran sans barre de navigateur, et, sur iPhone, la seule façon de recevoir les
notifications natives (spec 068).

Peu d'utilisateurs le savent, et le geste change d'un appareil à l'autre :

- sur iPhone, il passe par un menu peu visible de Safari, et il est impossible depuis Chrome ;
- sur Android, il passe par le menu du navigateur ;
- sur ordinateur, il passe par une petite icône dans la barre d'adresse.

Aujourd'hui, la seule aide tient en une phrase dans le guide et dans « Mes notifications ». Les
responsables expliquent le geste un par un sur WhatsApp, sans support à partager.

Il faut une aide **adaptée à l'appareil de la personne**, qui n'affiche que ses propres étapes,
installe en un appui quand le système le permet, et puisse **s'envoyer par un lien**, y compris à
quelqu'un qui ne s'est pas encore connecté.

## Utilisateurs concernés

Tous les rôles : Super Admin, Admin, Secrétaire, Ministre, Resp. département, STAR, Faiseur de
Disciples, Reporter, Référent soins pastoraux et Comptable. Chacun peut consulter l'aide et
installer Koinonia sur ses appareils. Aucun droit particulier n'est requis.

**Visiteurs non connectés** : ils peuvent ouvrir la page d'installation reçue par lien, sans
compte. Elle ne montre aucune donnée d'église ni de personne.

Les **responsables** (Admin, Secrétaire, Ministre, Resp. département) ont un intérêt particulier
à partager le lien à leurs équipes. Ils n'ont pas de fonction supplémentaire.

## Comportement attendu

### Page « Installer Koinonia »

Une page dédiée, à une **adresse courte et stable** (`<adresse de Koinonia>/installer`).
Elle est accessible **avec ou sans connexion**.

La page **reconnaît l'appareil et le navigateur** et n'affiche en premier que les étapes qui
s'appliquent. Les autres situations restent accessibles sous « Autre appareil ? ».

| Situation détectée | Ce que montre la page |
|---|---|
| **iPhone ou iPad, dans Safari** | Les 3 étapes illustrées : toucher Partager, choisir « Sur l'écran d'accueil », valider avec « Ajouter ». Une mention rappelle que c'est indispensable pour recevoir les notifications sur iPhone. |
| **iPhone ou iPad, dans un autre navigateur** (Chrome, Firefox, appli WhatsApp ou Facebook…) | « Ouvrez cette page dans Safari » : un bouton copie le lien et la page explique comment l'ouvrir dans Safari. |
| **Android, navigateur compatible** (Chrome, Edge, Samsung Internet) | Un bouton **« Installer Koinonia »** qui ouvre directement la fenêtre d'installation du téléphone. Si elle n'est pas disponible, la page montre le chemin par le menu du navigateur. |
| **Android, navigateur intégré à une autre application** (WhatsApp, Facebook…) | « Ouvrez cette page dans Chrome », avec un bouton qui copie le lien. |
| **Ordinateur, navigateur compatible** (Chrome, Edge) | Le bouton « Installer Koinonia » si le navigateur le permet, sinon l'emplacement de l'icône d'installation dans la barre d'adresse. |
| **Ordinateur, navigateur non compatible** (Firefox, Safari sur Mac selon la version) | Un message clair : l'installation n'est pas possible dans ce navigateur, Koinonia reste utilisable normalement ; la page suggère Chrome ou Edge, ou bien le téléphone. |
| **Déjà dans l'application installée** | « Koinonia est déjà installée sur cet appareil », avec un lien vers « Mes notifications » pour activer les notifications. |

La page montre aussi :

- **un QR code** de son adresse, pour passer de l'ordinateur au téléphone. Il n'est montré qu'aux
  personnes sur ordinateur, sur téléphone il ne servirait à rien ;
- **« Partager ce lien »** : le partage du téléphone (WhatsApp, SMS…) quand il est disponible,
  sinon la copie du lien, avec un message d'accompagnement court ;
- **les bénéfices**, en une ou deux lignes : ouverture directe depuis l'icône, plein écran,
  notifications.

Un visiteur non connecté trouve en bas de page un lien « Se connecter ».

### Carte d'invitation sur l'Accueil

Sur l'Accueil, une carte **« Installez Koinonia sur votre appareil »** s'affiche seulement si
toutes ces conditions sont réunies :

- l'appareil permet l'installation ;
- Koinonia n'y est pas déjà ouverte comme application installée ;
- la personne n'a pas masqué la carte récemment.

Elle mène à la page d'installation, ou installe directement en un appui quand le système le
permet.

Un bouton **« Plus tard »** masque la carte sur cet appareil pendant **30 jours**. Elle revient
ensuite, tant que Koinonia n'est pas installée.

### Points d'entrée

La page d'installation est atteignable :

- depuis le **menu du compte** : « Installer l'application » ;
- depuis le **guide utilisateur** ;
- depuis **« Mes notifications »**, quand l'appareil exige l'installation pour activer les
  notifications (iPhone), à la place de la phrase actuelle ;
- depuis la **recherche** (⌘K / Ctrl K), avec « installer ».

### Scénario principal

1. Une responsable de département veut que son équipe reçoive les rappels de service sur
   téléphone. Elle ouvre le menu du compte, choisit « Installer l'application », puis « Partager
   ce lien », et l'envoie dans le groupe WhatsApp de l'équipe.
2. Un STAR sur iPhone touche le lien dans WhatsApp, qui s'ouvre dans le navigateur intégré à
   WhatsApp. La page lui dit d'ouvrir le lien dans Safari ; il copie le lien et le colle dans
   Safari.
3. Dans Safari, la page montre les 3 étapes illustrées. Il ajoute Koinonia à l'écran d'accueil.
4. Il ouvre Koinonia depuis l'icône et se connecte. La page « Installer » indique désormais que
   l'application est installée et l'envoie vers « Mes notifications », où il active les
   notifications.
5. Une autre STAR, sur Android dans Chrome, ouvre le même lien, touche « Installer Koinonia » et
   valide dans la fenêtre du téléphone : l'icône apparaît sur son écran d'accueil.

### Scénarios alternatifs / cas limites

- **Ordinateur** : la page montre le QR code. Le téléphone le scanne et arrive sur la même page,
  avec les étapes de son propre système.
- **Le système refuse ou l'utilisateur annule** la fenêtre d'installation : rien ne change, et la
  page garde le bouton et les étapes manuelles.
- **Détection incertaine** (navigateur inconnu, appareil masqué) : la page montre les étapes
  manuelles les plus probables et propose « Autre appareil ? » pour choisir soi-même.
- **iPad présenté comme un Mac** par Safari : il doit être reconnu comme iPad et recevoir les
  étapes iPhone/iPad.
- **Application installée puis désinstallée** : la carte d'Accueil et la page proposent à nouveau
  l'installation.
- **Carte masquée sur un appareil** : elle reste visible sur les autres appareils de la personne
  où Koinonia n'est pas installée.
- **Visiteur non connecté** : la page fonctionne entièrement, sans données personnelles ni
  d'église, et ne propose ni « Mes notifications » ni la carte d'Accueil.
- **Instance avec une icône personnalisée** (spec 069) : les illustrations et l'aperçu de la page
  montrent l'icône en vigueur.

## Critères d'acceptation

- [ ] La page d'installation s'ouvre à une adresse courte et stable, connecté ou non, sans
  montrer de donnée d'église ni de personne.
- [ ] Sur iPhone ou iPad dans Safari, la page montre les 3 étapes illustrées et rappelle que
  l'installation est nécessaire pour les notifications.
- [ ] Sur iPhone ou iPad dans un autre navigateur ou dans une application (WhatsApp…), la page
  demande d'ouvrir le lien dans Safari et permet de copier le lien.
- [ ] Un iPad que Safari présente comme un Mac reçoit les étapes iPad.
- [ ] Sur Android et sur ordinateur, quand le navigateur le permet, un bouton « Installer
  Koinonia » ouvre la fenêtre d'installation du système ; sinon, les étapes manuelles s'affichent.
- [ ] Sur Android dans le navigateur intégré d'une application, la page demande d'ouvrir le lien
  dans Chrome.
- [ ] Sur un navigateur qui ne permet pas l'installation, la page le dit clairement et propose
  une alternative.
- [ ] Ouverte depuis l'application installée, la page indique que Koinonia est déjà installée et
  mène vers « Mes notifications ».
- [ ] « Autre appareil ? » donne accès aux étapes de toutes les situations.
- [ ] Sur ordinateur, un QR code mène à la page d'installation ; il n'est pas affiché sur
  téléphone.
- [ ] « Partager ce lien » ouvre le partage du téléphone, ou copie le lien à défaut.
- [ ] Sur l'Accueil, la carte d'invitation n'apparaît que si l'appareil permet l'installation et
  que Koinonia n'y est pas ouverte comme application installée.
- [ ] « Plus tard » masque la carte sur cet appareil pendant 30 jours, sans la masquer sur les
  autres appareils.
- [ ] La page est atteignable depuis le menu du compte, le guide, « Mes notifications » (sur
  iPhone non installé) et la recherche.
- [ ] Les illustrations montrent l'icône de l'application en vigueur.

## Hors périmètre

- Publier Koinonia sur l'App Store ou le Google Play Store.
- Installer à la place de l'utilisateur, ou forcer l'installation : le système garde toujours la
  main.
- Mesurer qui a installé l'application, ou relancer les personnes qui ne l'ont pas fait.
- Des instructions pour des appareils hors iPhone, iPad, Android et ordinateur (montre, télévision,
  liseuse).
- Des captures d'écran propres à chaque version d'iOS ou d'Android : les illustrations restent
  génériques.
- Traduire la page dans une autre langue que le français.
- Envoyer le lien automatiquement par email ou notification : c'est l'objet de la spec 071
  (messages système).

## Questions ouvertes

- Aucune. Décisions prises avec l'utilisateur :
  - la page est accessible sans connexion pour être envoyée avant la première connexion ;
  - la carte d'Accueil se masque pour 30 jours.

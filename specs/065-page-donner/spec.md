# Spec — Page publique « Donner » et slide de projection

- **Numéro** : 065
- **Statut** : Brouillon
- **Créée le** : 2026-10-18
- **Branche suggérée** : `feat/page-donner`
- **Maquettes** : page « Donner à ICC Rennes » et slide « Dîmes & Offrandes », conçues hors de
  Koinonia (fichiers HTML transmis le 2026-10-18, non versionnés : ils contiennent des
  coordonnées réelles). Elles fixent le contenu et la hiérarchie, pas l'apparence : la page suit
  le design system de Koinonia.

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Pendant le culte, le moment des dîmes et offrandes s'appuie sur une slide projetée. Les fidèles
qui veulent donner autrement qu'en espèces ont besoin de trois informations : le lien du don en
ligne, les coordonnées bancaires pour un virement, et la marche à suivre sur place.

Aujourd'hui, ces informations sont recopiées à la main dans plusieurs supports : slides, messages,
documents imprimés. Cela pose quatre problèmes :

1. **Plusieurs copies d'une même information.** Quand l'IBAN ou le lien de don en ligne change, il
   faut retrouver et corriger chaque support. Une copie oubliée envoie les fidèles vers de
   mauvaises coordonnées.
2. **Un IBAN projeté ne sert à rien.** Personne ne recopie 27 caractères debout, depuis le fond de
   la salle. Le virement se prépare chez soi, sur son téléphone, avec un texte copiable.
3. **Le nom est souvent oublié dans le libellé du virement.** Sans lui, le don ne peut être
   rattaché à personne ni donner lieu à un reçu fiscal.
4. **Rien n'est prévu pour les autres églises.** Chaque église devrait refaire ses propres
   supports.

Une page de dons publique, propre à chaque église et tenue à jour dans Koinonia, devient la seule
référence. La slide projetée ne porte plus que l'essentiel et un QR code vers cette page.

Ces coordonnées font circuler de l'argent. Une page publique qui affiche un IBAN est une cible :
remplacer l'IBAN détournerait les dons. **L'intégrité des coordonnées est donc une exigence de
premier rang.** Elle passe par des droits d'édition restreints, la traçabilité de chaque
modification et l'alerte immédiate de la comptabilité.

## Utilisateurs concernés

- **Visiteur, sans compte** : consulte la page « Donner » d'une église, copie les coordonnées
  bancaires et suit le lien de don en ligne.
- **Admin, Secrétaire, Comptable** de l'église, et **Super Admin** : paramètrent la page de leur
  église, l'activent ou la désactivent, et téléchargent la slide de projection.
- **Ministre, Resp. département, STAR, Faiseur de Disciples, Reporter, Référent soins
  pastoraux** : aucun accès au paramétrage. Comme tout visiteur, ils consultent la page publique.
- **Comptabilité de l'église** (adresses comptables configurées dans les paramètres de l'église) :
  reçoit une alerte à chaque modification des coordonnées de paiement.

## Comportement attendu

### Contenu de la page publique

La page présente, dans cet ordre, uniquement les sections activées par l'église :

1. **En-tête** : nom de l'église, titre « Donner », phrase d'introduction (dîmes, offrandes et
   dons, à tout moment depuis son téléphone).
2. **Don en ligne** : courte explication (don ponctuel ou mensuel, paiement sécurisé), bouton
   principal vers le service de don en ligne de l'église, note sous le bouton (moyens acceptés,
   par exemple « Carte bancaire · prélèvement automatique possible »). Le lien s'ouvre dans un
   nouvel onglet.
3. **Virement bancaire** : bénéficiaire, IBAN, BIC et libellé conseillé. Chaque ligne a un bouton
   « Copier ». Un encadré rappelle de remplacer « Prénom Nom » par son nom dans le libellé, faute
   de quoi le don ne pourra être rattaché ni donner lieu à un reçu fiscal.
4. **Sur place** : chèques (avec l'ordre à indiquer) et espèces sont déposés dans l'enveloppe
   remise par l'accueil. Il faut inscrire son nom sur l'enveloppe pour recevoir un reçu fiscal.
5. **Reçu fiscal** : texte rédigé par l'église, par exemple le taux de réduction d'impôt et un
   exemple chiffré. Cette section est désactivée par défaut, car elle dépend du statut juridique
   de chaque église.
6. **Verset** : citation et référence.
7. **Pied de page** : adresse email de contact pour une question sur un don ou un reçu, adresse
   du lieu de culte, compte de réseau social.

### Scénario principal — un fidèle donne par virement

1. Pendant le culte, la slide « Dîmes & Offrandes » est projetée.
2. Le fidèle scanne le QR code, ou tape l'adresse affichée sous le QR code.
3. La page « Donner » de son église s'ouvre sur son téléphone, sans connexion.
4. Il appuie sur « Copier » à côté de l'IBAN. Le bouton confirme « Copié ».
5. Il copie le libellé conseillé, colle les deux dans son application bancaire et y remplace
   « Prénom Nom » par son nom.

### Scénario — une Comptable met la page en place

1. La Comptable ouvre le paramétrage de la page « Donner » de son église.
2. Elle renseigne le lien de don en ligne, le bénéficiaire, l'IBAN, le BIC et le libellé
   conseillé, ainsi que les textes des autres sections. Elle active les sections voulues.
3. Pendant la saisie, un aperçu montre la page telle que les visiteurs la verront.
4. Elle saisit un IBAN avec une faute de frappe. L'enregistrement est refusé avec un message
   clair, et rien n'est publié.
5. Elle corrige, enregistre et active la page.
6. La page est accessible publiquement à l'adresse de son église. La comptabilité reçoit une
   alerte : coordonnées de paiement définies, par qui, quand.
7. L'historique des modifications de l'église garde la trace de l'enregistrement.

### Scénario — la slide de projection

1. Depuis le paramétrage, une personne habilitée ouvre l'aperçu de la slide, au format
   projection 16:9.
2. La slide affiche :
   - le nom de l'église et le titre « Dîmes & Offrandes » ;
   - un grand QR code menant à la page « Donner » ;
   - l'adresse de la page en gros caractères, lisible du fond de la salle ;
   - un rappel par moyen de don : virement (« IBAN et libellé sur <adresse> »), chèque (ordre à
     indiquer), espèces (enveloppes auprès de l'accueil) ;
   - le verset.
3. L'IBAN n'apparaît **jamais** sur la slide.
4. Elle télécharge la slide en image haute définition, prête à intégrer au support de
   projection du culte.

### Scénario — l'adresse courte personnalisée (optionnelle)

1. L'église dispose d'une adresse courte à elle, par exemple « dons.monéglise.fr », redirigée
   vers sa page « Donner ».
2. Une personne habilitée la renseigne dans le paramétrage.
3. La slide affiche cette adresse et son QR code y mène.
4. Sans adresse courte, la slide affiche l'adresse de la page dans Koinonia et son QR code y
   mène.

### Scénarios alternatifs / cas limites

- **Page désactivée ou jamais configurée** : l'adresse publique affiche un message neutre (« Cette
  page n'est pas disponible »), sans aucune coordonnée. La slide ne peut pas être téléchargée
  tant que la page n'est pas active.
- **Église inexistante** (adresse erronée) : même message neutre, sans révéler si l'église existe.
- **Section vide** : une section activée dont les informations obligatoires manquent ne peut pas
  être enregistrée. Par exemple, le virement exige au moins un bénéficiaire et un IBAN, et le don
  en ligne exige un lien.
- **Lien de don en ligne** : seule une adresse web sécurisée (https) est acceptée.
- **IBAN** : vérifié (format et clé de contrôle) à l'enregistrement, puis affiché groupé par
  quatre caractères. L'espacement saisi n'a pas d'importance, et un IBAN copié se colle sans
  espaces superflus dans une application bancaire.
- **Copie impossible** (navigateur qui refuse le presse-papiers) : le texte est sélectionné pour
  une copie manuelle et le bouton l'indique.
- **Modification des coordonnées de paiement** (IBAN, BIC, bénéficiaire, lien de don en ligne) :
  l'alerte part immédiatement vers les adresses comptables de l'église. Elle précise ce qui a
  changé (ancienne et nouvelle valeur), qui l'a fait et quand. Une modification qui ne touche
  aucune de ces coordonnées (verset, textes, contact) est tracée dans l'historique, sans
  alerte.
- **Aucune adresse comptable configurée** : la modification reste possible. Le paramétrage
  signale que l'alerte ne pourra être envoyée à personne et invite à configurer une adresse.
  [À CLARIFIER: dans ce cas, prévenir aussi les Admins de l'église par notification ?]
- **Désactivation de la page** : tracée dans l'historique et signalée à la comptabilité, comme
  une modification des coordonnées.
- **Accès au paramétrage sans droit** (Ministre, STAR…) : refusé, comme toute page réservée.
- **Plusieurs églises** : chaque église a sa propre page, son propre paramétrage et sa propre
  slide. Rien n'est partagé entre églises.
- **Thème** : la page suit le design system de Koinonia, en clair comme en sombre, et reste
  utilisable sur un petit téléphone (largeur d'environ 320 px). La slide est toujours produite
  dans un rendu adapté à la projection, quel que soit le thème de la personne qui la télécharge.

## Critères d'acceptation

- [ ] La page « Donner » d'une église est accessible sans connexion à une adresse publique propre
      à l'église.
- [ ] Seules les sections activées s'affichent, dans l'ordre décrit plus haut.
- [ ] Chaque coordonnée bancaire (bénéficiaire, IBAN, BIC, libellé) a un bouton « Copier » qui
      copie la valeur et confirme la copie. À défaut, la valeur est sélectionnée.
- [ ] Le rappel « remplacer Prénom Nom par son nom » est visible dans la section virement.
- [ ] La section « Sur place » indique que chèques et espèces se déposent dans l'enveloppe remise
      par l'accueil, nom inscrit dessus.
- [ ] Une page désactivée, non configurée ou d'une église inexistante n'affiche aucune
      coordonnée, avec le même message dans les trois cas.
- [ ] Seuls Admin, Secrétaire, Comptable et Super Admin de l'église accèdent au paramétrage.
      Tout autre rôle est refusé.
- [ ] Un IBAN invalide (format ou clé de contrôle) est refusé à l'enregistrement, avec un message
      explicite.
- [ ] Un lien de don en ligne qui n'est pas en https est refusé.
- [ ] Une section activée sans ses informations obligatoires ne peut pas être enregistrée.
- [ ] Chaque modification est inscrite dans l'historique des modifications de l'église (qui,
      quand, quoi).
- [ ] Toute modification de l'IBAN, du BIC, du bénéficiaire ou du lien de don en ligne, ainsi que
      toute désactivation, envoie une alerte aux adresses comptables de l'église. L'alerte
      indique l'ancienne et la nouvelle valeur, l'auteur et la date.
- [ ] Une modification qui ne touche pas ces coordonnées n'envoie pas d'alerte.
- [ ] Le paramétrage montre un aperçu fidèle de la page publique.
- [ ] La slide 16:9 affiche le titre, un QR code vers la page, l'adresse lisible, les trois
      moyens de don et le verset, mais jamais l'IBAN.
- [ ] La slide se télécharge en image haute définition, uniquement si la page est active.
- [ ] Avec une adresse courte renseignée, la slide l'affiche et son QR code y mène. Sans adresse
      courte, la slide affiche l'adresse de la page dans Koinonia.
- [ ] La page publique respecte le design system de Koinonia (thèmes clair et sombre) et
      s'utilise sans défilement horizontal sur un écran de 320 px.
- [ ] La page et le paramétrage d'une église ne montrent jamais les données d'une autre église.

## Hors périmètre

- **Paiement dans Koinonia.** La page renvoie vers le service de don en ligne de l'église.
  Koinonia n'encaisse rien, ne stocke aucun moyen de paiement et ne voit passer aucun don.
- **Suivi des dons et reçus fiscaux.** Koinonia n'enregistre pas les dons reçus et n'émet aucun
  reçu fiscal. La page explique seulement comment en obtenir un.
- **Mise en place de l'adresse courte.** Réserver le nom de domaine et le rediriger vers la page
  relève de l'église et de son hébergement. Koinonia se contente de l'afficher sur la slide.
- **Plusieurs services de don en ligne** sur la même page : un seul lien par église.
- **Plusieurs comptes bancaires** (par exemple un compte pour la dîme et un autre pour un projet) :
  un seul jeu de coordonnées par église.
- **Contenu libre** (texte mis en forme, images, sections ajoutées par l'église) : les sections
  sont fixes, seuls leurs textes et leur activation se paramètrent.
- **Traduction** de la page dans d'autres langues.
- **Statistiques de consultation** de la page ou de scans du QR code.
- **Génération du support de projection complet** du culte : seule la slide « Dîmes & Offrandes »
  est produite.

## Questions ouvertes

- [À CLARIFIER: si l'église n'a aucune adresse comptable configurée, faut-il aussi prévenir les
  Admins de l'église par notification, en plus du signalement dans le paramétrage ?]
- [À CLARIFIER: la slide doit-elle seulement se télécharger en image, ou aussi s'afficher en plein
  écran pour être projetée directement depuis un navigateur ?]
- Décidé le 2026-10-18 : édition par Admin, Secrétaire, Comptable (et Super Admin) ; chèques et
  espèces dans l'enveloppe remise par l'accueil ; design system de Koinonia ; adresse courte
  optionnelle.
- Libellés par défaut proposés à une nouvelle église (introduction, note du don en ligne, verset)
  : repris des maquettes, modifiables. Le texte du reçu fiscal n'a pas de valeur par défaut, car
  il dépend du statut de chaque église.

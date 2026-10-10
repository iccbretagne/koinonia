# Spec — Désistement depuis une période d'indisponibilité

- **Numéro** : 062
- **Statut** : Brouillon
- **Créée le** : 2026-10-10
- **Branche suggérée** : `feat/desistement-periode`
- **Origine** : issue #673, suite de la spec 061 (« Je ne peux plus » et remplacements, #612 lot 3)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

La spec 061 permet à un STAR planifié de **se désister** d'un service : il quitte le planning,
le service apparaît « à remplacer » et son responsable reçoit aussitôt les remplaçants
possibles. Ce désistement se déclenche par « Je ne peux plus » dans « Mon planning », ou par une
réponse « Pas disponible » à un événement sur l'écran de disponibilités.

Un troisième chemin, pourtant prévu par la spec 061, a été reporté : la **période
d'indisponibilité** (« Pas disponible du … au … » sur l'écran de disponibilités, ou déclaration
d'une absence depuis l'écran des indisponibilités). Aujourd'hui, une période qui couvre un
service où le STAR est planifié :

- **le laisse au planning** : la place n'apparaît pas « à remplacer » ;
- envoie une simple alerte « Conflit planning / absence », **sans piste pour remplacer** ;
- contredit la règle annoncée par la spec 061 : « une seule règle, quel que soit le chemin
  emprunté ».

Un STAR qui part trois semaines en congé doit donc, pour que ses responsables puissent le
remplacer, se désister service par service, ou compter sur eux pour lire l'alerte et recomposer
la grille à la main.

On veut qu'une période d'indisponibilité produise **exactement les mêmes effets** qu'un
désistement sur chacun des services qu'elle couvre, et que ces désistements suivent la vie de la
période (annulation, raccourcissement, prolongation).

**Constat préalable** : les remplaçants qu'on peut désigner en déclarant une absence (spec 013)
sont des **relais de responsabilité** : ils ne sont proposés que pour l'absence d'un responsable
de département ou d'un ministre, et prennent le relais de son rôle de responsable, pas de ses
services. Ils sont indépendants des désistements de service : les deux coexistent sans
interaction.

## Utilisateurs concernés

- **STAR** : déclare une période d'indisponibilité ; s'il est planifié sur des services couverts,
  il en est retiré après un avertissement, et ses responsables sont prévenus pour le remplacer.
  Il peut annuler ou modifier sa période, ce qui annule les désistements devenus sans objet.
- **Resp. département, Ministre** : reçoivent, pour chaque service couvert, la notification de
  désistement avec les remplaçants possibles (spec 061), à la place de l'alerte de conflit. Ils
  peuvent aussi déclarer une période **pour** un STAR de leur périmètre (comme aujourd'hui), avec
  les mêmes effets.
- **Admin, Secrétaire, Super Admin** : déclarent ou gèrent des périodes pour les STAR de l'église
  (comme aujourd'hui), avec les mêmes effets.
- Faiseur de Disciples, Reporter, Référent soins pastoraux, Comptable : pas concernés au-delà de
  leurs propres services éventuels de STAR.

## Comportement attendu

### Scénario principal — un STAR déclare une période

1. Paul est planifié « en service » chez les Choristes les dimanches 12 et 19, et « remplaçant »
   chez les Musiciens le 19. La date limite de planification de ces trois services n'est pas
   passée.
2. Sur l'écran de disponibilités, Paul choisit « Pas disponible du 10 au 20 ».
3. Avant de valider, l'écran l'avertit : « Tu es planifié le 12 (Choristes), le 19 (Choristes) et
   le 19 (Musiciens) : tes responsables vont devoir te remplacer. »
4. Paul confirme. La période est enregistrée, et Paul est **désisté de ses trois services** : un
   désistement distinct par service, chacun avec exactement les effets de « Je ne peux plus »
   (service retiré du planning et marqué « à remplacer », notification immédiate du responsable
   du département avec les remplaçants possibles, relance 48 h avant, annulation possible par
   Paul tant que personne n'a été choisi).
5. Marie, responsable des Choristes, reçoit deux notifications de désistement (le 12 et le 19)
   et Jean, responsable des Musiciens, une. Aucun d'eux ne reçoit l'alerte « Conflit planning /
   absence » pour ces services. Ils reçoivent toujours la notification « Absence déclarée »,
   comme aujourd'hui.
6. Dans « Mon planning », Paul voit ses trois services « Désisté — en attente de remplacement ».

### Scénario — un responsable déclare pour un STAR

1. Marie déclare depuis l'écran des indisponibilités une période du 10 au 20 pour Paul, qui l'a
   prévenue par téléphone.
2. Avant de valider, l'écran avertit Marie que Paul est planifié sur les services couverts et
   qu'ils deviendront « à remplacer ».
3. Les désistements sont créés comme si Paul les avait faits lui-même. Paul en est informé.
   Marie, destinataire de la notification pour ses Choristes, arrive directement sur l'écran du
   service à remplacer.

### Scénario — annulation ou modification de la période

1. Paul annule sa période du 10 au 20. Le service du 12 a déjà été pourvu par Léa ; celui du 19
   chez les Choristes est toujours à remplacer ; celui des Musiciens a été clos par Jean (« Ne pas
   remplacer »).
2. Le désistement du 19 chez les Choristes, **encore en attente**, est annulé : Paul reprend sa
   place avec son statut d'origine, et Marie en est prévenue (comme pour « Annuler mon
   désistement »).
3. Le service du 12 reste à Léa ; la décision de Jean reste acquise. Paul en est informé : il
   n'est pas replacé sur ces services.
4. **Raccourcir** la période a le même effet sur les services qui ne sont plus couverts.
   **Prolonger** la période, ou l'étendre à d'autres départements, crée les désistements des
   nouveaux services couverts, après le même avertissement.

### Scénarios alternatifs / cas limites

- **Date limite passée** : pour un service couvert dont la date limite de planification est
  passée, rien ne change : pas de désistement, Paul reste au planning, et l'alerte « Conflit
  planning / absence » est envoyée comme aujourd'hui, pour ces seuls services. Une même période
  peut donc produire des désistements pour certains services et une alerte de conflit pour
  d'autres.
- **Événement déjà commencé** : un service passé ou en cours n'est jamais touché.
- **Période limitée à certains départements** : seuls les services des départements visés sont
  désistés ; un service dans un autre département reste en place.
- **Désistement déjà en attente** : si Paul s'était déjà désisté du 12 par « Je ne peux plus »,
  la période ne crée pas de second désistement pour ce service. Annuler la période **n'annule
  pas** ce désistement, que Paul avait fait de lui-même indépendamment.
- **Le STAR annule un désistement issu de la période** : Paul peut, comme pour tout désistement,
  reprendre un service précis tant que personne n'a été choisi. Sa période reste enregistrée ; le
  service repris ne sera pas désisté à nouveau par la période, sauf si celle-ci est modifiée
  ensuite pour le couvrir encore.
- **Aucun service planifié couvert** : pas d'avertissement, la période s'enregistre comme
  aujourd'hui.
- **Absence d'un responsable** : si Paul est aussi responsable de département et désigne un
  relais de responsabilité, ce relais est prévenu comme aujourd'hui ; ses éventuels services de
  STAR sont désistés indépendamment.
- **Le responsable qui déclare est aussi le destinataire** : il reçoit quand même la notification
  de désistement, qui le mène à l'écran de remplacement.
- **Périodes déjà enregistrées** : les périodes déclarées avant la mise en service ne sont pas
  rejouées ; seules une nouvelle déclaration ou une modification déclenchent la règle.

## Critères d'acceptation

- [ ] Une période d'indisponibilité, déclarée depuis l'écran de disponibilités ou depuis l'écran
      des indisponibilités, par le STAR ou par un tiers autorisé, crée un désistement distinct
      pour chaque service planifié couvert (en service, en service + débrief, remplaçant) dont la
      date limite de planification n'est pas passée.
- [ ] Chacun de ces désistements a les mêmes effets qu'un « Je ne peux plus » : retrait du
      planning, service « à remplacer » dans la grille, notification du responsable (à défaut du
      ministre) avec les remplaçants possibles, relance 48 h avant, annulation par le STAR tant
      qu'aucun remplaçant n'a été choisi.
- [ ] Avant validation, le déclarant est averti des services qui deviendront « à remplacer » ;
      sans service couvert, aucun avertissement.
- [ ] L'alerte « Conflit planning / absence » n'est plus envoyée pour les services transformés en
      désistement ; elle l'est toujours pour les services couverts après leur date limite.
- [ ] La notification « Absence déclarée » est envoyée comme aujourd'hui.
- [ ] Une période déclarée par un tiers informe le STAR de ses services retirés.
- [ ] Annuler une période annule ses désistements encore en attente (STAR replacé avec son statut
      d'origine, responsable prévenu) ; ceux déjà pourvus ou clos restent inchangés et le STAR en
      est informé.
- [ ] Raccourcir une période (dates ou départements) annule les désistements en attente des
      services qui ne sont plus couverts ; la prolonger crée ceux des nouveaux services couverts.
- [ ] Une période ne crée jamais de second désistement pour un service déjà désisté, et son
      annulation n'annule pas un désistement fait indépendamment par « Je ne peux plus » ou une
      réponse « Pas disponible ».
- [ ] Les relais de responsabilité désignés pour l'absence d'un responsable fonctionnent comme
      aujourd'hui, sans interaction avec les désistements.
- [ ] Les notifications respectent les préférences de notification (in-app toujours, email selon
      « Planning et service »).
- [ ] L'avertissement est utilisable sur mobile.

## Hors périmètre

- La reprise des périodes déjà enregistrées avant la mise en service.
- Toute modification des relais de responsabilité (spec 013).
- L'échange entre deux STAR validé par le responsable (lot ultérieur de #612).
- Les absences « sur événements précis », qui ne se créent plus depuis la spec 058 (remplacées
  par la réponse « Pas disponible », déjà couverte par la spec 061).

## Questions ouvertes

- Aucune bloquante : périmètre (toutes les périodes, quel que soit le déclarant), sort des
  désistements à l'annulation ou à la modification (annulés s'ils sont en attente) et
  remplacement de l'alerte de conflit ont été tranchés le 2026-10-10.

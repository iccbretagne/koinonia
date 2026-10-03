# Spec — Accompagnants déclarés du suivi pastoral

- **Numéro** : 056
- **Statut** : Implémentée
- **Créée le** : 2026-10-01
- **Branche suggérée** : `feat/accompagnants-declares`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Quand une demande de rendez-vous pastoral ou un suivi de nouveau converti est confié, le choix de
l'accompagnant se fait entre deux groupes : les profils pastoraux (pasteurs, bergers… créés un par
un) et les membres de l'équipe MSDP.

Ce second groupe est **implicite** : toute personne appartenant à un département MSDP y figure
automatiquement. Deux problèmes remontés par les utilisateurs :

- **Trop large** : tous les membres du MSDP ne sont pas en situation d'accompagner (nouveaux
  arrivés dans l'équipe, personnes en appui logistique…). Le référent doit se souvenir de qui peut
  l'être, sans aide de l'application, avec un risque d'erreur sur un sujet sensible.
- **Trop étroit** : certains STAR **hors du MSDP** accompagnent effectivement des personnes (un
  responsable d'un autre ministère, un STAR expérimenté…). Ils ne peuvent aujourd'hui être choisis
  que si un profil pastoral est créé pour eux, ce qui ne correspond pas à leur rôle.

## Utilisateurs concernés

- **Référent soins pastoraux, Admin, Super Admin** (ceux qui confient les demandes) : ajustent la
  liste des accompagnants possibles de leur église (exclure un membre du MSDP, ajouter un STAR hors
  MSDP) et choisissent parmi eux.
- **STAR déclaré accompagnant** (qu'il soit ou non membre du MSDP) : peut se voir confier une
  demande ou un suivi, et la traite comme un accompagnant aujourd'hui.
- **Secrétaire** (`care:view`) : voit qui accompagne quoi, ne modifie pas la liste.
- **Autres rôles** : aucun changement.

## Comportement attendu

### Scénario principal

Règle : un STAR ayant un compte est **accompagnant possible** s'il est membre d'un département MSDP
et n'en a pas été exclu, **ou** s'il a été ajouté nominativement.

1. Le référent ouvre les paramètres du suivi pastoral et y trouve une section « Accompagnants ».
2. Il y voit deux groupes :
   - **Équipe MSDP** : tous les membres du MSDP ayant un compte, ajoutés automatiquement, chacun
     marqué « accompagnant » ou « exclu » ;
   - **Ajoutés hors MSDP** : les STAR ajoutés nominativement, avec leurs départements.
3. Il exclut un membre du MSDP qui ne doit pas accompagner (et peut le réintégrer).
4. Il ajoute un STAR hors MSDP en le recherchant parmi les STAR de l'église ayant un compte, et
   peut le retirer.
5. En confiant une demande ou un suivi, le groupe « STAR » du choix de l'accompagnant ne propose
   que les accompagnants possibles (les profils pastoraux restent proposés comme aujourd'hui).
6. Le STAR choisi reçoit la notification habituelle et retrouve la demande dans « Suivi pastoral ».

### Scénarios alternatifs / cas limites

- **Au déploiement**, personne n'est exclu ni ajouté : les accompagnants proposés sont exactement
  ceux d'aujourd'hui (les membres du MSDP ayant un compte).
- **Un STAR rejoint le MSDP** : il devient accompagnant possible automatiquement, sans action du
  référent.
- **Un STAR quitte le MSDP** : il n'est plus proposé automatiquement ; son exclusion éventuelle
  n'a plus d'effet. S'il doit continuer à accompagner, le référent l'ajoute nominativement.
- **Un STAR exclu quitte puis rejoint le MSDP** : son exclusion est conservée (le référent l'a
  décidée pour cette personne), jusqu'à ce qu'il soit réintégré.
- **Un STAR ajouté nominativement rejoint le MSDP** : il reste accompagnant ; il apparaît dans le
  groupe « Équipe MSDP ».
- **Un STAR exclu ou retiré a des demandes en cours** : elles restent à lui et il continue de
  les traiter ; il ne peut simplement plus en recevoir de nouvelles. La section l'indique au moment
  de l'exclusion ou du retrait (« N demandes en cours restent confiées à cette personne »).
- **Un STAR sans compte** (fiche STAR non liée à un compte validé) ne peut pas être déclaré : il ne
  pourrait ni être notifié ni traiter la demande. Il n'apparaît pas dans la recherche.
- **Un STAR perd son compte ou son lien à l'église** : il disparaît des accompagnants proposés ; ses
  demandes en cours restent visibles des référents, qui peuvent les réaffecter.
- **Aucun accompagnant possible** : le choix de l'accompagnant ne propose que les profils
  pastoraux, avec un lien vers les paramètres.
- **Tentative de confier à une personne qui n'est pas accompagnant possible** (par exemple liste modifiée entre-temps
  dans un autre onglet) : refusée avec un message clair, sans rien enregistrer.
- **Multi-église** : la liste est propre à chaque église ; être accompagnant dans une église ne
  donne rien dans une autre.

## Critères d'acceptation

- [ ] Le référent (et Admin/Super Admin) peut exclure/réintégrer un membre du MSDP et
      ajouter/retirer un STAR hors MSDP ; la Secrétaire et les autres rôles ne le peuvent pas.
- [ ] Un STAR hors de tout département MSDP peut être ajouté, puis se voir confier une demande et
      la traiter jusqu'au bout.
- [ ] Un membre du MSDP exclu n'est plus proposé et ne peut pas se voir confier de demande.
- [ ] Un STAR qui rejoint le MSDP est proposé sans aucune action du référent.
- [ ] Juste après déploiement, les accompagnants proposés sont exactement ceux d'avant.
- [ ] Exclure ou retirer un accompagnant ne retire aucune demande en cours ; il continue à y accéder.
- [ ] Un STAR sans compte validé ne peut pas être déclaré.
- [ ] La liste d'une église n'a aucun effet dans une autre église.
- [ ] Exclusions, réintégrations, ajouts et retraits sont tracés dans l'historique des modifications.
- [ ] L'écran est utilisable sur mobile (recherche, ajout, retrait).

## Hors périmètre

- Le filtrage des **profils pastoraux** (déjà déclarés un par un).
- Une spécialisation par type de demande (accompagnants réservés aux rendez-vous ou aux suivis).
- Une limite de charge par accompagnant.
- La gestion de l'accès aux dossiers d'accueil de l'intégration (bergers, conseillers), qui reste
  inchangée.

## Questions ouvertes

- Aucune bloquante. Décisions prises avec le porteur (2026-10-01) : aucun changement au
  déploiement (option A) ; membres du MSDP ajoutés automatiquement, avec possibilité d'en exclure ;
  ouverture à des STAR hors MSDP par ajout nominatif.

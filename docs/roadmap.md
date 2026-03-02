# Roadmap

## Interface utilisateur

- [x] Composants UI partages (Button, Card, Input, Modal, Select, DataTable, CheckboxGroup)
- [x] Sidebar : highlight du departement selectionne (active state)
- [x] Theme ICC (couleurs `icc-violet`, `icc-jaune`, `icc-rouge`, `icc-bleu`)
- [ ] Indicateurs visuels des statuts dans la sidebar (compteurs en service / indispo)
- [ ] Vue recapitulative multi-departements pour un evenement
- [x] Evenements : renommer le bouton "STAR" en "Planning des STAR" et "Detail" en "Departements en service"
- [x] Evenements : ameliorer l'affichage des departements en service (grille responsive)

### Responsive mobile & UX mobile

- [ ] Sidebar collapsible : menu hamburger sur mobile (< md), overlay ou drawer, fermeture au clic exterieur
- [ ] Layout authentifie : `flex-col` sur mobile, `flex-row` a partir de `md`
- [ ] Header : adapter pour petits ecrans (titre tronque ou masque, actions compactes)
- [ ] PlanningGrid : vue carte sur mobile au lieu de la grille de boutons de statut
- [ ] DataTable : vue carte/liste empilee sur mobile en alternative au tableau horizontal
- [ ] Boutons : tailles tactiles minimum 44x44px, padding adapte (`px-3 py-2 md:px-4 md:py-2`)
- [ ] Modals : plein ecran sur mobile (`md:max-w-lg`)
- [ ] Formulaires : inputs pleine largeur, espacement adapte au tactile
- [ ] StarView (planning STAR) : grille 1 colonne sur mobile, 2 sur tablette, 3+ sur desktop
- [ ] Navigation mobile : barre de navigation fixe en bas (bottom nav) en alternative a la sidebar
- [ ] PWA : manifest + service worker pour installation sur ecran d'accueil (voir section Technique)

## Administration

- [x] Page Super Admin : liste des eglises, creation, suppression
- [ ] Onboarding nouvelle eglise (creation + invitation admin)
- [x] Gestion des utilisateurs : attribution des roles depuis l'interface
- [x] Affectation ministere/departements aux roles MINISTER et DEPARTMENT_HEAD
- [x] Gestion des ministeres et departements (CRUD)
- [x] Section Ministeres : acces en consultation seule pour les Ministres (pas de creation/modification/suppression)
- [x] Gestion des membres (ajout, modification, suppression, transfert entre departements)
- [x] Gestion des evenements (creation, modification, suppression, types personnalises)
- [x] Association departements-evenements depuis l'interface
- [ ] Schema dedie Super Admin (role global independant des eglises)
- [x] Utilisateurs : permettre aux admins, secretaires et utilisateurs de modifier leur nom d'affichage
- [x] Utilisateurs : recherche par nom ou email + navigation alphabetique dans la liste

## Planning

- [x] Section planification des departements : filtre par mois pour les evenements
- [x] Section planification des departements : export du planning mensuel en PDF ou image
- [x] Vue planning des departements : selecteur de mois
- [ ] Notion de tache/affectation : permettre aux responsables de departements d'affecter leurs STAR a une activite (visible dans la vue planning des departements, non visible dans la vue planning des STAR)
- [x] Creation d'evenements avec recurrence (hebdomadaire, mensuel, etc.)
- [x] Gestion facilitee des departements en service pour les evenements recurrents
- [ ] Vue calendrier des evenements
- [x] Duplication d'un planning d'un evenement a un autre
- [ ] Historique des modifications (audit log)
- [x] Date/heure limite de planification par evenement : avant echeance, seuls les responsables de departement, leurs ministres et les admins peuvent modifier le planning ; apres echeance, seuls les admins et secretaires conservent la main
- [x] Export PDF du planning par evenement / departement

## Notifications

- [ ] Notifications email pour rappels de service (J-3, J-1)
- [ ] Integration WhatsApp (API Business)
- [ ] Notifications in-app (badge, toast)

## Statistiques

- [ ] Taux de presence par membre et departement
- [ ] Nombre de services par membre sur une periode
- [ ] Dashboard avec graphiques de tendances

## Technique

- [ ] Tests unitaires (Vitest)
- [ ] Tests d'integration API
- [x] CI/CD (GitHub Actions : typecheck, version check)
- [x] Dependabot (mises a jour automatiques des dependances)
- [x] Affichage de la version dans le footer
- [ ] Deploiement production (Docker multi-stage + reverse proxy)
- [ ] Migrations Prisma (remplacer `db push` par `prisma migrate`)
- [ ] PWA (manifest, service worker, installation mobile)
- [ ] Rate limiting sur les API routes
- [ ] Logs structures (pino ou similaire)

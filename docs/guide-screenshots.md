# Guide utilisateur — Captures d'écran

Ce document décrit la procédure pour produire et publier les captures d'écran du guide utilisateur
(`src/components/GuideContent.tsx`, page `/guide`).

## Principe

Les captures sont hébergées dans une release GitHub dédiée `guide-assets` (tag stable, non versionné).
L'URL de base dans le composant est :

```
https://github.com/iccbretagne/koinonia/releases/download/guide-assets/<fichier.png>
```

Pour mettre à jour une capture, il suffit de ré-uploader le fichier dans cette release avec le même
nom : le guide l'affiche aussitôt, sans déploiement. Chaque fonction du guide référence un fichier
(`screenshotFile`) : ajouter une fonction au guide, c'est aussi ajouter sa capture ci-dessous.

---

## Données

Les captures se font sur l'environnement de développement local
([dev-onboarding.md](dev-onboarding.md)) avec le jeu de données fictif :

1. **Caler le jeu de données sur la date du jour** : `prisma/seed-dev.ts` place ses cultes et
   événements autour d'une date fixe (`TODAY`). La remplacer temporairement par la date du jour
   (sans la commiter), sinon « Mon planning », l'accueil et les grilles sont vides.
2. `npm run db:seed:dev` (efface et régénère la base), puis `npm run dev` avec
   `AUTH_DEV_LOGIN=true` dans `.env`.
3. **Compléter dans l'application** ce que le jeu de données ne contient pas, avant les captures
   concernées :
   - Service d'accueil activé sur les cultes, quelques familles et affectations ;
   - une collecte de disponibilités ouverte, avec des réponses de STAR du département ;
   - un désistement d'un STAR sur un culte à venir (page de remplacement) — à faire **après**
     les captures « Mon planning » et « Je ne peux plus servir », qui le montrent encore planifié ;
   - deux ou trois événements d'équipe sur le département ;
   - une annonce avec visuel et diffusion réseaux sociaux (files Secrétariat, Visuels, Réseaux
     sociaux) ;
   - un département de fonction `MSDP` (accompagnants du suivi pastoral) ;
   - une offre d'emploi en attente de confirmation (bandeau « Confirmer l'offre »).

Les comptes sont ceux de la connexion de développement (`devUserKey`) : `super-admin`, `admin`,
`secretaire`, `ministre`, `resp-accueil`, `resp-secretariat`, `faiseur-disciples`, `reporter`,
`star`. Les pages de département utilisent le département **Accueil** (`[dept]`).

---

## Prise de vue (Playwright)

Réglages communs, identiques pour toutes les captures :

- fenêtre **1280 × 800**, `locale: "fr-FR"`, `timezoneId: "Europe/Paris"`, thème clair
  (`localStorage` `koinonia-theme = light`, `colorScheme: "light"`) ;
- capture de la fenêtre (pas de la page entière), barre latérale visible ;
- indicateur de développement Next masqué (`nextjs-portal { display: none !important }`) ;
- un contexte de navigateur par compte : `POST /api/auth/dev-login` (champ `devUserKey`), puis
  `PATCH /api/user/tour-seen` pour que la visite guidée ne recouvre pas l'écran.

```js
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 }, locale: "fr-FR", colorScheme: "light",
  timezoneId: "Europe/Paris", permissions: ["clipboard-read", "clipboard-write"],
});
await ctx.addInitScript(() => {
  localStorage.setItem("koinonia-theme", "light");
  const s = document.createElement("style");
  s.textContent = "nextjs-portal{display:none!important}";
  document.documentElement.appendChild(s);
});
const page = await ctx.newPage();
await page.goto(BASE + "/");
await page.request.post(BASE + "/api/auth/dev-login", { form: { devUserKey: "admin" } });
await page.request.patch(BASE + "/api/user/tour-seen");
await page.goto(BASE + "/evenements/gestion", { waitUntil: "networkidle" });
// … actions de la colonne « Avant la capture »
await page.screenshot({ path: "guide-events-manage.png" });
```

Relire chaque capture avant publication : données présentes, panneau attendu ouvert, aucune
fenêtre parasite.

---

## Liste des captures

### Planning (5)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 1 | `guide-today.png` | Accueil « Aujourd'hui » | `resp-accueil` | `/accueil` | — |
| 2 | `guide-my-planning.png` | Mon planning | `star` | `/planning` | — |
| 3 | `guide-planning-view.png` | Voir le planning | `admin` | `/planning/departements?dept=[dept]` | — |
| 4 | `guide-planning-edit.png` | Modifier le planning | `resp-accueil` | `/planning/departements?dept=[dept]&view=week` | — |
| 5 | `guide-planning-stats.png` | Statistiques du planning | `admin` | `/planning/departements/statistiques` | — |

### Événements (6)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 6 | `guide-events-list.png` | Voir les événements | `admin` | `/evenements` | — |
| 7 | `guide-events-manage.png` | Gérer les événements | `admin` | `/evenements/gestion` | — |
| 8 | `guide-team-events.png` | Événements d'équipe | `resp-accueil` | `/planning/departements?dept=[dept]&view=team` | — |
| 9 | `guide-welcome-duty.png` | Service d'accueil | `admin` | `/evenements/service-accueil` | — |
| 10 | `guide-announcement-sheet.png` | Trame des annonces | `secretaire` | `/evenements/annonces` | — |
| 11 | `guide-reports.png` | Comptes rendus | `reporter` | `/evenements/comptes-rendus` | — |

### Membres (3)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 12 | `guide-members-list.png` | Voir les membres (STAR) | `admin` | `/personnes/star` | — |
| 13 | `guide-members-manage.png` | Gérer les membres (STAR) | `resp-accueil` | `/personnes/star` | clic « Modifier » |
| 13b | `guide-candidatures.png` | Candidatures au service (Vie des STAR) | `admin` | `/personnes/candidatures` | quelques candidatures reçues |
| 13c | `guide-candidatures-entretiens.png` | Entretiens des candidats | `admin` | `/personnes/candidatures/entretiens` | quelques créneaux libres et réservés sur deux jours |

### Discipolat (3)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 14 | `guide-discipleship-relations.png` | Relations de discipolat | `admin` | `/personnes/discipolat` | — |
| 15 | `guide-discipleship-appel.png` | Appel de présence | `faiseur-disciples` | `/personnes/discipolat` | — |
| 16 | `guide-discipleship-stats.png` | Statistiques & Export | `secretaire` | `/personnes/discipolat` | — |

### Demandes (6)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 17 | `guide-requests-new.png` | Nouvelle demande | `resp-accueil` | `/demandes/nouvelle` | — |
| 18 | `guide-requests-list.png` | Mes demandes | `resp-accueil` | `/demandes` | — |
| 19 | `guide-secretariat-dashboard.png` | Traitement des demandes (Secrétariat) | `secretaire` | `/demandes/traitement` | clic « Journée portes ouvertes » |
| 20 | `guide-media-dashboard.png` | Demandes visuels (Prod. Média) | `admin` | `/medias/visuels/demandes` | clic « Journée portes ouvertes » |
| 21 | `guide-communication-dashboard.png` | Demandes réseaux sociaux (Communication) | `admin` | `/medias/reseaux-sociaux` | clic « Journée portes ouvertes » |
| 22 | `guide-media.png` | Photos et visuels (Communication & Production) | `admin` | `/medias` | — |

### Absences (6)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 23 | `guide-disponibilites.png` | Indiquer mes disponibilités | `star` | `/planning/disponibilites` | — |
| 24 | `guide-disponibilites-grille.png` | Lire les disponibilités dans la grille | `resp-accueil` | `/planning/departements?dept=[dept]` | — |
| 25 | `guide-je-ne-peux-plus.png` | Je ne peux plus servir | `star` | `/planning` | — |
| 26 | `guide-remplacement.png` | Remplacer un STAR désisté | `resp-accueil` | `/planning/remplacements/[id]` | — |
| 27 | `guide-disponibilites-parametres.png` | Régler la collecte | `admin` | `/planning/disponibilites/collectes` | — |
| 28 | `guide-absences-vue-ensemble.png` | Indisponibilités de mon périmètre | `resp-accueil` | `/planning/disponibilites/equipe` | — |

### Tâches (1)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 29 | `guide-taches.png` | Tâches de département | `resp-accueil` | `/planning/departements?dept=[dept]&view=tasks` | — |

### Administration (7)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 30 | `guide-access-roles.png` | Accès & rôles | `admin` | `/admin/access` | — |
| 31 | `guide-admin-departments.png` | Ministères & départements | `admin` | `/admin/departments` | — |
| 32 | `guide-admin-church.png` | Paramètres de l'église | `admin` | `/admin/access` | premier lien `/plateforme/eglises/…` |
| 33 | `guide-admin-users.png` | Gestion des utilisateurs | `admin` | `/admin/users` | — |
| 34 | `guide-admin-audit-logs.png` | Journaux d'audit | `admin` | `/admin/audit-logs` | — |
| 35 | `guide-api.png` | Référence de l'API | `super-admin` | `/plateforme/api` | clic « planning » |
| 36 | `guide-admin-backups.png` | Sauvegardes et export de configuration | `super-admin` | `/plateforme/backups` | défiler |

### Profil (1)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 37 | `guide-profile.png` | Profil & liaison STAR | `star` | `/profile` | — |
| 37b | `guide-assistants.png` | Connecter mon assistant IA (MCP) | `star` | `/profile/assistants` | fonction activée pour l'instance et l'église |

### Salles (2)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 38 | `guide-salles-reservation.png` | Réserver une salle | `ministre` | `/ressources/salles` | — |
| 39 | `guide-salles-mains-courantes.png` | Contrôle des mains courantes | `admin` | `/ressources/salles/checklists` | — |

### Suivi pastoral (9)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 40 | `guide-care-demande.png` | Demande de RDV pastoral | `star` | `/demandes/rendez-vous` | clic « Nouvelle demande » |
| 41 | `guide-care-qualification.png` | Qualification et affectation des demandes | `admin` | `/pastoral/suivi` | — |
| 42 | `guide-care-suivi-accompagnant.png` | Suivi par le référent : date et compte rendu | `admin` | `/pastoral/suivi` | premier lien `/care/requests/…` |
| 43 | `guide-care-msdp.png` | Suivi des nouveaux convertis (MSDP) | `admin` | `/pastoral/suivi` | clic « Nouveaux convertis » |
| 44 | `guide-agenda-planification.png` | Vue et planification agenda | `admin` | `/pastoral/planification` | — |
| 45 | `guide-care-parametres.png` | Paramètres du suivi pastoral (délais de relance) | `admin` | `/pastoral/suivi/parametres` | — |
| 46 | `guide-care-accompagnants.png` | Accompagnants du suivi pastoral | `admin` | `/pastoral/suivi/parametres` | défiler |
| 47 | `guide-care-suppression.png` | Supprimer une demande | `admin` | `/pastoral/suivi` | premier lien `/care/requests/…`, défiler |
| 48 | `guide-care-stats.png` | Statistiques du suivi pastoral | `admin` | `/pastoral/suivi/statistiques` | — |

### Comptabilité (3)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 49 | `guide-comptabilite-demande.png` | Envoyer une demande financière | `resp-accueil` | `/finances/demandes/nouvelle` | — |
| 50 | `guide-comptabilite-gestion.png` | Traiter les demandes financières | `admin` | `/finances/demandes` | — |
| 51 | `guide-comptabilite-stats.png` | Statistiques comptables | `admin` | `/finances/statistiques` | — |

### Emplois (4)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 52 | `guide-emplois-liste.png` | Offres, recherches d'emploi & freelance | `star` | `/ressources/offres` | clic « Création d'un site vitrine » |
| 53 | `guide-emplois-moderation.png` | Modération des annonces | `admin` | `/ressources/offres` | clic « Toutes », clic « Alternance assistant comptable » |
| 54 | `guide-emplois-relance.png` | Cycle de vie des offres | `admin` | `/ressources/offres` | clic « Développeur web (H/F) » |
| 55 | `guide-emplois-whatsapp.png` | Récapitulatif WhatsApp | `star` | `/ressources/offres` | clic « WhatsApp » |

### Intégration (6)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 56 | `guide-integration-demandes.png` | Demandes d'intégration (familles) | `admin` | `/personnes/integration/dossiers` | — |
| 57 | `guide-integration-attente.png` | Attente, relances et renvoi d'une demande | `admin` | `/personnes/integration/dossiers` | premier lien `/personnes/integration/dossiers/…` |
| 58 | `guide-integration-parametres.png` | Paramètres intégration (délais de relance) | `admin` | `/personnes/integration/parametres` | — |
| 59 | `guide-integration-bergers.png` | Bergers de famille | `admin` | `/personnes/integration/bergers` | — |
| 60 | `guide-integration-stats.png` | Parcours & statistiques d'intégration | `admin` | `/personnes/integration/stats` | — |
| 61 | `guide-integration-export.png` | Export Excel des demandes | `admin` | `/personnes/integration/dossiers` | clic « Yann Cadoret » |

### Audio (4)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 62 | `guide-audio-library.png` | (re)Écouter les cultes | `star` | `/medias/audio/ecouter` | — |
| 63 | `guide-audio-production.png` | Production audio (dépôt, découpage, publication) | `admin` | `/medias/audio/production` | — |
| 64 | `guide-audio-parametres.png` | Paramètres audio | `admin` | `/medias/audio/parametres` | — |
| 65 | `guide-audio-depublier.png` | Dépublier un culte | `admin` | `/medias/audio/production` | clic « Ouvrir » |

### Formulaires (5)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 66 | `guide-forms-builder.png` | Formulaires : créer et publier | `secretaire` | `/evenements/formulaires/[id]?onglet=construction` | un formulaire de participation avec quelques questions |
| 67 | `guide-forms-sessions.png` | Formulaires : inscriptions à sessions (PCNC) | `secretaire` | `/evenements/formulaires/[id]?onglet=construction` | une inscription avec une session de 2 jours et deux niveaux |
| 68 | `guide-forms-results.png` | Formulaires : résultats et participation | `secretaire` | `/evenements/formulaires/[id]?onglet=resultats` | quelques réponses confirmées |
| 69 | `guide-forms-answer.png` | Répondre à un formulaire | `star` | `/f/[église]/[formulaire]` | formulaire publié |
| 70 | `guide-forms-attendance.png` | Intervenant : inscrits et présence | `star` | `/evenements/formulaires/[id]?onglet=presence` | le compte désigné intervenant, des inscrits confirmés |
---

## Publication

```bash
# Une ou plusieurs captures
gh release upload guide-assets guide-planning-view.png guide-taches.png --clobber

# Toutes, depuis le dossier des captures
gh release upload guide-assets guide-*.png --clobber
```

`--clobber` remplace l'asset du même nom. Les assets que le guide ne référence plus peuvent être
retirés avec `gh release delete-asset guide-assets <fichier.png>`.

Si la release n'existe pas (nouveau dépôt) :

```bash
gh release create guide-assets --title "Guide Assets" --prerelease \
  --notes "Captures d'écran du guide utilisateur. Ne pas supprimer." guide-*.png
```

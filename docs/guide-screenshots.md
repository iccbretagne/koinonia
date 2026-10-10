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
   - une offre d'emploi en attente de confirmation (bandeau « Toujours d'actualité »).

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
await page.goto(BASE + "/admin/events", { waitUntil: "networkidle" });
// … actions de la colonne « Avant la capture »
await page.screenshot({ path: "guide-events-manage.png" });
```

Relire chaque capture avant publication : données présentes, panneau attendu ouvert, aucune
fenêtre parasite.

---

## Liste des 65 captures

### Planning (5)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 1 | `guide-today.png` | Accueil « Aujourd'hui » | `resp-accueil` | `/accueil` | — |
| 2 | `guide-my-planning.png` | Mon planning | `star` | `/planning` | — |
| 3 | `guide-planning-view.png` | Voir le planning | `admin` | `/dashboard?dept=[dept]` | — |
| 4 | `guide-planning-edit.png` | Modifier le planning | `resp-accueil` | `/dashboard?dept=[dept]&view=week` | — |
| 5 | `guide-planning-stats.png` | Statistiques du planning | `admin` | `/dashboard/stats` | — |

### Événements (6)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 6 | `guide-events-list.png` | Voir les événements | `admin` | `/events` | — |
| 7 | `guide-events-manage.png` | Gérer les événements | `admin` | `/admin/events` | — |
| 8 | `guide-team-events.png` | Événements d'équipe | `resp-accueil` | `/dashboard?dept=[dept]&view=team` | — |
| 9 | `guide-welcome-duty.png` | Service d'accueil | `admin` | `/admin/welcome-duty` | — |
| 10 | `guide-announcement-sheet.png` | Trame des annonces | `secretaire` | `/events/announcement-sheets` | — |
| 11 | `guide-reports.png` | Comptes rendus | `reporter` | `/admin/reports` | — |

### Membres (2)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 12 | `guide-members-list.png` | Voir les membres (STAR) | `admin` | `/admin/members` | — |
| 13 | `guide-members-manage.png` | Gérer les membres (STAR) | `resp-accueil` | `/admin/members` | clic « Modifier » |

### Discipolat (3)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 14 | `guide-discipleship-relations.png` | Relations de discipolat | `admin` | `/admin/discipleship` | — |
| 15 | `guide-discipleship-appel.png` | Appel de présence | `faiseur-disciples` | `/admin/discipleship` | — |
| 16 | `guide-discipleship-stats.png` | Statistiques & Export | `secretaire` | `/admin/discipleship` | — |

### Demandes (6)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 17 | `guide-requests-new.png` | Nouvelle demande | `resp-accueil` | `/requests/new` | — |
| 18 | `guide-requests-list.png` | Mes demandes | `resp-accueil` | `/requests` | — |
| 19 | `guide-secretariat-dashboard.png` | Traitement des demandes (Secrétariat) | `secretaire` | `/secretariat/requests` | clic « Journée portes ouvertes » |
| 20 | `guide-media-dashboard.png` | Demandes visuels (Prod. Média) | `admin` | `/media/requests` | clic « Journée portes ouvertes » |
| 21 | `guide-communication-dashboard.png` | Demandes réseaux sociaux (Communication) | `admin` | `/communication/requests` | clic « Journée portes ouvertes » |
| 22 | `guide-media.png` | Photos et visuels (Communication & Production) | `admin` | `/media` | — |

### Absences (6)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 23 | `guide-disponibilites.png` | Indiquer mes disponibilités | `star` | `/disponibilites` | — |
| 24 | `guide-disponibilites-grille.png` | Lire les disponibilités dans la grille | `resp-accueil` | `/dashboard?dept=[dept]` | — |
| 25 | `guide-je-ne-peux-plus.png` | Je ne peux plus servir | `star` | `/planning` | — |
| 26 | `guide-remplacement.png` | Remplacer un STAR désisté | `resp-accueil` | `/planning/remplacements/[id]` | — |
| 27 | `guide-disponibilites-parametres.png` | Régler la collecte | `admin` | `/disponibilites/collectes` | — |
| 28 | `guide-absences-vue-ensemble.png` | Indisponibilités de mon périmètre | `resp-accueil` | `/absences` | — |

### Tâches (1)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 29 | `guide-taches.png` | Tâches de département | `resp-accueil` | `/dashboard?dept=[dept]&view=tasks` | — |

### Administration (7)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 30 | `guide-access-roles.png` | Accès & rôles | `admin` | `/admin/access` | — |
| 31 | `guide-admin-departments.png` | Ministères & départements | `admin` | `/admin/departments` | — |
| 32 | `guide-admin-church.png` | Paramètres de l'église | `admin` | `/admin/access` | premier lien `/admin/churches/…` |
| 33 | `guide-admin-users.png` | Gestion des utilisateurs | `admin` | `/admin/users` | — |
| 34 | `guide-admin-audit-logs.png` | Journaux d'audit | `admin` | `/admin/audit-logs` | — |
| 35 | `guide-api.png` | Référence de l'API | `super-admin` | `/admin/api` | clic « planning » |
| 36 | `guide-admin-backups.png` | Sauvegardes et export de configuration | `super-admin` | `/admin/backups` | défiler |

### Profil (1)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 37 | `guide-profile.png` | Profil & liaison STAR | `star` | `/profile` | — |

### Salles (2)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 38 | `guide-salles-reservation.png` | Réserver une salle | `ministre` | `/rooms` | — |
| 39 | `guide-salles-mains-courantes.png` | Contrôle des mains courantes | `admin` | `/rooms/checklists` | — |

### Suivi pastoral (9)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 40 | `guide-care-demande.png` | Demande de RDV pastoral | `star` | `/care/request` | clic « Nouvelle demande » |
| 41 | `guide-care-qualification.png` | Qualification et affectation des demandes | `admin` | `/care` | — |
| 42 | `guide-care-suivi-accompagnant.png` | Suivi par le référent : date et compte rendu | `admin` | `/care` | premier lien `/care/requests/…` |
| 43 | `guide-care-msdp.png` | Suivi des nouveaux convertis (MSDP) | `admin` | `/care` | clic « Nouveaux convertis » |
| 44 | `guide-agenda-planification.png` | Vue et planification agenda | `admin` | `/agenda/schedule` | — |
| 45 | `guide-care-parametres.png` | Paramètres du suivi pastoral (délais de relance) | `admin` | `/care/parametres` | — |
| 46 | `guide-care-accompagnants.png` | Accompagnants du suivi pastoral | `admin` | `/care/parametres` | défiler |
| 47 | `guide-care-suppression.png` | Supprimer une demande | `admin` | `/care` | premier lien `/care/requests/…`, défiler |
| 48 | `guide-care-stats.png` | Statistiques du suivi pastoral | `admin` | `/care/stats` | — |

### Comptabilité (3)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 49 | `guide-comptabilite-demande.png` | Soumettre une demande financière | `resp-accueil` | `/accounting/requests/new` | — |
| 50 | `guide-comptabilite-gestion.png` | Traiter les demandes financières | `admin` | `/accounting/requests` | — |
| 51 | `guide-comptabilite-stats.png` | Statistiques comptables | `admin` | `/accounting/stats` | — |

### Emplois (4)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 52 | `guide-emplois-liste.png` | Offres, recherches d'emploi & freelance | `star` | `/jobs` | clic « Création d'un site vitrine » |
| 53 | `guide-emplois-moderation.png` | Modération des annonces | `admin` | `/jobs` | clic « Toutes », clic « Alternance assistant comptable » |
| 54 | `guide-emplois-relance.png` | Cycle de vie des offres | `admin` | `/jobs` | clic « Développeur web (H/F) » |
| 55 | `guide-emplois-whatsapp.png` | Récapitulatif WhatsApp | `star` | `/jobs` | clic « Copier pour WhatsApp » |

### Intégration (6)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 56 | `guide-integration-demandes.png` | Demandes d'intégration (familles) | `admin` | `/integration/requests` | — |
| 57 | `guide-integration-attente.png` | Attente, relances et renvoi d'une demande | `admin` | `/integration/requests` | premier lien `/integration/requests/…` |
| 58 | `guide-integration-parametres.png` | Paramètres intégration (délais de relance) | `admin` | `/integration/parametres` | — |
| 59 | `guide-integration-bergers.png` | Bergers de famille | `admin` | `/integration/leaders` | — |
| 60 | `guide-integration-stats.png` | Parcours & statistiques d'intégration | `admin` | `/integration/stats` | — |
| 61 | `guide-integration-export.png` | Export Excel des demandes | `admin` | `/integration/requests` | clic « Yann Cadoret » |

### Audio (4)

| # | Fichier | Fonction | Compte | URL | Avant la capture |
|---|---|---|---|---|---|
| 62 | `guide-audio-library.png` | (re)Écouter les cultes | `star` | `/audio/ecouter` | — |
| 63 | `guide-audio-production.png` | Production audio (dépôt, découpage, publication) | `admin` | `/audio/production` | — |
| 64 | `guide-audio-parametres.png` | Paramètres audio | `admin` | `/audio/parametres` | — |
| 65 | `guide-audio-depublier.png` | Dépublier un culte | `admin` | `/audio/production` | clic « Ouvrir » |
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

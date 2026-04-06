# Guide utilisateur — Captures d'écran

Ce document décrit la procédure pour produire et publier les captures d'écran du guide utilisateur.

## Principe

Les captures sont hébergées dans une release GitHub dédiée `guide-assets` (tag stable, non versionné).  
L'URL de base dans le composant est :

```
https://github.com/iccbretagne/koinonia/releases/download/guide-assets/<fichier.png>
```

Pour mettre à jour une capture, il suffit de ré-uploader le fichier dans cette release avec le même nom.

---

## Prérequis

- Application en cours d'exécution en local (`npm run dev`) avec des données de test réalistes (seed ICC Rennes)
- Navigateur Chrome ou Firefox — fenêtre **1280 × 800 px minimum**
- Outil de capture : outil natif OS, ou extension navigateur (ex. GoFullPage, Awesome Screenshot)
- Format : **PNG**, résolution suffisante pour le zoom (retina si possible)
- Recadrage : capturer la zone de contenu principale, **sans** la barre du navigateur ni l'OS

---

## Compte de test recommandé par rôle

Se connecter avec un compte ayant le rôle approprié pour chaque série de captures.  
Utiliser l'église ICC Rennes (seed).

| Rôle | Accès attendu |
|---|---|
| Super Admin | Tout |
| Admin | Tout sauf paramètres église et users |
| Secrétaire | Planning lecture, événements, discipolat, comptes rendus, secretariat/requests |
| Ministre | Planning + membres de son ministère |
| Resp. Département | Planning + membres de ses départements + discipolat lecture |
| Faiseur de Disciples | Discipolat uniquement (ses disciples) |
| Reporter | Événements lecture + comptes rendus |

---

## Liste des 24 captures

### Planning (3)

| # | Fichier | URL | État à capturer |
|---|---|---|---|
| 1 | `guide-planning-view.png` | `/dashboard?dept=[id]` | Grille avec statuts colorés visibles, plusieurs STAR |
| 2 | `guide-planning-edit.png` | `/dashboard?dept=[id]` | Dropdown statut ouvert sur une cellule |
| 3 | `guide-planning-stats.png` | `/dashboard/stats` | Graphiques de taux de présence par département |

### Événements (3)

| # | Fichier | URL | État à capturer |
|---|---|---|---|
| 4 | `guide-events-list.png` | `/events` | Liste d'événements avec types et dates |
| 5 | `guide-events-calendar.png` | `/events/calendar` | Vue calendrier mensuel avec événements |
| 6 | `guide-events-manage.png` | `/admin/events` | Liste admin avec boutons Créer/Modifier |

### Comptes rendus (1)

| # | Fichier | URL | État à capturer |
|---|---|---|---|
| 7 | `guide-reports.png` | `/admin/reports` | Formulaire compte rendu partiellement rempli |

### Membres (2)

| # | Fichier | URL | État à capturer |
|---|---|---|---|
| 8 | `guide-members-list.png` | `/admin/members` | Liste des STAR avec filtres |
| 9 | `guide-members-manage.png` | `/admin/members` | Modal/formulaire d'ajout ou d'édition ouvert |

### Discipolat (3)

| # | Fichier | URL | État à capturer |
|---|---|---|---|
| 10 | `guide-discipleship-relations.png` | `/admin/discipleship` → onglet **Relations** | Tableau des relations FD ↔ disciple |
| 11 | `guide-discipleship-appel.png` | `/admin/discipleship` → onglet **Appel** | Grille d'appel avec cases à cocher |
| 12 | `guide-discipleship-stats.png` | `/admin/discipleship` → onglet **Statistiques** | Tableau de stats et bouton Export |

### Demandes (5)

| # | Fichier | URL | État à capturer |
|---|---|---|---|
| 13 | `guide-requests-new.png` | `/requests/new` | Formulaire de nouvelle demande avec champs remplis |
| 14 | `guide-requests-list.png` | `/requests` | Liste des demandes avec badges de statut |
| 15 | `guide-secretariat-dashboard.png` | `/secretariat/requests` | Dashboard avec annonces en attente, actions visibles |
| 16 | `guide-media-dashboard.png` | `/media/requests` | Dashboard visuels avec demandes en cours |
| 17 | `guide-communication-dashboard.png` | `/communication/requests` | Dashboard com avec demandes à traiter |

### Administration (6)

| # | Fichier | URL | État à capturer |
|---|---|---|---|
| 18 | `guide-access-roles.png` | `/admin/access` | Onglet Rôles avec liste utilisateurs et badges |
| 19 | `guide-admin-departments.png` | `/admin/ministries` ou `/admin/departments` | Vue arborescente ministères → départements |
| 20 | `guide-admin-church.png` | `/admin/churches/[id]` | Formulaire paramètres église |
| 21 | `guide-admin-users.png` | `/admin/users` | Liste des utilisateurs avec rôles |
| 22 | `guide-admin-audit-logs.png` | `/admin/audit-logs` | Journal avec entrées horodatées |
| 23 | `guide-admin-dept-functions.png` | `/admin/departments/functions` | Vue fonctions système + custom |

### Profil (1)

| # | Fichier | URL | État à capturer |
|---|---|---|---|
| 24 | `guide-profile.png` | `/profile` | Profil avec section liaison STAR visible |

---

## Procédure de publication

### Première fois (création de la release)

```bash
gh release create guide-assets \
  --title "Guide Assets" \
  --notes "Captures d'écran du guide utilisateur. Ne pas supprimer." \
  --prerelease \
  guide-planning-view.png \
  guide-planning-edit.png \
  # ... tous les fichiers
```

### Mise à jour d'une ou plusieurs captures

```bash
# Supprimer l'ancien asset et uploader le nouveau
gh release upload guide-assets guide-planning-view.png --clobber

# Plusieurs fichiers en une commande
gh release upload guide-assets \
  guide-planning-view.png \
  guide-discipleship-relations.png \
  --clobber
```

### Upload en masse (toutes les captures d'un coup)

Depuis le dossier contenant les PNG :

```bash
gh release upload guide-assets *.png --clobber
```

---

## Conseils de mise en scène

- **Données** : utiliser le seed ICC Rennes (`npm run db:seed`) — les données doivent être réalistes (vrais prénoms/noms, vrais départements)
- **Anonymisation** : pas nécessaire pour un guide interne, mais éviter les adresses email réelles
- **Langue** : interface en français, navigateur en français
- **Fenêtre** : masquer les barres d'outils du navigateur (mode plein écran F11 ou vue épurée)
- **Sidebar** : doit être visible et la bonne section active (accordéon ouvert)
- **Cohérence** : même compte / même église pour toute une série

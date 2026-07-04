# Spec — Missions freelance

- **Numéro** : 004
- **Statut** : Implémentée
- **Créée le** : 2026-07-04
- **Branche suggérée** : `feat/emploi-missions-freelance`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

---

## Contexte & problème

Le module emploi couvre désormais deux flux : les offres d'emploi (employeur cherche salarié) et les profils de recherche (candidat cherche emploi). La communauté compte aussi des membres qui exercent en freelance ou qui ont ponctuellement des missions à confier — ce flux est aujourd'hui invisible.

Résultat : un pasteur qui cherche un développeur pour une mission de 3 mois ne peut pas le signaler, et un graphiste freelance de la communauté ne peut pas faire savoir qu'il est disponible. L'entraide professionnelle reste incomplète.

---

## Utilisateurs concernés

| Rôle | Ce qu'il peut faire |
|---|---|
| **Tout utilisateur authentifié** (tous rôles) | Publier une mission à confier **et/ou** un profil freelance ; consulter tous les contenus actifs |
| **Super Admin / Admin / Secrétaire** | En plus : archiver ou supprimer n'importe quelle mission ou profil freelance (modération) |

---

## Comportement attendu

Le module emploi présente un troisième onglet **Freelance** sur la page `/jobs`, aux côtés de "Offres" et "En recherche".

L'onglet Freelance est lui-même divisé en deux sous-flux visibles simultanément ou filtrables :
- **Missions** : des donneurs d'ordre publient des missions à confier à un freelance
- **Disponibles** : des freelances publient leur disponibilité et leurs compétences

### Scénario principal — publier une mission à confier

1. Un membre connecté accède à l'onglet "Freelance".
2. Il clique sur "Proposer une mission".
3. Il remplit : titre de la mission, domaine / stack technique, durée estimée, TJM indicatif (optionnel), modalité (remote / présentiel / hybride), localisation (si présentiel/hybride), description de la mission et du profil recherché, email ou lien de contact.
4. Il publie. La mission apparaît dans le sous-flux "Missions" de l'onglet Freelance.
5. Les membres abonnés aux notifications emploi avec l'option "nouvelles missions freelance" reçoivent une notification in-app.

### Scénario principal — publier son profil freelance

1. Un membre connecté accède à l'onglet "Freelance".
2. Il clique sur "Proposer mes services".
3. Il remplit : titre du profil, domaine / stack technique, TJM indicatif (optionnel), modalité souhaitée (remote / présentiel / hybride), localisation, disponibilité (date), description de ses compétences et expériences, email et/ou lien (LinkedIn, portfolio).
4. Il publie. Son profil apparaît dans le sous-flux "Disponibles".
5. Les membres abonnés aux notifications emploi avec l'option "nouveaux profils freelance" reçoivent une notification in-app.

### Scénario — clôturer

- L'auteur d'une **mission** peut la marquer "Pourvue" quand il a trouvé son prestataire → disparaît du sous-flux public.
- L'auteur d'un **profil freelance** peut le marquer "Indisponible" quand il n'est plus libre → disparaît du sous-flux public.
- Dans les deux cas, l'auteur et les admins peuvent encore consulter le contenu clôturé.

### Scénarios alternatifs / cas limites

- **Un utilisateur peut publier plusieurs missions et plusieurs profils** simultanément (pas de limite en V1).
- **Si aucun TJM n'est renseigné**, le contenu s'affiche sans mention de tarif.
- **Si aucune localisation n'est renseignée pour une mission présentielle**, la localisation est affichée comme "À préciser".
- **L'email de contact est pré-rempli** avec l'email du compte, modifiable ou supprimable.
- **Quand un admin supprime** un contenu, l'auteur n'est pas notifié en V1.
- **Les deux sous-flux sont visibles simultanément** par défaut dans l'onglet (missions en haut, disponibles en dessous), avec la possibilité de filtrer pour n'en voir qu'un.

---

## Critères d'acceptation

- [ ] Un utilisateur connecté peut publier une mission avec au minimum un titre et un domaine.
- [ ] Un utilisateur connecté peut publier un profil freelance avec au minimum un titre et un domaine.
- [ ] Un utilisateur peut avoir plusieurs missions actives et plusieurs profils freelance actifs simultanément.
- [ ] Les missions et profils actifs sont visibles dans l'onglet "Freelance" par tous les membres connectés.
- [ ] L'auteur d'une mission peut la marquer "Pourvue" ; elle disparaît alors du sous-flux public.
- [ ] L'auteur d'un profil freelance peut le marquer "Indisponible" ; il disparaît alors du sous-flux public.
- [ ] Un admin/secrétaire peut supprimer n'importe quelle mission ou profil freelance.
- [ ] Les membres abonnés avec l'option "missions freelance" reçoivent une notification in-app à chaque nouvelle mission publiée.
- [ ] Les membres abonnés avec l'option "profils freelance" reçoivent une notification in-app à chaque nouveau profil publié.
- [ ] La page `/jobs` présente bien trois onglets sans régression sur "Offres" et "En recherche".
- [ ] Le champ TJM est optionnel et n'est jamais affiché si non renseigné.

---

## Hors périmètre

- Mise en relation directe via messagerie interne.
- Système de matching missions ↔ profils freelance.
- Négociation ou contractualisation dans l'application.
- Évaluation ou notation des freelances.
- Visibilité restreinte (contenu visible uniquement par admins).
- Notifications par email (in-app uniquement en V1).
- Archivage automatique après une durée déterminée.
- Import / export des missions ou profils.

---

## Questions ouvertes

- Aucune — les décisions structurantes ont été tranchées en amont.

# Spec — Profils de recherche d'emploi

- **Numéro** : 003
- **Statut** : Implémentée
- **Créée le** : 2026-07-04
- **Branche suggérée** : `feat/emploi-profils-recherche`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

---

## Contexte & problème

Le module emploi de Koinonia est aujourd'hui un panneau d'affichage **à sens unique** : des membres de la communauté publient des offres, d'autres peuvent postuler par email ou lien externe. Le flux inversé — un membre qui cherche un emploi et souhaite se faire connaître de la communauté — n'existe pas.

Résultat : les membres en recherche active ne peuvent pas signaler leur disponibilité. Les membres qui recrutent (ou connaissent une opportunité) n'ont aucun moyen de savoir qui est ouvert à de nouvelles opportunités. Le réseau d'entraide professionnelle reste inexploité.

---

## Utilisateurs concernés

| Rôle | Ce qu'il peut faire |
|---|---|
| **Tout utilisateur authentifié** (tous rôles) | Créer, modifier, clôturer ses propres profils de recherche ; consulter tous les profils actifs de la communauté |
| **Super Admin / Admin / Secrétaire** | En plus : archiver ou supprimer n'importe quel profil (modération) |

Un même utilisateur peut avoir **plusieurs profils actifs simultanément** (ex : cherche un CDI en informatique ET une alternance en comptabilité).

---

## Comportement attendu

### Scénario principal — publier un profil de recherche

1. Un membre connecté accède à la section Emploi.
2. Il voit deux onglets : **Offres** (liste existante) et **En recherche** (nouveau).
3. Depuis l'onglet "En recherche", il clique sur "Publier mon profil".
4. Il remplit un formulaire : titre du profil, type(s) de contrat souhaité(s) (emploi, stage, alternance — sélection multiple), secteur / domaine d'activité, localisation souhaitée, ouverture au télétravail, date de disponibilité, présentation libre, email de contact, lien externe (LinkedIn, portfolio…).
5. Il publie. Son profil apparaît dans l'onglet "En recherche", visible par tous les membres connectés.
6. Les membres abonnés aux notifications emploi qui ont activé l'option "nouvelles recherches" reçoivent une notification in-app.

### Scénario — mettre à jour ou clôturer un profil

1. L'auteur retrouve son profil (via l'onglet ou via sa propre liste).
2. Il peut modifier n'importe quel champ tant que le profil est actif.
3. Quand il a trouvé un emploi, il clôture le profil ("J'ai trouvé !"). Le profil passe en statut **Trouvé** et disparaît de la liste publique, mais reste consultable par son auteur et les admins.

### Scénario — consulter les profils

1. Un membre ouvre l'onglet "En recherche".
2. Il voit les profils actifs, triés du plus récent au plus ancien.
3. Il peut filtrer par type de contrat (emploi / stage / alternance).
4. Il clique sur un profil pour voir le détail complet : présentation, disponibilité, contact.

### Scénarios alternatifs / cas limites

- **Si l'utilisateur n'a pas de profil actif**, l'onglet "En recherche" affiche un état vide avec le CTA "Publier mon profil".
- **Si un profil dépasse une durée de 6 mois sans modification**, il reste visible mais peut faire l'objet d'une relance (hors périmètre V1).
- **Quand un admin supprime un profil**, l'auteur n'en est pas notifié en V1.
- **Un utilisateur peut publier plusieurs profils actifs** ; ils apparaissent chacun comme une carte distincte dans la liste (avec un indicateur "Ma publication").
- **Si aucune date de disponibilité n'est renseignée**, le profil s'affiche sans mention de disponibilité (champ facultatif).
- **Le contact email est pré-rempli** avec l'email du compte, mais l'utilisateur peut le remplacer ou le vider.

---

## Critères d'acceptation

- [ ] Un utilisateur connecté peut créer un profil de recherche avec au minimum un titre et un type de contrat.
- [ ] Un utilisateur peut créer plusieurs profils actifs simultanément.
- [ ] Les profils actifs sont visibles dans l'onglet "En recherche" par tous les membres connectés.
- [ ] L'auteur peut modifier son profil tant qu'il est actif.
- [ ] L'auteur peut clôturer son profil ("J'ai trouvé") ; le profil disparaît alors de la liste publique.
- [ ] Un admin/secrétaire peut supprimer n'importe quel profil.
- [ ] La liste peut être filtrée par type de contrat (emploi / stage / alternance).
- [ ] Les membres abonnés aux notifications emploi avec l'option "nouvelles recherches" reçoivent une notification in-app à chaque nouveau profil publié.
- [ ] La page `/jobs` présente bien deux onglets distincts sans régression sur l'onglet "Offres" existant.
- [ ] Un utilisateur non connecté ne peut pas accéder aux profils (comportement inchangé du module).

---

## Hors périmètre

- Relance automatique des profils inactifs depuis plus de 6 mois.
- Mise en relation directe via messagerie interne.
- Système de matching offres ↔ profils.
- Visibilité restreinte (profil visible uniquement par admins).
- Import / export des profils.
- Modération par email (notification à l'auteur en cas de suppression).
- Abonnements par secteur d'activité (les notifications couvrent uniquement le type de contrat en V1).

---

## Questions ouvertes

- Aucune — les décisions structurantes ont été tranchées en amont.

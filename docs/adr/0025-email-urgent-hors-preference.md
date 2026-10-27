# ADR-0025 — Email envoyé malgré la préférence pour un message système urgent

- **Statut** : Accepté
- **Date** : 2026-10-27

## Contexte

Depuis la spec 053 ([ADR-0016](0016-preferences-notifications-email.md)), chaque email
envoyé à un compte respecte la préférence de la personne : interrupteur général, puis
préférence du domaine, puis valeur par défaut du domaine. `CLAUDE.md` interdit de contourner
cette préférence par un `sendEmail` direct.

Les messages système (spec 071) introduisent une sévérité **Urgent**, par exemple « culte de
dimanche déplacé au gymnase ». Un tel message doit atteindre toutes les personnes concernées,
même celles qui ont coupé les emails « Messages de l'administration ». La spec l'exige
explicitement, et l'utilisateur l'a validé.

## Décision

Les helpers de `src/lib/notifications.ts` acceptent une option
`emailPolicy: "preference" | "always"`, avec `"preference"` par défaut.

- Avec `"always"`, `dispatchUserEmails` ignore la préférence. Seule l'absence d'adresse
  empêche l'envoi.
- Le pied de l'email l'indique : « Message urgent : envoyé à toutes les personnes concernées,
  quelles que soient leurs préférences ».
- **Seuls les messages système de sévérité Urgent** utilisent cette option (module `messages`,
  `dispatchDueMessages`).
- La notification native (spec 068) continue de suivre la préférence de l'appareil : seul
  l'email est forcé.

## Alternatives considérées

- **`sendEmail` direct dans le module messages** : écarté. Il contournerait le pied de page et
  la journalisation des échecs, et violerait la règle de `CLAUDE.md` sans trace dans les helpers.
- **Forcer aussi la notification native** : écarté. L'utilisateur a choisi que l'appareil suive
  toujours la préférence ; une notification forcée sur un écran verrouillé serait plus intrusive.
- **Un domaine de notification à part, non désactivable** : écarté. La page « Mes
  notifications » afficherait un réglage sans effet, et chaque message Urgent reposerait sur une
  convention de domaine plutôt que sur une option explicite.

## Conséquences

- La règle « la préférence email est toujours respectée » a désormais **une** exception,
  nommée, testée (`notifications.test.ts`) et documentée dans `CLAUDE.md`. Tout nouvel usage de
  `emailPolicy: "always"` doit être justifié comme un nouvel ADR ou un amendement de celui-ci.
- Un Admin ou une Secrétaire peut joindre par email toute son église en choisissant la sévérité
  Urgent. L'écran de rédaction le rappelle, et chaque publication est journalisée.

## Références

- Spec 071 — `specs/071-messages-systeme/`
- [ADR-0016](0016-preferences-notifications-email.md) — domaines et préférences de notification
- [ADR-0024](0024-notifications-push-web-push.md) — notifications natives

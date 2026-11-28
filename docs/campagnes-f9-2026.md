# Campagne F9 2026 — mode d'emploi

> **Document opérationnel daté** : mode d'emploi de la campagne F9 2026 (échéances en décembre 2026).
> À archiver une fois la campagne transmise. Le fonctionnement général du module est dans
> [CLAUDE.md](../CLAUDE.md#rôles-et-permissions) (« module campagnes de collecte ») et l'[ADR-0032](adr/0032-campagnes-de-collecte.md).

Bilan annuel F9 d'ICC Rennes, collecté par le module `campaigns` (spec 090). Définition : `specs/090-campagnes-collecte/f9-2026.json` (15 questionnaires, 96 items dont 79 codes officiels).

## Échéances

| Date | Quoi |
|---|---|
| 4 décembre 2026 | Réponses internes (tous les questionnaires sauf Coordination) |
| 7 décembre 2026 | Réponses de Coordination générale |
| 10 décembre 2026 | Transmission officielle |

## Mise en place

1. **Importer.** Se connecter en Admin (ou Super Admin), ouvrir `/collectes/import`, déposer `f9-2026.json`.
2. **Lire l'aperçu.** (Depuis la spec 091, la campagne peut aussi se modifier dans l'éditeur graphique, ou se réutiliser par export de la définition et duplication.)
   **Lire l'aperçu** : Vérifier les 15 questionnaires, leurs destinataires et les règles de cohérence. Tout blocage est expliqué ; rien n'est écrit avant la confirmation. Confirmer.
3. **Compléter les répondants.** Les listes `respondents` de la définition sont vides : y mettre les emails avant l'import, ou les ajouter depuis l'onglet **Répondants** de chaque affectation (compte de l'église, ou nom et email pour une personne sans compte, qui reçoit un lien personnel).
4. **Nommer les gestionnaires** depuis la campagne.
5. **Traiter la liste « À confirmer avant ouverture »** ci-dessous.
6. **Ouvrir.** Vérifier la synthèse d'ouverture et prévisualiser les questionnaires (aperçu répondant). Les répondants sont prévenus ; la collecte se relance surtout par WhatsApp : onglet **Communication**, messages à copier (rien n'est envoyé). Relance automatique 2 jours avant l'échéance ; relance manuelle possible à tout moment.
7. **Suivre, corriger, valider.** Filtrer ce qui reste à rechercher, repérer les contributions « Exploitables », rouvrir une contribution soumise ou remplacer un répondant si besoin. Les questionnaires Protection et Comptabilité sont confidentiels. Valider chacun, avec la case « validé par la Pasteure » quand elle l'a vu.
8. **Exporter** en XLSX, puis **clôturer**. Les fichiers sont supprimés 30 jours après.

## À confirmer avant ouverture

- **Choix officiels F1 à F5 et P1.** Les libellés actuels portent le préfixe « [À CONFIRMER] » dans le JSON (tranches F1 à F5, dispositifs P1). Les remplacer par ceux du guide officiel, puis réimporter : l'import est idempotent, et n'est refusé que si un choix déjà utilisé disparaît, donc à faire **avant** l'ouverture.
- **Date d'arrêté des chiffres.** La période de la campagne court du 1er janvier au 30 novembre 2026 (« date commune du bilan »). Confirmer cette date, qui apparaît aussi dans les libellés « à la date du bilan ».
- **Libellés des groupes `D7_NOMS` et `EX2_VILLES`.** Noms des formations pour les leaders et villes des nouvelles familles : codes internes (hors guide officiel), libellés à valider.
- **Codes internes, non transmis à l'officiel** : `M0_C` et `M1_C` (Comptabilité, rapprochement des contributeurs réguliers), `N` (Intégration, population unique des nouveaux), `I1_FIN` à `I4_FIN` (Communication, abonnés à la date du bilan) et `D6_NOM` / `D6_INSCRITS` (champs de la liste des formations D6). Ne pas les recopier dans le fichier officiel. Les codes `FX_*` (signalés `internal`) sont dans le même cas.
- **Répartition guide officiel / V7.** Vérifier quels questionnaires et quelles questions viennent du guide officiel et lesquelles de la V7 (catalogue interne), avant d'ouvrir à tous.

# ADR-0027 — Reprise des mouvements entre modules par lecture, jamais par copie

- **Statut** : Accepté
- **Date** : 2026-11-05

## Contexte

Plusieurs modules financiers doivent afficher des mouvements nés ailleurs :
- la navette (spec 073) montre les avances de budget versées par la comptabilité ;
- la trésorerie (spec 076) doit montrer les paiements de demandes et les abondements de la navette
  payés depuis un compte de trésorerie.

Recopier ces mouvements dans le module qui les affiche crée deux sources de vérité : une
correction à l'origine doit être propagée, un échec de propagation laisse un écart, et le module
d'origine finit par dépendre du module qui affiche. Les modules doivent en outre rester
désactivables séparément (`ENABLED_MODULES`).

## Décision

Un mouvement repris est **lu à son origine**, au moment de l'affichage, et fusionné en lecture
seule dans le registre qui l'affiche :
- l'origine porte, si besoin, une **référence facultative** vers l'objet du module consommateur
  (par exemple `FinancialPayment.treasuryAccountId`) ; cette colonne n'introduit aucun import de
  code ;
- le **module consommateur** lit l'origine via l'index du module d'origine quand il en dépend
  (`dependsOn`), sinon par une lecture Prisma de la table gardée par `registry.has(<module>)`,
  pour rester fonctionnel quand l'origine est désactivée ;
- la référence est posée et validée par la **couche `src/app`** (route de l'origine), seule à
  pouvoir importer les deux modules ; le module d'origine n'importe jamais le consommateur ;
- une ligne reprise ne se modifie qu'à son origine, et les règles du consommateur qui portent sur
  les écritures (mois clôturé, compte archivé) sont vérifiées par cette même route.

## Alternatives considérées

- **Copie au moment du versement, via le bus d'événements** — deux sources de vérité,
  rattrapage nécessaire en cas d'échec, correction à propager.
- **Appel direct du consommateur depuis le service d'origine** — l'origine dépendrait du
  consommateur, ce qui empêche de le désactiver et inverse le sens des dépendances.
- **`dependsOn` vers un module facultatif** — désactiver la navette désactiverait aussi la
  trésorerie.

## Conséquences

- Aucune synchronisation : une correction ou une annulation à l'origine est toujours reflétée.
- Les registres calculent leurs soldes à la lecture ; ils lisent plusieurs tables, ce qui coûte un
  peu plus à l'affichage (volumes faibles).
- Désactiver le module d'origine fait disparaître ses lignes reprises du consommateur.
- Les routes de l'origine portent quelques contrôles du consommateur ; chaque route concernée
  doit être testée.

## Références

- [Spec 073 — navette](../../specs/073-navette-suivi-budgetaire/), lien B
- [Spec 076 — trésorerie](../../specs/076-tresorerie-compta/), issue #712
- ADR-0011, ADR-0012 (modules désactivables)

# ADR-0030 — Moteur de formulaires générique et anonymat par séparation

- **Statut** : Accepté
- **Date** : 2026-11-12

## Contexte

La spec 079 introduit des formulaires construits par le secrétariat : inscriptions (PCNC),
participation à un événement, sondages anonymes ou nominatifs. D'autres modules ont déjà leurs
propres questions (billetterie, candidatures `/servir`, accueil) et pourraient un jour reposer sur
le même moteur. Deux choix sont durables : comment stocker et valider des questions et réponses
dont la forme change d'un formulaire à l'autre, et comment garantir qu'un sondage anonyme le
reste, y compris pour un administrateur qui lit la base.

## Décision

1. **Un module `forms` porte le moteur.** Les questions sont des **lignes typées**
   (`FormQuestion` : type parmi une liste fermée, libellé, aide, obligatoire, configuration JSON,
   condition d'affichage simple), les choix des lignes (`FormChoice`, places facultatives). Les
   réponses sont stockées **par question en JSON** (`FormAnswer.value`) et validées côté serveur
   par un **schéma Zod construit à partir des questions** (`buildAnswerSchema`), qui applique
   aussi l'affichage conditionnel. Les choix retenus sont recopiés dans une table de jointure
   (`FormResponseChoice`) pour compter les places en SQL.
2. **Les autres modules l'utilisent par son index** (`@/modules/forms`), jamais l'inverse ;
   le rattachement d'un formulaire à un objet d'un autre module est une colonne posée par
   `src/app` (ADR-0027).
3. **Anonymat par séparation** : une réponse à un sondage anonyme ne porte ni compte, ni email,
   ni adresse IP, ni horodatage plus fin que le jour. L'unicité « un compte, une réponse » passe
   par un reçu séparé (`FormAnonymousReceipt` : empreinte HMAC du formulaire et du compte, sans
   date ni lien vers la réponse). Aucun journal d'audit n'est écrit pour l'envoi d'une réponse
   anonyme.

## Alternatives considérées

- **Une colonne par question / table par formulaire** — schéma dynamique, migrations à chaud,
  incompatible avec Prisma.
- **Tout le formulaire et ses réponses en un seul JSON** — plus de comptage des places en SQL ni
  de verrou fiable, validation et édition partielle plus fragiles.
- **Librairie tierce (SurveyJS, Form.io)** — écartée par la spec ; dépendance lourde côté client
  et modèle de données imposé.
- **Anonymat par masquage à l'affichage** (compte stocké mais caché) — le lien existerait en
  base et pourrait fuiter par un export, une requête ou une sauvegarde.

## Conséquences

- Ajouter un type de question = étendre l'enum, le schéma dérivé et le rendu, sans migration de
  données.
- La validation d'une réponse dépend de la version courante des questions : la modification d'un
  formulaire qui a des réponses est bornée (pas de suppression d'une question répondue, pas de
  changement d'anonymat).
- Un sondage anonyme ne permet ni de relancer les non-répondants nominativement ni de corriger
  la réponse d'une personne : c'est voulu.
- La billetterie, `/servir` et l'accueil peuvent migrer vers ce moteur plus tard, sans
  obligation.

## Références

- `specs/079-formulaires/spec.md`, `specs/079-formulaires/plan.md`
- ADR-0012 (surface HTTP des modules), ADR-0027 (rattachement par colonne)
- Issue #726

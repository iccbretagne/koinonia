# Collectes

## En une phrase

Réunir des chiffres et des pièces auprès de plusieurs responsables, les contrôler et les valider, sans groupes de discussion ni tableaux envoyés par email.

Exemple : le bilan annuel F9 (voir [docs/campagnes-f9-2026.md](../campagnes-f9-2026.md)).

## Le déclencheur

Un gestionnaire **importe** la définition de la campagne (fichier JSON), vérifie l'aperçu, puis **ouvre** la campagne. Chaque répondant reçoit une notification, ou un email avec son lien personnel s'il n'a pas de compte.

## Qui intervient

| Acteur | Rôle dans le circuit |
|---|---|
| Admin de l'église | Importe une campagne, nomme les gestionnaires |
| Gestionnaire | Suit l'avancement, relance, demande une correction, valide, exporte, clôture |
| Répondant | Remplit et soumet le questionnaire de son entité |

## Les étapes

> Import → Ouverture → Réponses → Soumission → Correction ou validation → Export → Clôture

## Répondre

**Où.** *Collectes* dans le menu. Une personne sans compte ouvre le lien personnel reçu par email.

- **Tout s'enregistre automatiquement.** On peut s'arrêter et reprendre plus tard.
- **Chaque réponse porte un qualificatif.** *Exact* par défaut. *Estimation* si le chiffre est approché, *À rechercher* s'il reste à trouver, *Sans objet* si la question ne vous concerne pas, *NSP* (ne sait pas) quand le questionnaire l'autorise. Une estimation, un « à rechercher » ou un NSP demande une **note** : d'où vient le chiffre, ce qui manque.
- **Les fichiers.** Là où une pièce est demandée, déposer un PDF, un tableur XLSX sans macro ou un CSV (10 Mo au plus). Le type est vérifié sur le contenu, pas sur l'extension.
- **Les alertes de cohérence** (par exemple « S2 ne peut pas dépasser S1 ») préviennent, elles ne bloquent pas.
- **Soumettre.** Les questions obligatoires doivent être renseignées ; un « à rechercher » est accepté et signalé au gestionnaire.
- **Correction demandée.** Le gestionnaire indique un motif. Le questionnaire redevient modifiable : corriger, puis soumettre de nouveau.

## Piloter

**Où.** *Collectes → la campagne*.

| Pour… | Faire… |
|---|---|
| Créer ou mettre à jour une campagne | **Importer**, vérifier l'aperçu, confirmer. Un changement qui ferait perdre des réponses est refusé |
| Ouvrir | **Ouvrir** : les répondants sont prévenus (la première fois seulement) |
| Suivre | Tableau d'avancement, estimations, « à rechercher », contrôles croisés entre questionnaires |
| Relancer | **Relancer** un questionnaire ; une relance automatique part 2 jours avant l'échéance |
| Ajouter un répondant | Onglet **Répondants** : un compte de l'église, ou nom et email pour une personne sans compte. **Régénérer le lien** révoque l'ancien |
| Corriger | **Demander une correction** avec un motif |
| Valider | **Valider** un questionnaire soumis ; cocher « validé par la Pasteure » si c'est le cas |
| Exporter | **Exporter** en XLSX ou CSV, pour toute la campagne ou un questionnaire |
| Clôturer | **Clôturer** : plus de modification. Les fichiers sont supprimés au bout de 30 jours (réglable) |

## Les règles à connaître

- **Les questionnaires confidentiels** ne se voient que des gestionnaires et de leurs répondants.
- **Un gestionnaire ne se retire pas s'il est le dernier.**
- **Les notifications ne contiennent jamais de valeur**, seulement le nom du questionnaire et le lien.

## Ce qui sort à la fin

- Des données validées, exportables, avec leur qualificatif.
- Une campagne clôturée, dont les fichiers sont purgés après la conservation.

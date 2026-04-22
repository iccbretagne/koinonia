---
name: feedback_feature_branch_strategy
description: Pour les refontes longues durée, utiliser une branche feature principale — ne pas merger chaque sous-PR dans main
type: feedback
---

Pour les grandes fonctionnalités multi-semaines (ex. refonte modulaire #211), utiliser une branche longue durée `feat/X` et y merger les sous-PRs. `main` ne reçoit qu'une seule PR quand la feature est prête à déployer.

**Why:** Merger des micro-PRs dans main laisse du code inerte en production et rend le revert impossible sans défaire plusieurs commits éparpillés.

**How to apply:** Dès qu'une issue est taggée comme refonte majeure ou multi-semaines, créer `feat/X` comme branche cible et configurer les sous-PRs pour merger dedans, pas dans main.

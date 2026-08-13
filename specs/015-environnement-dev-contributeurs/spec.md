# Spec — Environnement de développement conteneurisé pour contributeurs

- **Numéro** : 015
- **Statut** : Implémentée
- **Créée le** : 2026-08-11
- **Branche suggérée** : `feat/environnement-dev-contributeurs`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Aujourd'hui, pour contribuer à Koinonia, il faut : installer les dépendances directement sur son poste, charger une base de données avec un jeu de données minimal (noms/prénoms aléatoires, sans utilisateurs ni rôles), puis créer et configurer un vrai client Google OAuth pour pouvoir simplement se connecter à l'application — y compris pour un usage purement local et exploratoire.

Cette dernière étape est un frein réel : un contributeur externe (bénévole, développeur ponctuel, stagiaire) n'a ni la légitimité ni l'envie de créer un projet Google Cloud pour tester une fonctionnalité. Le jeu de données minimal ne permet pas non plus d'explorer les fonctionnalités qui dépendent de données riches (plannings sur plusieurs semaines, absences, demandes, comptes rendus, discipolat), ni de tester facilement le comportement propre à chaque rôle.

Résultat : la mise en route d'un nouveau contributeur est lente, dépend d'allers-retours avec un mainteneur pour obtenir des accès, et décourage les contributions ponctuelles.

## Utilisateurs concernés

Cette feature ne modifie aucun rôle applicatif existant (Super Admin, Admin, Secrétaire, Ministre, Resp. département, STAR, Faiseur de Disciples, Reporter) — elle concerne le **contributeur** qui met en place son environnement de travail, qu'il soit interne ou externe au projet.

Une fois l'environnement démarré, le contributeur doit pouvoir incarner n'importe lequel de ces rôles métier pour tester son travail, via le jeu de données fictif et l'authentification simplifiée décrits ci-dessous.

## Comportement attendu

### Scénario principal

1. Un nouveau contributeur clone le dépôt sur son poste personnel (Windows ou Linux).
2. Il suit une documentation « pas à pas » qui indique précisément les prérequis à installer et les commandes à exécuter, sans étape ambiguë ni sous-entendue.
3. Il démarre, via un mécanisme conteneurisé, l'ensemble de l'environnement applicatif nécessaire (application + base de données) en un nombre réduit de commandes.
4. Un jeu de données fictif, réaliste et représentatif du fonctionnement d'une église (ministères, départements, membres STAR, événements passés et à venir, plannings, absences, demandes, comptes rendus, discipolat) est chargé automatiquement.
5. Il se connecte à l'application en incarnant un utilisateur de test préconfiguré, sans avoir à créer ni configurer de compte Google réel.
6. Il peut naviguer dans l'application avec les fonctionnalités et permissions correspondant au rôle de l'utilisateur de test choisi, comme s'il s'agissait d'une instance réelle.

### Scénarios alternatifs / cas limites

- **Si** les prérequis (outils de conteneurisation, etc.) ne sont pas installés sur le poste, **alors** la documentation les identifie clairement avant toute autre étape, avec un lien d'installation par OS.
- **Si** le contributeur veut repartir d'un environnement vierge, **alors** il doit pouvoir réinitialiser intégralement les données (base + jeu de données fictif) en une seule commande documentée.
- **Si** le contributeur veut tester le comportement d'un autre rôle métier, **alors** il doit pouvoir changer d'utilisateur de test rapidement, sans reconfiguration ni redémarrage de l'environnement.
- **Quand** l'environnement de développement démarre, **alors** cela ne doit jamais nécessiter d'accès à un service externe de production (compte Google OAuth réel, stockage S3, serveur SMTP réel...).
- **Si** un contributeur souhaite malgré tout valider le parcours de connexion Google réel (ex. avant une release touchant l'authentification), **alors** cela doit rester possible en configurant ses propres identifiants, en complément — pas à la place — de l'authentification simplifiée.
- **Si** la documentation devient obsolète (nouvelle dépendance, nouvelle variable d'environnement), **alors** elle doit rester la référence unique consultée par les contributeurs (pas de procédure parallèle non documentée).

## Critères d'acceptation

- [ ] Un contributeur n'ayant jamais travaillé sur le projet peut suivre la documentation seule, sans aide extérieure, et obtenir une instance fonctionnelle de bout en bout.
- [ ] La procédure documentée fonctionne à l'identique sur un poste Windows et sur un poste Linux.
- [ ] Aucune étape de la procédure standard ne requiert la création ou la configuration d'un client Google OAuth réel, ni un accès à un service externe payant ou nécessitant une autorisation.
- [ ] Le jeu de données fictif couvre, dans des proportions réalistes : plusieurs ministères et départements, des membres (STAR), des utilisateurs de test pour chaque rôle métier existant, des événements passés et à venir, des plannings de service, des absences, des demandes, des comptes rendus, et des relations de discipolat.
- [ ] Le contributeur peut se connecter immédiatement en tant qu'utilisateur de n'importe quel rôle métier, sans étape de configuration additionnelle après le démarrage de l'environnement.
- [ ] Il existe une commande documentée unique permettant de réinitialiser entièrement l'environnement (base de données + jeu de données fictif).
- [ ] Le mécanisme d'authentification simplifiée est strictement cantonné à l'environnement de développement : il est impossible qu'il s'active accidentellement en production.
- [ ] Le comportement, la configuration et la sécurité de l'authentification Google OAuth en production restent strictement inchangés.
- [ ] La documentation de déploiement production (`docs/production.md`) n'est pas impactée par cette feature.

## Hors périmètre

- Le déploiement en production (inchangé — voir `docs/production.md`).
- Toute donnée personnelle réelle (nom, email, téléphone d'un membre ou utilisateur réel) dans l'environnement de développement : le jeu de données reste entièrement fictif sur ce plan. Seuls des libellés non personnels observés dans un export de production (noms d'églises, de ministères, de départements, types/titres génériques d'événements, volumétrie) peuvent servir d'inspiration pour la réalisme du jeu de données fictif — jamais une donnée identifiant une personne.
- Les workflows CI/CD existants (build, tests, releases) ne sont pas modifiés par cette feature.
- Le support d'un autre système de base de données que celui déjà utilisé par le projet.
- La mise en place d'un environnement de démonstration public accessible depuis Internet.

## Décisions

- Le jeu de données fictif couvre **plusieurs églises** (2 à 3), avec des périmètres distincts, afin de permettre de tester l'isolation multi-tenant en plus du cas nominal.
- Le jeu de données fictif est **déterministe** : une génération produit toujours le même résultat, pour que la documentation puisse s'appuyer sur des exemples exacts (captures d'écran, identifiants) et que les anomalies constatées soient reproductibles d'un contributeur à l'autre.
- Chaque rôle métier dispose d'**au moins un compte de test dédié**. Le rôle Resp. département dispose en plus d'au moins deux comptes rattachés à des départements différents, afin de pouvoir observer les effets du périmètre (scoping) sur les données visibles.

## Questions ouvertes

*Aucune question bloquante restante — voir la section Décisions ci-dessus.*

# Analyse SonarCloud

La CI cible le projet SonarCloud `iccbretagne_koinonia`, dans l'organisation
`iccbretagne`, sur `https://sonarcloud.io`. Les clés sont versionnées dans
`sonar-project.properties` ; le jeton est un secret GitHub.

## Réglages du serveur

Le Quality Gate « Koinonia progressif » est créé dans SonarCloud par un script,
qui l'associe au projet. Cette association nécessite un plan autorisant les gates
personnalisés (OSS ou Team/Enterprise) : le plan Free la refuse avec HTTP 403,
même si la création du gate a réussi.
Conserver les profils TypeScript/CSS
« Sonar way » et définir le nouveau code par la version précédente sur `main`.
Les PR sont comparées à leur branche cible.

Pour appliquer ou réappliquer ces conditions avec un jeton disposant de
**Administer Quality Gates** et du droit d'administrer le projet :

```bash
python3 scripts/configure-sonar-gate.py
```

Le script demande le jeton sans l'afficher, ou utilise `SONAR_TOKEN` si cette
variable d'environnement est déjà définie. Il crée ou met à jour le gate nommé,
l'associe uniquement à Koinonia et vérifie les conditions enregistrées.

Le workflow manuel **Configure SonarCloud gate**, dans GitHub → Actions, permet
également d'appliquer le gate avec le secret `SONAR_TOKEN`, une fois ce workflow
fusionné dans `main`. Il ne s'exécute pas lors des scans ordinaires et ne change
pas le gate par défaut de l'organisation.

| Condition sur le nouveau code | Seuil |
| --- | --- |
| Sécurité | A |
| Fiabilité | A |
| Maintenabilité | A |
| Security Hotspots examinés, si présents | 100 % |
| Couverture | ≥ 50 % |
| Duplication | ≤ 3 % |

La couverture de 50 % est une étape temporaire : relever à 60 %, puis viser 80 %.
Sonar le marque donc comme non conforme à son standard « Clean as You Code » ;
c'est un gate de transition, pas le gate « Sonar way » standard.
Les indicateurs du code historique servent au suivi de tendance. Ne pas remettre
la référence à zéro pour faire disparaître les anomalies du nouveau code.

## Couverture

`npm run test:coverage` produit `coverage/lcov.info`, importé par Sonar.
Vitest et Sonar mesurent la couverture sur le même périmètre : tout le TypeScript
hors React — cœur, bibliothèques, modules, routes API, helpers `.ts` des pages et
`src/proxy.ts`. Les pages et composants `.tsx` (`src/app/**/*.tsx`,
`src/components/**`) n'ont pas de tests et sont exclus de la couverture
(`sonar.coverage.exclusions`) : sans cela, toute PR d'interface échouerait sur la
condition de couverture du nouveau code. Ils restent soumis aux autres conditions
(fiabilité, sécurité, maintenabilité, duplication). Le jour où des tests de
composants existent, retirer ces deux motifs des exclusions et de `vitest.config.ts`.
Les fichiers générés, déclarations de types, mocks et helpers de tests ne sont
pas des objectifs de couverture. Les tests et helpers sont classés comme tests.

## GitHub Actions

Le workflow `.github/workflows/ci.yml` réutilise le rapport des tests et lance le
scan après les vérifications, sur les pushes vers `main` et les PR internes
vers `main`. Les PR de forks sont exclues du scan car elles n'ont pas accès au
secret ; leurs tests restent exécutés. L'historique
Git complet et la version de l'application sont transmis. Le job attend le
Quality Gate et échoue si celui-ci échoue, empêchant le job `build` de démarrer.
Sur les PR, le scan permet de détecter les problèmes avant fusion. Pour bloquer
la fusion, rendre le check correspondant obligatoire dans les règles de `main`.

Pour activer le scan, dans **Settings → Secrets and variables → Actions** :

1. Dans SonarCloud → Administration → Analysis Method, désactiver
   **Automatic Analysis**. Les analyses automatique et CI ne peuvent pas coexister.
2. Dans SonarCloud → My Account → Security, générer un jeton et l'enregistrer
   comme secret GitHub `SONAR_TOKEN` avec la commande suivante, puis coller sa valeur :

```bash
gh secret set SONAR_TOKEN --repo iccbretagne/koinonia
```

3. Définir la variable GitHub `SONAR_ENABLED` à `true` :

```bash
gh variable set SONAR_ENABLED --body true --repo iccbretagne/koinonia
```

Le workflow reste désactivé pour Sonar tant que cette variable n'est pas définie.
L'URL Cloud est fixée dans le workflow ; aucune variable `SONAR_HOST_URL` n'est requise.

## Consulter l'analyse sans accès à SonarCloud

Le workflow manuel **Sonar report** (GitHub → Actions) exporte l'état de l'analyse avec le
secret `SONAR_TOKEN`, en lecture seule : mesures, Quality Gate et issues ouvertes, résumées par
type, sévérité, règle et fichier dans le résumé du run. L'artefact `sonar-report` contient
`summary.md`, `measures.json`, `issues.json` et `issues.csv`. Il sert depuis un environnement qui
n'atteint pas `sonarcloud.io` (session cloud, mobile). En local :

```bash
SONAR_BRANCH=main python3 scripts/sonar-report.py sonar-report
```

## Faux positifs acceptés

Les issues relues comme volontaires (#539) sont listées dans `scripts/sonar-accepted.json` :
règle, fichiers, justification publiée en commentaire, et plafond. Le workflow manuel
**Sonar accept** les passe à l'état « Accepté » en lot ; sans l'option `apply`, il ne fait que
lister les issues concernées et celles laissées ouvertes. Un groupe qui dépasse son plafond
arrête tout avant la moindre modification : une règle qui gagne du code nouveau n'est jamais
acceptée sans relecture. Le jeton `SONAR_TOKEN` doit avoir le droit **Administer Issues**.

```bash
python3 scripts/sonar-accept.py           # simulation
python3 scripts/sonar-accept.py --apply   # acceptation
```

Références : [couverture TypeScript](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/test-coverage/javascript-typescript-test-coverage),
[analyses CI et automatique](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/ci-based-analysis/overview-of-integrated-cis).

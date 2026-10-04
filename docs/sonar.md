# Analyse SonarCloud

La CI cible le projet SonarCloud `iccbretagne_koinonia`, dans l'organisation
`iccbretagne`, sur `https://sonarcloud.io`. Les clés sont versionnées dans
`sonar-project.properties` ; le jeton est un secret GitHub.

## Réglages du serveur

Le Quality Gate « Koinonia progressif » a été appliqué au SonarQube local.
Le script crée les mêmes conditions dans SonarCloud et associe le gate au projet.
Cette association nécessite un plan autorisant les gates personnalisés (OSS ou
Team/Enterprise) : le plan Free la refuse avec HTTP 403, même si la création du
gate a réussi. Les réglages locaux ne sont pas transférés par le scan.
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
Vitest mesure le cœur, les bibliothèques, les API et les modules. Sonar analyse
tout `src`, y compris les pages et composants : les pourcentages diffèrent par
leur périmètre et leur calcul. Les pages restent dans la couverture Sonar.
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

La configuration locale utilise `docker-compose.sonar.yml` et `.env.sonar`.
Ce fichier d'environnement est ignoré par Git. Pour un scan local du projet
historique, remplacer la clé Cloud avec `-Dsonar.projectKey=koinonia` et fournir
l'URL et le jeton du serveur local. Ne pas versionner les jetons.

Références : [couverture TypeScript](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/test-coverage/javascript-typescript-test-coverage),
[analyses CI et automatique](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/ci-based-analysis/overview-of-integrated-cis).

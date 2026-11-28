# Pipeline CI/CD et accès de déploiement

Comment le code d'un tag devient la production, quels workflows s'enchaînent, et ce qu'il faut
configurer côté serveur et côté GitHub pour qu'ils puissent déployer. La **procédure de release**
pas à pas est dans le [guide de déploiement](README.md#publier-une-version-release-courante).

## Sommaire

- [Les workflows](#les-workflows)
- [Chaîne de production](#chaîne-de-production)
- [Garanties](#garanties)
- [Accès de déploiement : serveur et secrets GitHub](#accès-de-déploiement--serveur-et-secrets-github)

## Les workflows

| Workflow (`.github/workflows/`) | Nom GitHub | Déclencheur | Rôle |
|---|---|---|---|
| `ci.yml` | CI | PR, push sur `main`, push de tag `v*` | PR/`main` : typecheck, lint, frontières, tests, build, migrations, e2e. Tag : empaquette l'**artefact de release** `koinonia-X.Y.Z` et vérifie tag = `package.json` |
| `release.yml` | Release | Manuel, depuis `main` | Vérifie version et CHANGELOG, exige la CI de `main` verte, pousse le tag `vX.Y.Z` et crée la GitHub Release |
| `deploy.yml` | Deploy | Fin réussie de la CI d'un tag `v*`, ou manuel (version) | Promeut l'artefact de la CI vers le serveur de **production** (environnement `production`) |
| `deploy-staging.yml` | Deploy Staging | Manuel uniquement, depuis n'importe quelle branche | Construit puis déploie sur la **recette** (environnement `staging`), sans exiger la CI verte |
| `sonar-report.yml`, `sonar-accept.yml`, `sonar-gate-setup.yml` | Sonar report, Sonar accept, Configure SonarCloud gate | Manuel | Outils SonarCloud (export lecture seule, acceptation en lot, Quality Gate) ; l'analyse elle-même tourne dans la CI. Voir [sonar.md](../sonar.md) |

La CI d'une PR ne lance les jobs de code que si la PR touche autre chose que `specs/`, `docs/`
(hors `docs/openapi.json`) et les `.md`.

## Chaîne de production

```
PR « chore: release vX.Y.Z » mergée sur main (CI de main verte)
        │
        ▼  Actions → Release → Run workflow (main, version X.Y.Z)      [environnement « release »]
tag vX.Y.Z poussé avec RELEASE_TOKEN  +  GitHub Release (notes = section du CHANGELOG)
        │
        ▼  le push du tag déclenche ci.yml
CI du tag : build de l'artefact koinonia-X.Y.Z (tar.gz, 1 seule fois) + check-version
        │
        ▼  fin réussie de la CI (branche = tag v*)
deploy.yml : gate → resolve (tag = commit validé par la CI) → deploy      [environnement « production »]
        │
        ▼
scp de l'artefact, extraction, migrations Prisma, bascule du lien `current`, redémarrage
```

Détail du job `deploy` (script SSH) :

1. extraction dans `releases/koinonia-X.Y.Z` ;
2. assemblage du bundle standalone (`.next/static`, `public`, lien vers `shared/.env`) ;
3. `prisma migrate deploy` ;
4. `current` repointé sur la nouvelle release ;
5. `systemctl restart koinonia`, puis `koinonia-audio-worker` s'il est installé sur l'hôte ;
6. nettoyage : les **3 dernières releases** sont conservées.

L'artefact contient `.next/standalone`, `.next/static`, `dist/` (worker audio et script 092),
`prisma/` (sans `prisma/scripts`), `prisma.config.ts`, `public/`, `package.json` et le
`node_modules` de production (devDependencies élaguées), plus le modèle de l'assistant.

## Garanties

- **Aucune compilation sur le serveur ni dans le job privilégié** : le job `deploy` ne fait pas de
  checkout, il télécharge l'artefact du run CI du tag.
- **Pas de déploiement de production sans CI verte** : même le déclenchement manuel de
  `deploy.yml` exige un run CI réussi pour `v<version>` et vérifie que le tag pointe sur le commit
  validé par ce run.
- **Approbation humaine** : à configurer dans *Settings → Environments*, par « Required reviewers » sur
  `release` (avant tout tag, donc avant tout déploiement) et/ou sur `production` (avant le
  transfert). Ce n'est pas imposé par le code des workflows.
- **La recette ne rejoue ni typecheck, ni lint, ni tests** : elle sert à valider du travail en
  cours. Voir [staging.md](../staging.md).

## Secret `RELEASE_TOKEN`

`release.yml` pousse le tag avec le secret du dépôt `RELEASE_TOKEN` (jeton *fine-grained* limité à ce
dépôt, permission *Contents: Read and write*, ou jeton de GitHub App équivalent). Avec le jeton par
défaut du workflow, le push du tag ne déclencherait ni la CI ni le déploiement. Sans ce secret, le
workflow refuse de démarrer ; il reste possible de tagger à la main (`git tag -a vX.Y.Z -m vX.Y.Z && git push origin vX.Y.Z`)
puis `gh release create`.


## Accès de déploiement : serveur et secrets GitHub

## Prérequis serveur

1. **Clé SSH dédiée** : générer une paire Ed25519 pour l'utilisateur `koinonia` :

```bash
sudo -u koinonia ssh-keygen -t ed25519 -C "deploy@koinonia" -f /home/koinonia/.ssh/id_deploy
```

2. **Autoriser la clé** : ajouter la clé publique dans `/home/koinonia/.ssh/authorized_keys` :

```bash
sudo -u koinonia bash -c 'cat /home/koinonia/.ssh/id_deploy.pub >> /home/koinonia/.ssh/authorized_keys'
```

3. **Sudo restreint** : créer `/etc/sudoers.d/koinonia` (la seconde ligne n'est utile que si le worker audio est installé : le déploiement le redémarre aussi) :

```
koinonia ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart koinonia
koinonia ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart koinonia-audio-worker
```

## GitHub Secrets à configurer

| Secret | Description |
|--------|-------------|
| `DEPLOY_SSH_KEY` | Clé privée Ed25519 (`/home/koinonia/.ssh/id_deploy`) |
| `DEPLOY_HOST` | Adresse IP ou domaine du serveur |
| `DEPLOY_PORT` | Port SSH personnalisé |
| `DEPLOY_USER` | `koinonia` |
| `DEPLOY_PATH` | `/opt/koinonia` |

Ces secrets sont à définir **par environnement** (`Settings > Environments`), la recette et la
production étant deux machines distinctes.

## Identité SSH de l'hôte — risque accepté (audit M-08)

> **État** : non corrigé, **risque formellement accepté** le 2026-08-29.
> **Propriétaire** : responsable technique du projet.
> **Réexamen** : à la prochaine montée de version des actions de déploiement, et au plus tard
> le 2027-02-28.

Les actions de déploiement n'épinglent pas l'empreinte de la clé d'hôte SSH : elles acceptent
donc la clé présentée, quelle qu'elle soit. Un détournement DNS ou réseau sur le trajet
GitHub → serveur permettrait à une machine tierce de recevoir l'artefact **et la clé privée de
déploiement**.

### Pourquoi ce n'est pas corrigé

L'épinglage a été implémenté puis **retiré** : il ne peut pas fonctionner en l'état. Les deux
étapes du déploiement embarquent des versions différentes de `golang.org/x/crypto`, qui ne
classent pas les algorithmes de clé d'hôte dans le même ordre :

| Étape | Binaire | `x/crypto` | Clé négociée |
|---|---|---|---|
| `appleboy/scp-action@v0.1.7` | drone-scp 1.6.14 | v0.17.0 | **ECDSA** |
| `appleboy/ssh-action@v1.2.5` | drone-ssh 1.8.2 | v0.45.0 | **RSA** |

Jusqu'à `x/crypto` v0.37 l'ordre est `ECDSA…, RSA…, ED25519` ; à partir de v0.45 il devient
`RSA…, ECDSA…, ED25519`. Les deux étapes négocient donc **deux clés d'hôte différentes**, et
une empreinte unique ne peut satisfaire que l'une des deux. Monter `scp-action` en v1.0.0 ne
change rien : drone-scp 1.8.0 utilise `x/crypto` v0.37.0, encore côté ECDSA.

### Mesures compensatoires en place

- Clé de déploiement **dédiée**, distincte entre recette et production, sans autre usage.
- `sudo` du compte de déploiement restreint au seul `systemctl restart` des services Koinonia.
- Le déploiement de production ne transporte que l'artefact **déjà construit et testé par la
  CI**, dont le tag et le commit sont vérifiés avant transfert : un attaquant en position
  d'interception ne peut pas faire construire un artefact différent par la chaîne.
- Aucun secret applicatif ne transite par ce canal : `shared/.env` vit sur le serveur.

Ces mesures **ne couvrent pas** le risque principal — la capture de la clé privée de
déploiement par un hôte usurpé. Elles en limitent la portée, elles ne l'annulent pas.

### Conditions de levée

Deux sorties possibles, à instruire au réexamen :

1. **Ne faire offrir qu'un seul type de clé d'hôte par le serveur** (`HostKey` unique dans
   `sshd_config`, ed25519 en pratique). Les deux clients négocient alors la même clé quelle que
   soit leur version, et une empreinte unique redevient possible. Coût : une modification
   `sshd` par machine, et une nouvelle acceptation de clé pour les connexions humaines.
2. **Remplacer les actions tierces par `scp`/`ssh` d'OpenSSH** avec un `known_hosts` épinglé.
   OpenSSH accepte toutes les clés listées : la question de l'ordre disparaît, et le job
   privilégié n'exécute plus de code tiers. Coût : réécriture des deux étapes, à valider en
   recette.

L'option 2 est la cible souhaitable ; elle rejoint la reduction de surface du chemin de
deploiement traitee par [le TODO H-10](../todo-separation-comptes-deploiement.md).

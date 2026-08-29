# TODO — Separer le compte runtime du compte de deploiement (audit H-10)

- **Statut** : a traiter, non commence
- **Origine** : audit securite/qualite du 2026-08-29, constat **H-10** (severite haute)
- **Nature** : infrastructure uniquement — aucun code applicatif ne change
- **Redige le** : 2026-08-29

## Le probleme, verifie dans le depot

Le processus Node et le deploiement SSH utilisent le **meme compte Unix** `koinonia` :

| Fait | Ou |
|---|---|
| `User=koinonia` + `ReadWritePaths=/opt/koinonia` | `docs/production.md` (unite systemd et durcissement) |
| Cle SSH de deploiement generee dans `/home/koinonia/.ssh/id_deploy` et autorisee sur ce compte | `docs/production.md` § Prerequis serveur |
| `koinonia ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart koinonia` | `docs/production.md` § Prerequis serveur |
| Connexion SSH avec `secrets.DEPLOY_USER`, ecriture dans `releases/`, bascule de `current`, `sudo systemctl restart` | `.github/workflows/deploy.yml` |

Une execution de code arbitraire dans le process Node donne donc, **dans le perimetre deja
accorde au compte**, sans elevation de privileges :

1. lecture de `/opt/koinonia/shared/.env` — mot de passe MariaDB, `AUTH_SECRET`, cles S3,
   identifiants SMTP, secret Google OAuth. `AUTH_SECRET` suffit a lui seul a forger la session
   de n'importe quel utilisateur, Super Admin compris ;
2. ecriture dans `releases/` et bascule du lien `current` → **persistance du code** au prochain
   redemarrage ;
3. `sudo systemctl restart koinonia` → l'attaquant declenche lui-meme la bascule ;
4. lecture de la cle privee de deploiement dans `/home/koinonia/.ssh/` → rebond vers la chaine
   de livraison.

## Ce dont le runtime a reellement besoin en ecriture

Trace dans le code — le perimetre est etroit, ce qui rend la separation realiste :

| Chemin | Source | Verdict |
|---|---|---|
| `AUDIO_CACHE_DIR` (`shared/audio-cache`) | `src/modules/audio/services/rendition-cache.ts` (`mkdir`, `createWriteStream`, eviction LRU) | **Seule ecriture persistante necessaire** |
| `mkdtemp(tmpdir())` du worker audio | `src/modules/audio/worker/handlers/probe.ts`, `render.ts` | Couvert par `PrivateTmp=true` |
| `uploads/accounting` sous `process.cwd()` | `src/lib/file-storage.ts` | **Sans objet** : n'est utilise que si `ACCOUNTING_S3_BUCKET` est absent. Confirme configure en production → les pieces jointes comptabilite vont sur S3 |

`releases/`, `current` et `shared/.env` peuvent donc passer en **lecture seule** pour le runtime.

## Cible

- Compte `deploy` : proprietaire de `/opt/koinonia/releases` et du lien `current`, porteur de la
  cle SSH, seul detenteur du `sudo systemctl restart`.
- Compte `koinonia` : runtime uniquement. Lit les releases et `shared/.env` (sans pouvoir les
  ecrire), ecrit dans le seul `shared/audio-cache`.
- `shared/.env` : lisible par `koinonia`, **non modifiable** par lui (proprietaire `deploy` ou
  `root`, groupe partage, `0640`).
- `ReadWritePaths=/opt/koinonia/shared/audio-cache` au lieu de `/opt/koinonia`.
- `NoNewPrivileges=true` conserve, `sudo` retire au compte runtime.

## Travail cote depot

- [ ] Reecrire la procedure `docs/production.md` : creation du compte `deploy`, matrice de
      proprietaires/permissions, unite systemd corrigee (`ReadWritePaths` resserre), sudoers
      deplace sur `deploy`
- [ ] Verifier `deploy.yml` : le workflow marche tel quel avec un `DEPLOY_USER` different, mais
      relire la bascule de `current` et la purge des vieilles releases pour les droits attendus
- [ ] Documenter le **runbook de migration** d'un serveur deja en service (ci-dessous), la
      procedure actuelle ne couvrant que l'installation neuve

## Travail cote serveur — a executer manuellement, recette **puis** production

> Recette et production partagent la meme structure : valider integralement sur la recette
> avant de toucher la production.

- [ ] Creer le compte `deploy` et son `~/.ssh`
- [ ] Deplacer la cle de deploiement de `koinonia` vers `deploy` (ou en generer une nouvelle et
      revoquer l'ancienne — **preferable**, la cle actuelle a ete lisible par le runtime et doit
      etre consideree comme potentiellement exposee)
- [ ] Mettre a jour le secret GitHub `DEPLOY_USER` dans les environnements `staging` et
      `production`, et `DEPLOY_SSH_KEY` si la cle est regeneree
- [ ] Reattribuer `/opt/koinonia/releases` et `current` a `deploy`, en laissant `koinonia` les
      lire (groupe commun)
- [ ] Reattribuer `shared/.env` hors du compte runtime (lecture seule pour lui), et
      `shared/audio-cache` a `koinonia`
- [ ] Deplacer `/etc/sudoers.d/koinonia` vers un `/etc/sudoers.d/deploy` restreint au seul
      `systemctl restart koinonia` (+ `koinonia-audio-worker` la ou il tourne)
- [ ] Resserrer `ReadWritePaths` dans l'unite systemd, `daemon-reload`, redemarrer
- [ ] **Rejouer un deploiement complet** de bout en bout pour prouver que la chaine fonctionne
- [ ] Verifier apres bascule : lecture d'un culte publie (cache audio ecrit), depot d'une piece
      jointe comptabilite (S3), envoi d'un email

## Rotation des secrets — a decider

Tant que les deux roles sont confondus, tout secret de `shared/.env` est a portee d'une RCE. La
separation ne « repare » pas retroactivement une eventuelle fuite. Question a trancher au moment
du traitement : profiter de la migration pour faire tourner `AUTH_SECRET` (deconnecte tous les
utilisateurs), le mot de passe MariaDB et les cles S3.

## Risques

- **Le deploiement est le chemin critique** : une erreur de droits casse la livraison. D'ou la
  validation prealable en recette et le deploiement de bout en bout comme critere de sortie.
- **Rotation de `AUTH_SECRET`** = deconnexion generale : a annoncer si elle est retenue.
- **Le worker audio** (`koinonia-audio-worker.service`, absent de certains hotes) doit recevoir
  le meme traitement que le service principal — il ecrit dans le meme cache.

## Pourquoi passer par `/specify`

Portee infrastructure, execution manuelle sur deux machines en service, et chemin critique de
livraison : la spec servira autant de **runbook de migration** que de specification. Le
traitement direct n'est pas adapte ici.

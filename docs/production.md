# Déploiement en production

> **Ce document a été scindé.** Le contenu vit désormais dans [`docs/deploiement/`](deploiement/README.md),
> organisé en parcours d'opérateur. Cette page ne subsiste que pour que les anciens liens (code,
> ADR, specs, signets) continuent de mener au bon endroit.

**Point d'entrée : [Guide de déploiement](deploiement/README.md)** — vue d'ensemble, première
installation, release, retour arrière, checklist, dépannage.

## Où est passé chaque chapitre

| Ancien chapitre | Nouvel emplacement |
|---|---|
| Prérequis, utilisateur système, structure des dossiers | [serveur.md](deploiement/serveur.md#prérequis) |
| Variables d'environnement | [configuration.md](deploiement/configuration.md#référence-des-variables) |
| Base de données | [serveur.md](deploiement/serveur.md#base-de-données) |
| Déploiement, première installation | [README.md](deploiement/README.md#première-installation) |
| Service systemd, durcissement systemd | [serveur.md](deploiement/serveur.md#service-systemd) |
| Configuration Traefik, IP client, HSTS | [serveur.md](deploiement/serveur.md#configuration-traefik) |
| Rollback | [README.md](deploiement/README.md#retour-arrière-rollback) |
| OAuth Google en production | [serveur.md](deploiement/serveur.md#oauth-google-en-production) |
| Déploiement automatisé (CD), secrets GitHub, identité SSH (M-08) | [ci-cd.md](deploiement/ci-cd.md) |
| Configuration SMTP | [configuration.md](deploiement/configuration.md#configuration-smtp) |
| Cron — tâches planifiées | [exploitation.md](deploiement/exploitation.md#cron--tâches-planifiées) |
| Captures du guide utilisateur | [exploitation.md](deploiement/exploitation.md#captures-du-guide-utilisateur) |
| Stockage S3, sauvegardes, restauration | [configuration.md](deploiement/configuration.md#stockage-s3), [exploitation.md](deploiement/exploitation.md#sauvegardes-de-la-base-de-données) |
| Scripts de maintenance S3 | [exploitation.md](deploiement/exploitation.md#scripts-de-maintenance-s3) |
| Worker audio | [exploitation.md](deploiement/exploitation.md#worker-audio-module-audio) |
| Mise à jour depuis une version précédente, bascule spec 092 | [runbooks.md](deploiement/runbooks.md) |
| Environnement de recette | [staging.md](staging.md) |
| Checklist de production | [README.md](deploiement/README.md#checklist-de-mise-en-production) |

Les ancres historiques les plus citées ont un renvoi ci-dessous.

## Modules optionnels

→ [configuration.md § Modules optionnels](deploiement/configuration.md#modules-optionnels)

## Durcissement : IP client, port applicatif, HSTS

→ [serveur.md § Durcissement](deploiement/serveur.md#durcissement--ip-client-port-applicatif-hsts)

## Sites d'événement : sous-domaines et domaines dédiés (spec 084, ADR-0031)

→ [configuration.md](deploiement/configuration.md#sites-dévénement--sous-domaines-et-domaines-dédiés-spec-084-adr-0031)

## Politique de sécurité du contenu (ADR-0022)

→ [configuration.md § Politique de sécurité du contenu](deploiement/configuration.md#politique-de-sécurité-du-contenu-adr-0022)

## Cron — tâches planifiées

→ [exploitation.md § Cron](deploiement/exploitation.md#cron--tâches-planifiées)

## Procédure de restauration

→ [exploitation.md § Procédure de restauration](deploiement/exploitation.md#procédure-de-restauration)

## Identité SSH de l'hôte — risque accepté (audit M-08)

→ [ci-cd.md](deploiement/ci-cd.md#identité-ssh-de-lhôte--risque-accepté-audit-m-08)

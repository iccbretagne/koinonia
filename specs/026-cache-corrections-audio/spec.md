# Spec — Prise en compte immédiate des corrections audio malgré le cache navigateur

- **Numéro** : 026
- **Statut** : Implémentée
- **Créée le** : 2026-08-29
- **Branche suggérée** : `feat/cache-corrections-audio`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

L'écoute des cultes audio met en cache le fichier de chaque piste sur l'appareil de l'auditeur
pendant une durée très longue, pour éviter de retélécharger le même contenu à chaque lecture.

Quand une équipe de captation corrige un culte déjà publié (montage refait, coupure d'un
passage, réparation d'un problème de son…), les auditeurs qui avaient déjà écouté ce culte
avant la correction continuent d'entendre l'ancienne version, sans aucun moyen de s'en rendre
compte — leur appareil ne redemande jamais le fichier au serveur tant que le cache n'a pas
expiré. Une correction publiée n'atteint donc pas réellement ces auditeurs, ce qui compromet la
raison d'être même de la correction (retirer un contenu erroné ou sensible, améliorer la
qualité).

Ce problème n'existe pas pour un auditeur qui n'a encore jamais ouvert ce culte : il obtient
d'emblée la version corrigée.

## Utilisateurs concernés

- **STAR / tout membre** (droit `audio:listen`, accordé à tous les rôles) : écoute les cultes
  publiés depuis l'espace Audio de l'application.
- **Destinataire d'un lien de partage public** (non authentifié, aucun rôle Koinonia) : écoute
  un culte via un lien partagé, potentiellement sur un appareil déjà utilisé pour une écoute
  précédente du même culte.
- **Resp. département de captation / Ministre / Admin / Secrétaire** (`audio:manage` ou membre
  du département de captation) : produit les corrections — concerné indirectement, car l'objectif
  de la feature est que son travail de correction soit effectivement reçu par les auditeurs.

## Comportement attendu

### Scénario principal

1. Un auditeur écoute une piste d'un culte publié ; son appareil conserve une copie locale du
   fichier.
2. L'équipe de captation corrige ce même culte (nouveau montage d'une ou plusieurs pistes) et
   republie le résultat.
3. L'auditeur revient plus tard sur la page d'écoute de ce culte (espace Audio ou lien de
   partage) et relance la lecture d'une piste corrigée.
4. Il entend la version corrigée, sans avoir eu à vider manuellement le cache de son appareil ou
   de son navigateur.

### Scénarios alternatifs / cas limites

- **Si** une piste n'a pas été retouchée par la correction, **alors** l'auditeur qui la réécoute
  peut continuer à bénéficier d'une copie déjà en cache (pas de retéléchargement inutile).
- **Si** un auditeur n'a jamais écouté ce culte auparavant, **alors** il reçoit directement la
  version corrigée, comme aujourd'hui.
- **Quand** une piste est corrigée plusieurs fois de suite (corrections successives), chaque
  nouvelle version doit être servie à la prochaine lecture, sans accumulation de versions
  obsolètes en cache indéfiniment.

## Critères d'acceptation

- [ ] Après republication d'une correction sur une piste, un auditeur qui rouvre la page
      d'écoute (espace Audio, authentifié) et relance cette piste entend le contenu corrigé,
      même si son navigateur avait déjà mis en cache l'ancienne version.
- [ ] Le même comportement est vérifié pour un auditeur accédant via un lien de partage public
      (non authentifié).
- [ ] Une piste non retouchée par une correction reste éligible à une réutilisation depuis le
      cache de l'auditeur (pas de retéléchargement systématique de tout le culte à chaque
      republication).
- [ ] Un auditeur qui écoute un culte pour la première fois reçoit directement la dernière
      version disponible.
- [ ] Des corrections successives sur une même piste sont toutes prises en compte à la lecture
      suivante, dans l'ordre (la dernière correction publiée est celle qui est entendue).

## Hors périmètre

- La **révocation d'accès** (dépublication d'un culte, révocation d'un lien de partage) reste
  hors périmètre de cette feature : un appareil ayant déjà mis un fichier en cache localement
  peut continuer à le lire après une dépublication ou une révocation côté serveur — cette
  limite est inhérente à toute mise en cache côté appareil et n'est pas résolue ici. Décision :
  cette limite fait l'objet d'un **suivi dédié**, à traiter dans une spec ultérieure (voir
  Questions ouvertes) — elle n'est ni traitée ni acceptée définitivement ici.
- Aucun changement du comportement de production/rendu des pistes audio (montage, encodage,
  déclenchement d'un nouveau rendu) — cette feature ne concerne que ce qui est servi à la
  lecture après qu'une correction a déjà été produite et publiée.
- Aucune notification aux auditeurs qu'une correction a eu lieu.

## Questions ouvertes

- **Tranchée** : la révocation d'accès malgré un cache appareil déjà chaud (dépublication d'un
  culte, révocation d'un lien de partage) ne relève pas de cette spec mais d'un **suivi dédié**
  à ouvrir séparément. Elle appelle des arbitrages qui lui sont propres (durée de conservation
  côté appareil, compromis entre confidentialité et consommation de données, comportement hors
  ligne) et qu'il serait faux de trancher au détour d'un correctif sur les corrections.

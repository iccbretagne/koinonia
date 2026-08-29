# ADR-0009 — Garde de périmètre explicite au point d'entrée

- **Statut** : Accepté
- **Date** : 2026-08-29

## Contexte

ADR-0002 impose l'isolation multi-tenant par `churchId` : toute route doit
résoudre l'église de la ressource visée et vérifier la permission dedans.
Cette discipline est bien respectée dans le code — mais elle ne dit rien du
**périmètre à l'intérieur d'une même église**. Un Responsable de département
(`DEPARTMENT_HEAD`) n'a de légitimité que sur les départements qui lui sont
assignés (`user_departments`) ; un STAR n'a de légitimité sur aucun.

L'audit RBAC mené pour la spec 031 (issues #462/#463/#467) a montré que ce
deuxième niveau de périmètre — au sein d'une église déjà correctement
résolue — n'était pas systématiquement appliqué : 8 routes sur ~160
vérifiaient la permission (`planning:view`/`planning:edit`) et l'église, mais
jamais que le département visé faisait partie du périmètre de l'appelant.
Le helper `getUserDepartmentScope(session, churchId)` existait déjà et était
correctement utilisé par un endpoint (`.../departments/[deptId]/planning`),
mais rien ne rendait son omission détectable ailleurs — ni au typecheck, ni
en revue, jusqu'à ce qu'un audit manuel le trouve.

## Décision

**Toute route qui adresse nominativement une ressource rattachée à un
département (ou, symétriquement, à un ministère) doit passer par une garde
de périmètre explicite au point d'entrée, immédiatement après la résolution
de la permission et de l'église** :

- `requireDepartmentAccess(session, churchId, departmentId)` — jette
  `FORBIDDEN` si le département visé n'est pas dans le périmètre de
  l'appelant. Un périmètre restreint **vide** (ex. STAR, qui n'a aucun
  `user_departments`) refuse tout, sans code spécifique à ce rôle : c'est la
  vacuité du tableau qui porte la restriction totale.
- `getUserMinistryScope(session, churchId)` + une garde équivalente pour les
  actions bornées à un ministère (ex. attribution de rôles par un Ministre).

Ces helpers vivent à côté de `getUserDepartmentScope` dans `src/lib/auth.ts`,
suivent la même convention "jette `FORBIDDEN`" que `requireChurchPermission`,
et sont **distincts** de la vérification d'église : l'église fait autorité
en premier (ADR-0002), le département/ministère ensuite, jamais l'inverse.

Une route qui **liste** plusieurs ressources de départements différents
filtre sur le périmètre plutôt que de refuser (ex. `planning/weekly`) ; une
route qui adresse **une** ressource identifiée par `departmentId`/`deptId`
refuse (403) si elle est hors périmètre. Le principe reste le même dans les
deux cas : le périmètre est vérifié au point d'entrée, jamais implicitement
délégué à l'UI qui masquerait simplement le lien.

**Exigence de non-régression** : toute correction de ce type doit être
couverte par un test automatisé de la même forme que
`.../[deptId]/planning/__tests__/route.test.ts` — un appelant hors périmètre
reçoit un refus — formulé en termes de comportement observable, pas
d'implémentation.

## Alternatives considérées

- **Filtrer côté UI uniquement** (masquer les départements hors périmètre
  dans la navigation) — *Écarté* : c'est exactement le défaut constaté ; le
  masquage visuel ne protège pas un appel direct à l'API.
- **Fusionner le périmètre de responsabilité (`user_departments`) et la
  chaîne d'appartenance (`Member` → `member_departments`)** pour qu'un STAR
  garde un accès de lecture à son propre département — *Écarté*, décision
  actée dans `specs/031-perimetres-acces/spec.md` : restriction totale plus
  simple à raisonner et à auditer que deux chaînes de périmètre distinctes
  fusionnées au cas par cas.
- **Un middleware générique qui déduirait le périmètre depuis l'URL** —
  *Écarté* : la forme du paramètre (`departmentId`, `deptId`, un `id` de
  ressource dont il faut résoudre le département) varie trop d'une route à
  l'autre pour un middleware fiable sans configuration route par route, ce
  qui revient à la garde explicite proposée mais avec une indirection en
  plus.

## Conséquences

- **Positif** : le périmètre est vérifié au même endroit, avec le même
  vocabulaire, que la permission et l'église — un relecteur qui connaît déjà
  `requireChurchPermission` reconnaît immédiatement le motif.
- **Positif** : la vacuité du périmètre (STAR) suffit à produire la
  restriction totale sans branche de code par rôle, donc pas de nouvelle
  surface de bug par rôle ajouté.
- **Négatif / risque** : la garde doit être ajoutée **manuellement** à
  chaque nouvelle route qui adresse un département ou un ministère — rien ne
  l'impose au typecheck. La détection reste la revue de code et les tests de
  non-régression décrits ci-dessus, pas un mécanisme automatique.
- **Conséquence pratique** : toute nouvelle route sous
  `/api/departments/[departmentId]/...` ou qui reçoit un `departmentId`/
  `deptId` en paramètre doit appeler `requireDepartmentAccess` juste après
  `requireChurchPermission`/`resolveChurchId`, et son test dédié doit
  couvrir le cas "hors périmètre → 403".

## Références

- `specs/031-perimetres-acces/spec.md`, `plan.md`, `tasks.md`
- Issues #462, #463, #467
- `src/lib/auth.ts` (`getUserDepartmentScope`, `requireDepartmentAccess`,
  `getUserMinistryScope`)
- ADR-0002 (multi-tenant par `churchId`) — le périmètre de département est le
  niveau de contrôle qui vient après, jamais à sa place

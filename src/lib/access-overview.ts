import { prisma } from "@/lib/prisma";
import { registry } from "@/lib/registry";
import { getUserMinistryScope } from "@/lib/auth";
import type { DeptFunction } from "@/lib/department-functions";
import type { Session } from "next-auth";

/**
 * Accès réels qui ne passent par aucune permission de rôle — appartenance à un département
 * spécialisé, affectation nominative à un dossier (spec 054, critère « accès hérité visible sur
 * la fiche, en lecture seule, avec son origine »). Table déclarative volontairement bornée aux
 * fonctions qui confèrent des droits selon ADR-0014 : une fonction qui n'y figure pas reste en
 * lecture seule (règle par défaut d'ADR-0013), donc sans effet ici.
 */
export type InheritedAccessSource =
  | "department-function"
  | "department-head-function"
  | "secretariat-team"
  | "pastoral-profile"
  | "family-leader"
  | "care-assignment";

export type InheritedAccess = {
  source: InheritedAccessSource;
  label: string;
  origin: string;
};

type FunctionAccessEntry = {
  /** Module dont dépend cet accès — ignoré si le module est désactivé sur l'instance. */
  module: string;
  label: string;
  /** Droit supplémentaire réservé au responsable (DEPARTMENT_HEAD) de ce département. */
  headLabel?: string;
};

const FUNCTION_ACCESS: Partial<Record<DeptFunction, FunctionAccessEntry>> = {
  PROTOCOLE: { module: "agenda", label: "Agenda pastoral : vue hebdomadaire et planification" },
  INTEGRATION: {
    module: "integration",
    label: "Dossiers d'accueil et parcours d'intégration (coordonnées personnelles, export)",
    headLabel: "Réglage des délais de relance (paramètres intégration)",
  },
  MSDP: {
    module: "integration",
    label: "Dossiers d'accueil et parcours d'intégration (coordonnées personnelles, export)",
  },
  CAPTATION_AUDIO: {
    module: "audio",
    label: "Production audio : dépôt, découpage, publication",
    headLabel: "Dépublier un culte déjà partagé",
  },
  PRODUCTION_MEDIA: { module: "media", label: "Espace Communication & Production — Visuels" },
  COMMUNICATION: { module: "media", label: "Espace Communication & Production — Réseaux sociaux" },
  PHOTOS: { module: "media", label: "Espace Communication & Production — Photos" },
};

type DeptRow = { id: string; function: string | null };

async function loadDepartmentsByUser(
  churchId: string,
  userIds: string[]
): Promise<{ any: Map<string, DeptRow[]>; asHead: Map<string, DeptRow[]> }> {
  const any = new Map<string, DeptRow[]>();
  const asHead = new Map<string, DeptRow[]>();
  if (userIds.length === 0) return { any, asHead };

  const push = (map: Map<string, DeptRow[]>, userId: string, dept: DeptRow) => {
    const list = map.get(userId) ?? [];
    if (!list.some((d) => d.id === dept.id)) list.push(dept);
    map.set(userId, list);
  };

  // Départements assignés via un rôle (réellement, seul DEPARTMENT_HEAD porte des lignes
  // `user_departments` — STAR et MINISTER n'y figurent jamais, cf. ADR-0009/ADR-0013).
  const roleDepts = await prisma.userDepartment.findMany({
    where: { userChurchRole: { userId: { in: userIds }, churchId } },
    select: {
      department: { select: { id: true, function: true } },
      userChurchRole: { select: { userId: true, role: true } },
    },
  });
  for (const row of roleDepts) {
    push(any, row.userChurchRole.userId, row.department);
    if (row.userChurchRole.role === "DEPARTMENT_HEAD") {
      push(asHead, row.userChurchRole.userId, row.department);
    }
  }

  // Départements d'appartenance via la fiche STAR liée (member_departments) — même chaîne que
  // les gardes de module (isIntegrationMember, isCaptureTeamMember…) via la session.
  const links = await prisma.memberUserLink.findMany({
    where: { userId: { in: userIds }, churchId },
    select: {
      userId: true,
      member: { select: { departments: { select: { department: { select: { id: true, function: true } } } } } },
    },
  });
  for (const link of links) {
    for (const d of link.member.departments) {
      push(any, link.userId, d.department);
    }
  }

  return { any, asHead };
}

/**
 * Accès hérités d'un mécanisme autre qu'un rôle d'église, pour chaque personne de `userIds`.
 * Une requête par source, pas une par personne (spec 054, plan.md).
 */
export async function listInheritedAccess(
  churchId: string,
  userIds: string[]
): Promise<Map<string, InheritedAccess[]>> {
  const result = new Map<string, InheritedAccess[]>();
  if (userIds.length === 0) return result;

  const add = (userId: string, access: InheritedAccess) => {
    const list = result.get(userId) ?? [];
    list.push(access);
    result.set(userId, list);
  };

  // ── Fonctions de département (ADR-0014) ─────────────────────────────────────────────────
  const { any: deptsByUser, asHead: headDeptsByUser } = await loadDepartmentsByUser(churchId, userIds);
  for (const [userId, depts] of deptsByUser) {
    const seenFunctions = new Set<string>();
    for (const dept of depts) {
      const fn = dept.function as DeptFunction | null;
      if (!fn || seenFunctions.has(fn)) continue;
      const entry = FUNCTION_ACCESS[fn];
      if (!entry || !registry.has(entry.module)) continue;
      seenFunctions.add(fn);
      add(userId, {
        source: "department-function",
        label: entry.label,
        origin: `Membre d'un département de fonction ${fn}`,
      });
    }
  }
  for (const [userId, depts] of headDeptsByUser) {
    const seenFunctions = new Set<string>();
    for (const dept of depts) {
      const fn = dept.function as DeptFunction | null;
      if (!fn || seenFunctions.has(fn)) continue;
      const entry = FUNCTION_ACCESS[fn];
      if (!entry?.headLabel || !registry.has(entry.module)) continue;
      seenFunctions.add(fn);
      add(userId, {
        source: "department-head-function",
        label: entry.headLabel,
        origin: `Responsable d'un département de fonction ${fn}`,
      });
    }
  }

  // ── Équipe Secrétariat (spec 045) : rôle Secrétaire virtuel, non retirable ─────────────────
  for (const [userId, depts] of deptsByUser) {
    if (depts.some((d) => d.function === "SECRETARIAT")) {
      add(userId, {
        source: "secretariat-team",
        label: "Tout ce qu'a la Secrétaire (rôle virtuel, non retirable)",
        origin: "Membre d'un département de fonction SECRETARIAT",
      });
    }
  }

  // ── Profil pastoral lié (lecture seule) ──────────────────────────────────────────────────
  const pastoralProfiles = await prisma.pastoralProfile.findMany({
    where: { churchId, userId: { in: userIds } },
    select: { userId: true, name: true },
  });
  for (const profile of pastoralProfiles) {
    if (!profile.userId) continue;
    add(profile.userId, {
      source: "pastoral-profile",
      label: "Lecture : événements, discipolat, planning, membres, statistiques comptables",
      origin: `Profil pastoral lié (${profile.name})`,
    });
  }

  // ── Berger / co-berger de famille ────────────────────────────────────────────────────────
  const assignments = await prisma.familyLeaderAssignment.findMany({
    where: { churchId, userId: { in: userIds } },
    select: { userId: true, familyId: true },
  });
  const familyCountByUser = new Map<string, number>();
  for (const a of assignments) {
    familyCountByUser.set(a.userId, (familyCountByUser.get(a.userId) ?? 0) + 1);
  }
  for (const [userId, count] of familyCountByUser) {
    add(userId, {
      source: "family-leader",
      label: "Dossiers d'accueil de ses familles, sans export",
      origin: `Berger/co-berger de ${count} famille${count > 1 ? "s" : ""}`,
    });
  }

  // ── Accompagnant en charge d'un suivi pastoral ouvert (spec 052) ────────────────────────
  if (registry.has("care")) {
    const [openAppointments, openFollowUps] = await Promise.all([
      prisma.appointmentRequest.findMany({
        where: {
          churchId,
          status: { in: ["PENDING", "VALIDATED", "SCHEDULED"] },
          OR: [{ assignedMemberId: { in: userIds } }, { assignedTo: { userId: { in: userIds } } }],
        },
        select: { assignedMemberId: true, assignedTo: { select: { userId: true } } },
      }),
      prisma.msdpFollowUp.findMany({
        where: {
          churchId,
          status: { in: ["SUBMITTED", "ASSIGNED", "CONTACTED", "IN_FORMATION"] },
          OR: [{ assignedConseillerMsdpId: { in: userIds } }, { assignedProfile: { userId: { in: userIds } } }],
        },
        select: { assignedConseillerMsdpId: true, assignedProfile: { select: { userId: true } } },
      }),
    ]);
    const careUserIds = new Set<string>();
    for (const a of openAppointments) {
      if (a.assignedMemberId) careUserIds.add(a.assignedMemberId);
      if (a.assignedTo?.userId) careUserIds.add(a.assignedTo.userId);
    }
    for (const f of openFollowUps) {
      if (f.assignedConseillerMsdpId) careUserIds.add(f.assignedConseillerMsdpId);
      if (f.assignedProfile?.userId) careUserIds.add(f.assignedProfile.userId);
    }
    for (const userId of careUserIds) {
      add(userId, {
        source: "care-assignment",
        label: "Ses demandes de rendez-vous pastoral / suivis en cours, uniquement",
        origin: "Accompagnant en charge d'un suivi pastoral ouvert",
      });
    }
  }

  return result;
}

export type AccessPerson = {
  id: string;
  name: string | null;
  displayName: string | null;
  email: string;
  image: string | null;
};

/**
 * Personnes à afficher dans la gestion des accès : rattachées à l'église par un rôle, une fiche
 * liée ou une demande (requête historique de `/admin/access`), **plus** celles qui n'ont qu'un
 * accès hérité (profil pastoral, berger, accompagnant care ouvert) — sans quoi la fiche
 * promise par la spec 054 leur serait inaccessible faute d'apparaître dans la liste.
 */
export async function loadAccessPeople(
  session: Session,
  churchId: string
): Promise<AccessPerson[]> {
  const ministryScope: ReturnType<typeof getUserMinistryScope> = getUserMinistryScope(session, churchId);

  const churchMembershipOr = [
    { churchRoles: { some: { churchId } } },
    { memberLinks: { some: { churchId } } },
    { memberLinkRequests: { some: { churchId } } },
  ];

  const ministryOr = ministryScope.scoped
    ? [
        {
          churchRoles: {
            some: {
              churchId,
              OR: [
                { ministryId: { in: ministryScope.ministryIds } },
                { departments: { some: { department: { ministryId: { in: ministryScope.ministryIds } } } } },
              ],
            },
          },
        },
        {
          memberLinks: {
            some: {
              churchId,
              member: { departments: { some: { department: { ministryId: { in: ministryScope.ministryIds } } } } },
            },
          },
        },
        {
          memberLinkRequests: {
            some: {
              churchId,
              OR: [
                { ministryId: { in: ministryScope.ministryIds } },
                { department: { ministryId: { in: ministryScope.ministryIds } } },
              ],
            },
          },
        },
      ]
    : null;

  const roleBased = await prisma.user.findMany({
    where: ministryOr ? { AND: [{ OR: churchMembershipOr }, { OR: ministryOr }] } : { OR: churchMembershipOr },
    select: { id: true, name: true, displayName: true, email: true, image: true },
    orderBy: { name: "asc" },
  });

  // Un Ministre au périmètre restreint ne doit pas voir les bergers/profils pastoraux/
  // accompagnants d'une autre église via ce complément — mais rien ne le borne à son
  // ministère (ADR-0009 : ces mécanismes sont indépendants de la hiérarchie ministère/département).
  // Un Ministre reste donc non-restreint pour ce complément uniquement s'il a accès global —
  // sinon on le laisse tel quel : Admin/Secrétaire/Super Admin uniquement le verront.
  const heritageOnly = ministryScope.scoped
    ? []
    : await prisma.user.findMany({
        where: {
          AND: [
            { NOT: { OR: churchMembershipOr } },
            {
              OR: [
                { pastoralProfiles: { some: { churchId } } },
                { familyLeaderAssignments: { some: { churchId } } },
                {
                  appointmentsAssigned: {
                    some: { churchId, status: { in: ["PENDING", "VALIDATED", "SCHEDULED"] } },
                  },
                },
                {
                  msdpFollowUpsAssigned: {
                    some: { churchId, status: { in: ["SUBMITTED", "ASSIGNED", "CONTACTED", "IN_FORMATION"] } },
                  },
                },
              ],
            },
          ],
        },
        select: { id: true, name: true, displayName: true, email: true, image: true },
        orderBy: { name: "asc" },
      });

  const byId = new Map<string, AccessPerson>();
  for (const u of [...roleBased, ...heritageOnly]) byId.set(u.id, u);
  return Array.from(byId.values()).sort((a, b) =>
    (a.name ?? a.email).localeCompare(b.name ?? b.email)
  );
}

/**
 * Une personne du périmètre de gestion des accès de l'appelant, ou `null` si elle n'existe pas
 * ou si un Ministre au périmètre restreint n'y a pas accès — même critère que `loadAccessPeople`,
 * pour que la fiche d'une personne (spec 054) ne s'ouvre jamais sur quelqu'un que la liste ne
 * montre pas.
 */
export async function getAccessPerson(
  session: Session,
  churchId: string,
  userId: string
): Promise<AccessPerson | null> {
  const people = await loadAccessPeople(session, churchId);
  return people.find((p) => p.id === userId) ?? null;
}

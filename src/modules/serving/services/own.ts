import type { ServingAssignmentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { WELCOMED_ASSIGNMENT_STATUSES } from "./state";
import type { ApplicationRecord } from "./applications";

/**
 * Vue du STAR sur sa propre fiche (spec 073, D8) : lecture seule, une fois accueilli par au
 * moins un département. Aucune information interne : ni motif, ni département qui a renvoyé, ni
 * notion d'observation « échue ».
 */

export type OwnAssignment = {
  departmentName: string;
  status: Extract<ServingAssignmentStatus, "OBSERVATION" | "CONFIRMED">;
  observationEndsAt: string | null;
};

export type OwnApplicationView = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  profession: string | null;
  maritalStatus: ApplicationRecord["maritalStatus"];
  childrenCount: number | null;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  baptized: boolean | null;
  baptismDate: string | null;
  baptismPlace: string | null;
  previousChurch: boolean | null;
  previousChurchName: string | null;
  previousChurchLocation: string | null;
  pcncTrainings: string[];
  hasServed: boolean | null;
  servedDepartment: string | null;
  ministryService: string | null;
  communityService: string | null;
  otherRoles: string | null;
  availableToServe: boolean | null;
  interests: string | null;
  observations: string | null;
  journeyDetails: string | null;
  spiritualGoals: string | null;
  specificDetails: string | null;
  createdAt: string;
  assignments: OwnAssignment[];
};

type OwnSource = Omit<ApplicationRecord, "member" | "assignments"> & {
  assignments: { status: ServingAssignmentStatus; observationEndsAt: Date | null; department: { name: string } }[];
};

export function toOwnApplicationView(app: OwnSource): OwnApplicationView | null {
  const welcomed = app.assignments.filter((a) => WELCOMED_ASSIGNMENT_STATUSES.includes(a.status));
  if (welcomed.length === 0) return null;
  return {
    id: app.id,
    firstName: app.firstName,
    lastName: app.lastName,
    birthDate: app.birthDate.toISOString().slice(0, 10),
    profession: app.profession,
    maritalStatus: app.maritalStatus,
    childrenCount: app.childrenCount,
    street: app.street,
    city: app.city,
    postalCode: app.postalCode,
    country: app.country,
    phone: app.phone,
    email: app.email,
    baptized: app.baptized,
    baptismDate: app.baptismDate?.toISOString().slice(0, 10) ?? null,
    baptismPlace: app.baptismPlace,
    previousChurch: app.previousChurch,
    previousChurchName: app.previousChurchName,
    previousChurchLocation: app.previousChurchLocation,
    pcncTrainings: Array.isArray(app.pcncTrainings) ? (app.pcncTrainings as string[]) : [],
    hasServed: app.hasServed,
    servedDepartment: app.servedDepartment,
    ministryService: app.ministryService,
    communityService: app.communityService,
    otherRoles: app.otherRoles,
    availableToServe: app.availableToServe,
    interests: app.interests,
    observations: app.observations,
    journeyDetails: app.journeyDetails,
    spiritualGoals: app.spiritualGoals,
    specificDetails: app.specificDetails,
    createdAt: app.createdAt.toISOString(),
    assignments: welcomed.map((a) => ({
      departmentName: a.department.name,
      status: a.status as OwnAssignment["status"],
      observationEndsAt: a.status === "OBSERVATION" ? (a.observationEndsAt?.toISOString() ?? null) : null,
    })),
  };
}

/** Fiche de l'utilisateur dans l'église (via ses fiches STAR liées), ou `null`. */
export async function getOwnApplication(userId: string, churchId: string): Promise<OwnApplicationView | null> {
  const links = await prisma.memberUserLink.findMany({
    where: { userId, churchId, validatedAt: { not: null } },
    select: { memberId: true },
  });
  if (links.length === 0) return null;
  const apps = await prisma.servingApplication.findMany({
    where: {
      churchId,
      memberId: { in: links.map((l) => l.memberId) },
      assignments: { some: { status: { in: [...WELCOMED_ASSIGNMENT_STATUSES] } } },
    },
    include: { assignments: { orderBy: { assignedAt: "asc" }, include: { department: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 1,
  });
  return apps[0] ? toOwnApplicationView(apps[0]) : null;
}

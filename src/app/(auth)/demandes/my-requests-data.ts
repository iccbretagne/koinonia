import { prisma } from "@/lib/prisma";
import { functionForRequestType } from "@/lib/department-functions";
import { getFunctionDepartmentsMap } from "@/lib/function-departments";
import type { RequestType } from "@/generated/prisma/client";

/**
 * Demandes soumises par l'utilisateur dans l'église (« Mes demandes », `/requests`), avec la
 * fonction et les départements destinataires. Extrait de la page pour que l'accueil
 * « Aujourd'hui » (`/accueil`) lise exactement les mêmes données, au même périmètre (ses propres
 * demandes, dans l'église courante). Le contrôle de permission (`members:view`) reste à l'appelant.
 */
export async function loadMyRequests(userId: string, churchId: string) {
  // All requests submitted by the user (both announcement-linked and standalone)
  const requests = await prisma.request.findMany({
    where: {
      churchId,
      submittedById: userId,
      parentRequestId: null,
    },
    include: {
      department: { select: { id: true, name: true } },
      ministry: { select: { id: true, name: true } },
      announcement: {
        select: {
          id: true,
          title: true,
          content: true,
          status: true,
          eventDate: true,
          isSaveTheDate: true,
        },
      },
      childRequests: {
        select: {
          id: true,
          type: true,
          status: true,
          payload: true,
        },
      },
      reviewedBy: { select: { id: true, name: true, displayName: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  const allTypes = new Set<RequestType>();
  for (const r of requests) {
    allTypes.add(r.type);
    for (const child of r.childRequests) allTypes.add(child.type);
  }
  const fnsNeeded = Array.from(new Set(Array.from(allTypes).map(functionForRequestType)));
  const deptsByFn = await getFunctionDepartmentsMap(churchId, fnsNeeded);

  function decorate<T extends { type: RequestType }>(r: T) {
    const fn = functionForRequestType(r.type);
    return { ...r, assignedFunction: fn, assignedDepts: deptsByFn.get(fn) ?? [] };
  }

  const decoratedRequests = requests.map((r) => ({
    ...decorate(r),
    childRequests: r.childRequests.map(decorate),
  }));

  return decoratedRequests;
}

export type MyRequest = Awaited<ReturnType<typeof loadMyRequests>>[number];

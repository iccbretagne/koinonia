import type { Session } from "next-auth";
import { requireChurchPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";

/**
 * Gardes du module forms (spec 079). L'église qui fait foi est celle **du formulaire**, jamais
 * l'église affichée : un formulaire d'une autre église, supprimé ou inexistant donne le même 404.
 */

/** Église d'un formulaire non supprimé, ou 404. */
export async function resolveFormChurchId(formId: string): Promise<string> {
  const form = await prisma.form.findFirst({ where: { id: formId, deletedAt: null }, select: { churchId: true } });
  if (!form) throw new ApiError(404, "Formulaire introuvable");
  return form.churchId;
}

/** `forms:manage` dans l'église du formulaire ; renvoie la session et l'église. */
export async function requireFormManage(formId: string) {
  const churchId = await resolveFormChurchId(formId);
  const session = await requireChurchPermission("forms:manage", churchId);
  return { session, churchId };
}

/** Le compte appartient-il à l'église (un rôle, quel qu'il soit) ? Formulaires « comptes connectés ». */
export function isChurchMember(session: Session | null, churchId: string): boolean {
  if (!session?.user) return false;
  return session.user.isSuperAdmin === true || session.user.churchRoles.some((r) => r.churchId === churchId);
}

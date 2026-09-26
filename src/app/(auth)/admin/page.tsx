import { redirect } from "next/navigation";
import { getCurrentChurchId, requireAuth } from "@/lib/auth";
import { rolePermissions } from "@/lib/registry";

export default async function AdminPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);

  // Permissions calculées sur l'église courante uniquement (spec 024) — sinon un responsable de
  // l'église A obtient les droits de l'église B (issue #490).
  const churchRoles = churchId
    ? session.user.churchRoles.filter((r) => r.churchId === churchId)
    : [];
  const userPermissions = new Set(churchRoles.flatMap((r) => rolePermissions[r.role] ?? []));

  if (session.user.isSuperAdmin || userPermissions.has("church:manage")) {
    redirect("/admin/churches");
  }
  if (userPermissions.has("users:manage")) {
    redirect("/admin/users");
  }
  if (userPermissions.has("access:manage")) {
    redirect("/admin/access");
  }

  throw new Error("FORBIDDEN");
}

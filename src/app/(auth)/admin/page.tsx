import { redirect } from "next/navigation";
import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export default async function AdminPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (churchId) await requireChurchPermission("members:manage", churchId);

  const userRoles = session.user.churchRoles.map((r) => r.role);
  const userPermissions = new Set(userRoles.flatMap((r) => hasPermission(r)));

  if (userPermissions.has("church:manage")) {
    redirect("/admin/churches");
  }

  redirect("/admin/users");
}

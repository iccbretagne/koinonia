import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import MinistriesClient from "./MinistriesClient";

export default async function MinistriesPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (churchId) await requireChurchPermission("departments:manage", churchId);

  const churchRoles = session.user.churchRoles;
  const isSuperAdmin = churchRoles.some((r) => r.role === "SUPER_ADMIN");
  const isMinisterOnly = !churchRoles.some((r) =>
    ["SUPER_ADMIN", "ADMIN"].includes(r.role)
  );

  const churches = isSuperAdmin
    ? await prisma.church.findMany({ orderBy: { name: "asc" } })
    : churchRoles.map((r) => r.church);

  const uniqueChurches = Array.from(
    new Map(churches.map((c) => [c.id, c])).values()
  );

  const ministries = await prisma.ministry.findMany({
    where: isSuperAdmin
      ? undefined
      : { churchId: { in: uniqueChurches.map((c) => c.id) } },
    include: { church: { select: { id: true, name: true } } },
    orderBy: [{ church: { name: "asc" } }, { name: "asc" }],
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Ministères</h1>
      <MinistriesClient
        initialMinistries={ministries}
        churches={uniqueChurches.map((c) => ({ id: c.id, name: c.name }))}
        readOnly={isMinisterOnly}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}

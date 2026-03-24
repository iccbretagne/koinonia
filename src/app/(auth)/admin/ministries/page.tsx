import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import MinistriesClient from "./MinistriesClient";

export default async function MinistriesPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-gray-500">Aucune église sélectionnée.</p>;
  await requireChurchPermission("departments:manage", churchId);

  const churchRoles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  const isSuperAdmin = session.user.churchRoles.some((r) => r.role === "SUPER_ADMIN");
  const isMinisterOnly = !churchRoles.some((r) =>
    ["SUPER_ADMIN", "ADMIN"].includes(r.role)
  );

  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: { id: true, name: true },
  });

  const ministries = await prisma.ministry.findMany({
    where: { churchId },
    include: { church: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Ministères</h1>
      <MinistriesClient
        initialMinistries={ministries}
        churches={church ? [{ id: church.id, name: church.name }] : []}
        readOnly={isMinisterOnly}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}

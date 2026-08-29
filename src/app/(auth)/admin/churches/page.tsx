import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ChurchesClient from "./ChurchesClient";

export default async function ChurchesPage() {
  await requireSuperAdmin();

  const churches = await prisma.church.findMany({
    include: {
      _count: { select: { users: true, ministries: true, events: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Églises</h1>
      <ChurchesClient
        initialChurches={churches.map((c) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}

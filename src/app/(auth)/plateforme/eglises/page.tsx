import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ChurchesClient from "./ChurchesClient";
import { PageHeader } from "@/components/ui";

export default async function ChurchesPage() {
  await requireSuperAdmin();

  const churches = await prisma.church.findMany({
    include: {
      _count: { select: { users: true, ministries: true, events: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Églises" />
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

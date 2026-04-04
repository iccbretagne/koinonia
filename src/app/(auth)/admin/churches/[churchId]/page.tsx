import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ChurchEditClient from "./ChurchEditClient";

export default async function ChurchDetailPage({
  params,
}: {
  params: Promise<{ churchId: string }>;
}) {
  await requirePermission("church:manage");
  const { churchId } = await params;

  const church = await prisma.church.findUnique({
    where: { id: churchId },
  });

  if (!church) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Modifier l&apos;église
      </h1>
      <ChurchEditClient church={{ id: church.id, name: church.name, slug: church.slug, secretariatEmail: church.secretariatEmail ?? "" }} />
    </div>
  );
}

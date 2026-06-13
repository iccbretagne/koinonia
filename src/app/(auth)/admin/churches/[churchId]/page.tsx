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
    select: {
      id: true,
      name: true,
      slug: true,
      secretariatEmail: true,
      accountingEmail: true,
      primaryColor: true,
      responsibleProfileId: true,
      supervisorProfileId: true,
    },
  });

  if (!church) notFound();

  // Profils pastoraux de cette église (pour le sélecteur responsable)
  const profiles = await prisma.pastoralProfile.findMany({
    where: { churchId },
    select: { id: true, name: true, role: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  // Tous les profils pastoraux (potentiels superviseurs, toutes églises)
  const supervisorCandidates = await prisma.pastoralProfile.findMany({
    select: { id: true, name: true, role: true, church: { select: { name: true } } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const roleLabel: Record<string, string> = {
    PASTEUR: "Pasteur",
    ASSISTANT_PASTEUR: "Assistant pasteur",
    BERGER: "Berger",
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Modifier l&apos;église
      </h1>
      <ChurchEditClient
        church={{
          id: church.id,
          name: church.name,
          slug: church.slug,
          secretariatEmail: church.secretariatEmail ?? "",
          accountingEmail: church.accountingEmail ?? "",
          primaryColor: church.primaryColor ?? "#5E17EB",
          responsibleProfileId: church.responsibleProfileId ?? "",
          supervisorProfileId: church.supervisorProfileId ?? "",
        }}
        profiles={profiles.map((p) => ({ id: p.id, label: `${p.name} (${roleLabel[p.role]})` }))}
        supervisors={supervisorCandidates.map((s) => ({
          id: s.id,
          label: `${s.name} (${roleLabel[s.role]}) — ${s.church.name}`,
        }))}
      />
    </div>
  );
}

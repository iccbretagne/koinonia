import { requireChurchPermission, hasChurchPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseEmailList } from "@/lib/email";
import { notFound } from "next/navigation";
import ChurchEditClient from "./ChurchEditClient";
import ChurchAssistantToggle from "./ChurchAssistantToggle";
import ChurchMcpCard from "./ChurchMcpCard";
import { registry } from "@/lib/registry";

export default async function ChurchDetailPage({
  params,
}: {
  readonly params: Promise<{ churchId: string }>;
}) {
  const { churchId } = await params;
  // Admin de l'église (church:settings) ; nom, adresse et superviseur réservés à church:manage
  const session = await requireChurchPermission("church:settings", churchId);
  const canEditIdentity = await hasChurchPermission(session, "church:manage", churchId);

  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: {
      id: true,
      name: true,
      slug: true,
      secretariatEmails: true,
      accountingEmails: true,
      primaryColor: true,
      responsibleProfileId: true,
      supervisorProfileId: true,
      logos: { select: { variant: true, version: true } },
    },
  });

  if (!church) notFound();

  // Profils pastoraux de cette église (pour le sélecteur responsable)
  const profiles = await prisma.pastoralProfile.findMany({
    where: { churchId },
    select: { id: true, name: true, role: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  // Potentiels superviseurs (toutes églises) : chargés seulement pour qui peut le changer ; un
  // Admin ne voit que le superviseur actuel.
  const supervisorCandidates = await prisma.pastoralProfile.findMany({
    where: canEditIdentity ? undefined : { id: church.supervisorProfileId ?? "" },
    select: { id: true, name: true, role: true, church: { select: { name: true } } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  // Assistant (spec 075) : interrupteur proposé seulement si l'instance l'a activé.
  const assistant = registry.has("assistant")
    ? await import("@/modules/assistant").then(({ getChurchSetting }) => getChurchSetting(churchId)).catch(() => null)
    : null;

  // Assistants IA (spec 081) : carte proposée seulement si l'instance a activé la fonction.
  const mcp = registry.has("mcp")
    ? await import("@/modules/mcp")
        .then(async (m) =>
          (await m.getMcpInstanceSettings()).enabled
            ? { enabled: await m.getMcpChurchEnabled(churchId), connections: await m.listChurchConnections(churchId) }
            : null
        )
        .catch(() => null)
    : null;

  const roleLabel: Record<string, string> = {
    PASTEUR: "Pasteur",
    ASSISTANT_PASTEUR: "Assistant pasteur",
    BERGER: "Berger",
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink mb-6">
        {canEditIdentity ? "Modifier l'église" : "Paramètres de l'église"}
      </h1>
      <ChurchEditClient
        canEditIdentity={canEditIdentity}
        church={{
          id: church.id,
          name: church.name,
          slug: church.slug,
          secretariatEmails: parseEmailList(church.secretariatEmails),
          accountingEmails: parseEmailList(church.accountingEmails),
          primaryColor: church.primaryColor ?? "#5E17EB",
          responsibleProfileId: church.responsibleProfileId ?? "",
          supervisorProfileId: church.supervisorProfileId ?? "",
          logoVersions: {
            light: church.logos.find((l) => l.variant === "light")?.version ?? null,
            dark: church.logos.find((l) => l.variant === "dark")?.version ?? null,
          },
        }}
        profiles={profiles.map((p) => ({ id: p.id, label: `${p.name} (${roleLabel[p.role]})` }))}
        supervisors={supervisorCandidates.map((s) => ({
          id: s.id,
          label: `${s.name} (${roleLabel[s.role]}) — ${s.church.name}`,
        }))}
      />
      {assistant?.instanceEnabled && <ChurchAssistantToggle churchId={churchId} disabled={assistant.disabled} />}
      {mcp && <ChurchMcpCard churchId={churchId} enabled={mcp.enabled} connections={mcp.connections} />}
    </div>
  );
}

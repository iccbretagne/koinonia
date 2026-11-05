import { requireSuperAdmin } from "@/lib/auth";
import { PageHeader, Tabs } from "@/components/ui";
import { countOpenPending, getInstanceSettings, listAdminEntries, listPending, readStats } from "@/modules/assistant";
import { PENDING_STATUSES } from "@/modules/assistant/schemas";
import AssistantAdminClient from "./AssistantAdminClient";

const TABS = [
  { key: "usage", label: "Usage" },
  { key: "questions", label: "Questions à traiter" },
  { key: "base", label: "Base" },
  { key: "reglages", label: "Réglages" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/**
 * Assistant de prise en main (spec 075) : réglage de plateforme, réservé au Super Admin — la
 * base de connaissances et les questions remontées sont communes à l'instance, sans compte ni
 * église.
 */
export default async function AssistantAdminPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ onglet?: string; statut?: string }> }>) {
  await requireSuperAdmin();
  const { onglet, statut } = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === onglet) ? (onglet as TabKey) : "questions";
  const status = PENDING_STATUSES.find((s) => s === statut) ?? "OPEN";

  const [settings, open, stats, pending, entries] = await Promise.all([
    getInstanceSettings(),
    countOpenPending(),
    tab === "usage" ? readStats() : null,
    tab === "questions" ? listPending(status) : null,
    tab === "questions" || tab === "base" ? listAdminEntries() : null,
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Administration · Plateforme"
        title="Assistant"
        description="Usage, questions remontées par les utilisateurs (anonymes) et base de connaissances, pour toute l'instance."
      />
      <Tabs
        ariaLabel="Sections de l'assistant"
        tabs={TABS.map((t) => ({
          href: `/admin/assistant?onglet=${t.key}`,
          label: t.label,
          active: t.key === tab,
          count: t.key === "questions" ? open : undefined,
        }))}
      />
      <AssistantAdminClient
        tab={tab}
        enabled={settings.enabled}
        status={status}
        stats={stats}
        pending={pending?.map((p) => ({ ...p, firstAt: p.firstAt.toISOString(), lastAt: p.lastAt.toISOString(), resolvedAt: p.resolvedAt?.toISOString() ?? null })) ?? null}
        entries={entries}
      />
    </div>
  );
}

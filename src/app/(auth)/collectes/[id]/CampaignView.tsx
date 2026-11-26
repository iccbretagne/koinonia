"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, ConfirmModal, PageHeader, StatusChip, Tabs } from "@/components/ui";
import { CAMPAIGN_STATUS_LABELS } from "@/modules/campaigns/schemas";
import { CAMPAIGN_STATUS_TONES, formatDay } from "../_components/display";
import { CAMPAIGN_TABS, type CampaignOverviewData, type CampaignTab } from "./types";
import { useApi } from "../_components/use-api";
import TrackingTab from "./TrackingTab";
import ChecksTab from "./ChecksTab";
import RespondentsTab from "./RespondentsTab";
import ManagersTab from "./ManagersTab";
import SettingsTab from "./SettingsTab";
import ExportTab from "./ExportTab";

const TAB_LABELS: Record<CampaignTab, string> = {
  suivi: "Suivi",
  controles: "Contrôles",
  repondants: "Répondants",
  gestionnaires: "Gestionnaires",
  parametres: "Paramètres",
  export: "Export",
};

type StatusAction = "open" | "close" | "reopen";

const STATUS_ACTIONS: Record<StatusAction, { label: string; title: string; message: string; variant: "primary" | "danger" }> = {
  open: {
    label: "Ouvrir la campagne",
    title: "Ouvrir la campagne ?",
    message: "Les répondants peuvent saisir dès maintenant. À la première ouverture, chacun reçoit une notification avec son lien.",
    variant: "primary",
  },
  close: {
    label: "Clôturer",
    title: "Clôturer la campagne ?",
    message: "La saisie s'arrête, les liens personnels cessent de fonctionner et la durée de conservation des fichiers commence. Vous pourrez la rouvrir.",
    variant: "danger",
  },
  reopen: {
    label: "Rouvrir",
    title: "Rouvrir la campagne ?",
    message: "Les questionnaires non soumis redeviennent modifiables. Aucune notification n'est envoyée.",
    variant: "primary",
  },
};

function periodLabel(c: CampaignOverviewData["campaign"]): string | null {
  if (!c.periodStart && !c.periodEnd) return null;
  return `Période du ${formatDay(c.periodStart)} au ${formatDay(c.periodEnd)}`;
}

/** Pilotage d'une campagne (spec 090) : en-tête, actions de cycle de vie, onglets (`?onglet=`). */
export default function CampaignView({
  tab,
  overview,
  codeForms,
}: {
  readonly tab: CampaignTab;
  readonly overview: CampaignOverviewData;
  readonly codeForms: Record<string, string>;
}) {
  const { call, busy } = useApi();
  const [pending, setPending] = useState<StatusAction | null>(null);
  const { campaign } = overview;
  const base = `/collectes/${campaign.id}`;

  let action: StatusAction = "reopen";
  if (campaign.status === "DRAFT") action = "open";
  else if (campaign.status === "OPEN") action = "close";
  const statusAction = STATUS_ACTIONS[action];

  async function confirmStatus() {
    if (!pending) return;
    const done = await call(`/api/campaigns/${campaign.id}/status`, "POST", { action: pending }, "État de la campagne mis à jour");
    if (done) setPending(null);
  }

  const description = [periodLabel(campaign), `Échéance ${formatDay(campaign.dueAt)}`].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <Link href="/collectes" className="hover:underline">
            Collectes
          </Link>
        }
        title={campaign.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusChip tone={CAMPAIGN_STATUS_TONES[campaign.status]}>{CAMPAIGN_STATUS_LABELS[campaign.status]}</StatusChip>
            <span>{description}</span>
          </span>
        }
        actions={
          <Button type="button" variant={statusAction.variant === "danger" ? "secondary" : "primary"} onClick={() => setPending(action)} disabled={busy}>
            {statusAction.label}
          </Button>
        }
      >
        <Tabs
          ariaLabel="Pilotage de la campagne"
          tabs={CAMPAIGN_TABS.map((t) => ({
            href: t === "suivi" ? base : `${base}?onglet=${t}`,
            label: TAB_LABELS[t],
            active: t === tab,
            count: t === "controles" ? overview.checks.filter((c) => c.result === "violated").length || undefined : undefined,
          }))}
        />
      </PageHeader>

      {tab === "suivi" && <TrackingTab overview={overview} />}
      {tab === "controles" && <ChecksTab checks={overview.checks} forms={overview.forms} codeForms={codeForms} />}
      {tab === "repondants" && <RespondentsTab campaignId={campaign.id} campaignStatus={campaign.status} forms={overview.forms} />}
      {tab === "gestionnaires" && <ManagersTab campaignId={campaign.id} managers={overview.managers} />}
      {tab === "parametres" && <SettingsTab campaign={campaign} />}
      {tab === "export" && <ExportTab campaignId={campaign.id} forms={overview.forms} />}

      <ConfirmModal
        open={pending !== null}
        title={statusAction.title}
        message={statusAction.message}
        confirmLabel={statusAction.label}
        variant={statusAction.variant}
        confirming={busy}
        onConfirm={confirmStatus}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

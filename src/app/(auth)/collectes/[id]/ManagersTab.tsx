"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Alert, Button, ConfirmModal, Modal } from "@/components/ui";
import { formatDay } from "../_components/display";
import { useApi } from "../_components/use-api";
import CandidatePicker from "./CandidatePicker";
import type { CampaignOverviewData } from "./types";

type Manager = CampaignOverviewData["managers"][number];

/** Onglet Gestionnaires : ajout par recherche d'un compte de l'église, retrait (jamais le dernier). */
export default function ManagersTab({ campaignId, managers }: { readonly campaignId: string; readonly managers: readonly Manager[] }) {
  const { call, busy } = useApi();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Manager | null>(null);
  const last = managers.length <= 1;

  async function add(userId: string) {
    const done = await call(`/api/campaigns/${campaignId}/managers`, "POST", { userId }, "Gestionnaire ajouté");
    if (done) setAdding(false);
  }

  async function remove() {
    if (!removing) return;
    const done = await call(`/api/campaigns/${campaignId}/managers/${removing.userId}`, "DELETE", undefined, "Gestionnaire retiré");
    if (done) setRemoving(null);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Alert tone="info">
        Un gestionnaire pilote la campagne et voit tout son contenu, questionnaires confidentiels compris. Les administrateurs de
        l&apos;église en sont gestionnaires d&apos;office.
      </Alert>
      <div className="flex justify-end">
        <Button type="button" variant="secondary" onClick={() => setAdding(true)}>
          <UserPlus aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Ajouter un gestionnaire
        </Button>
      </div>
      <ul className="overflow-hidden rounded-card border border-line bg-surface">
        {managers.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-ink">{m.name}</p>
              <p className="truncate text-[13px] text-ink-muted">
                {m.email} · depuis le {formatDay(m.addedAt)}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy || last}
              title={last ? "Une campagne garde toujours au moins un gestionnaire" : undefined}
              onClick={() => setRemoving(m)}
            >
              Retirer
            </Button>
          </li>
        ))}
        {managers.length === 0 && <li className="px-4 py-3 text-[15px] text-ink-muted">Aucun gestionnaire désigné.</li>}
      </ul>

      <Modal open={adding} onClose={() => setAdding(false)} title="Ajouter un gestionnaire">
        <CandidatePicker
          campaignId={campaignId}
          exclude={(c) => managers.some((m) => m.userId === c.id)}
          actionLabel="Ajouter"
          disabled={busy}
          onPick={(c) => void add(c.id)}
        />
      </Modal>

      <ConfirmModal
        open={removing !== null}
        title={`Retirer ${removing?.name ?? ""} ?`}
        message="Cette personne ne pilotera plus la campagne et n'en verra plus le contenu."
        confirmLabel="Retirer"
        confirming={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

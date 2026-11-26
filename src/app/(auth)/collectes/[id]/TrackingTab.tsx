"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Button, Checkbox, DataTable, Modal, Select, StatusChip, Textarea, buttonClasses } from "@/components/ui";
import { ASSIGNMENT_STATUSES, ASSIGNMENT_STATUS_LABELS, type AssignmentStatus } from "@/modules/campaigns/schemas";
import { ASSIGNMENT_STATUS_TONES, formatDateTime, formatDay, percent } from "../_components/display";
import { useApi } from "../_components/use-api";
import type { AssignmentData, CampaignOverviewData } from "./types";

type Row = AssignmentData & { formTitle: string; confidential: boolean };

const OPEN_STATUSES: readonly AssignmentStatus[] = ["NOT_STARTED", "IN_PROGRESS", "CHANGES_REQUESTED"];

function Indicator({ label, value, detail }: { readonly label: string; readonly value: string; readonly detail?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-card border border-line bg-surface px-4 py-3">
      <span className="text-[13px] leading-[18px] text-ink-muted">{label}</span>
      <span className="font-display text-[22px] font-bold leading-7 tabular-nums text-ink">{value}</span>
      {detail && <span className="text-[13px] leading-[18px] text-ink-subtle">{detail}</span>}
    </div>
  );
}

function completenessLabel(row: Row): string {
  const missing = row.completeness.missing.length;
  if (missing === 0) return "Complet";
  return `${missing} manquante${missing > 1 ? "s" : ""}`;
}

/** Onglet Suivi : indicateurs, filtres, affectations et gestes de pilotage par ligne. */
export default function TrackingTab({ overview }: { readonly overview: CampaignOverviewData }) {
  const { call, busy } = useApi();
  const { campaign, progress } = overview;
  const [statusFilter, setStatusFilter] = useState("");
  const [formFilter, setFormFilter] = useState("");
  const [changes, setChanges] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [validating, setValidating] = useState<Row | null>(null);
  const [pastoral, setPastoral] = useState(false);

  const rows: Row[] = useMemo(
    () =>
      overview.forms.flatMap((f) =>
        f.assignments.map((a) => ({ ...a, formTitle: f.title, confidential: f.confidential }))
      ),
    [overview.forms]
  );
  const shown = rows.filter((r) => (!statusFilter || r.status === statusFilter) && (!formFilter || r.formTitle === formFilter));
  const open = campaign.status === "OPEN";

  async function remind(row: Row) {
    await call(`/api/campaigns/assignments/${row.id}/remind`, "POST", undefined, "Relance envoyée");
  }

  async function requestChanges() {
    if (!changes || !reason.trim()) return;
    const done = await call(
      `/api/campaigns/assignments/${changes.id}/review`,
      "POST",
      { action: "request_changes", reason: reason.trim() },
      "Correction demandée"
    );
    if (done) {
      setChanges(null);
      setReason("");
    }
  }

  async function validate() {
    if (!validating) return;
    const done = await call(
      `/api/campaigns/assignments/${validating.id}/review`,
      "POST",
      { action: "validate", pastoralValidated: pastoral },
      "Questionnaire validé"
    );
    if (done) {
      setValidating(null);
      setPastoral(false);
    }
  }

  const done = progress.byStatus.SUBMITTED + progress.byStatus.VALIDATED;

  return (
    <div className="flex flex-col gap-6">
      {campaign.status === "DRAFT" && (
        <Alert tone="info" title="Brouillon.">
          Les répondants ne voient rien tant que la campagne n&apos;est pas ouverte.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Indicator label="Avancement" value={percent(progress.rate)} detail={`${done}/${progress.total} rendus`} />
        <Indicator
          label="Soumis / validés"
          value={`${progress.byStatus.SUBMITTED} / ${progress.byStatus.VALIDATED}`}
          detail={`sur ${progress.total} questionnaire${progress.total > 1 ? "s" : ""}`}
        />
        <Indicator label="Réponses manquantes" value={String(progress.missing)} />
        <Indicator label="Estimations" value={String(progress.estimates)} />
        <Indicator label="À rechercher" value={String(progress.toResearch)} />
        <Indicator label="Fichiers reçus" value={`${progress.filesReceived} / ${progress.filesExpected}`} detail="demandes avec fichier" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:max-w-2xl">
        <Select
          label="État"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[{ value: "", label: "Tous les états" }, ...ASSIGNMENT_STATUSES.map((s) => ({ value: s, label: ASSIGNMENT_STATUS_LABELS[s] }))]}
        />
        <Select
          label="Questionnaire"
          value={formFilter}
          onChange={(e) => setFormFilter(e.target.value)}
          options={[{ value: "", label: "Tous les questionnaires" }, ...overview.forms.map((f) => ({ value: f.title, label: f.title }))]}
        />
      </div>

      <DataTable<Row>
        data={shown}
        emptyMessage={rows.length === 0 ? "Aucun questionnaire dans cette campagne." : "Aucun questionnaire pour ces filtres."}
        columns={[
          {
            header: "Destinataire",
            primary: true,
            accessor: (r) => (
              <span className="flex flex-wrap items-center gap-2">
                <span>{r.label}</span>
                {r.confidential && <StatusChip tone="danger">Confidentiel</StatusChip>}
              </span>
            ),
          },
          { header: "Questionnaire", accessor: "formTitle" },
          {
            header: "Répondants",
            accessor: (r) => (r.respondents.length ? r.respondents.map((x) => x.name).join(", ") : <span className="text-warning">Aucun</span>),
          },
          {
            header: "État",
            accessor: (r) => (
              <span className="flex flex-wrap items-center gap-1">
                <StatusChip tone={ASSIGNMENT_STATUS_TONES[r.status]}>{ASSIGNMENT_STATUS_LABELS[r.status]}</StatusChip>
                {r.pastoralValidated && <StatusChip tone="success">Pasteure</StatusChip>}
              </span>
            ),
          },
          { header: "Complétude", accessor: completenessLabel },
          { header: "Estimations", accessor: (r) => r.completeness.estimates.length, align: "right" },
          { header: "À rechercher", accessor: (r) => r.completeness.toResearch.length, align: "right" },
          { header: "Fichiers", accessor: (r) => `${r.completeness.filesReceived}/${r.completeness.filesExpected}`, align: "right" },
          { header: "Échéance", accessor: (r) => formatDay(r.dueAt), hideOnMobile: true },
          { header: "Dernière relance", accessor: (r) => formatDateTime(r.lastRemindedAt), hideOnMobile: true },
        ]}
        actions={(r) => (
          <div className="flex flex-wrap gap-2">
            <Link href={`/collectes/r/${r.id}`} className={buttonClasses("secondary", "sm")}>
              Ouvrir
            </Link>
            {open && OPEN_STATUSES.includes(r.status) && (
              <Button type="button" size="sm" variant="ghost" disabled={busy || r.respondents.length === 0} onClick={() => remind(r)}>
                Relancer
              </Button>
            )}
            {open && (r.status === "SUBMITTED" || r.status === "VALIDATED") && (
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setChanges(r)}>
                Demander une correction
              </Button>
            )}
            {r.status === "SUBMITTED" && (
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setValidating(r)}>
                Valider
              </Button>
            )}
          </div>
        )}
      />

      <Modal open={changes !== null} onClose={() => setChanges(null)} title="Demander une correction" mobileLayout="sheet">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void requestChanges();
          }}
        >
          <p className="text-[15px] leading-[22px] text-ink-muted">
            « {changes?.label} » redevient modifiable et ses répondants sont prévenus. Le motif leur est transmis.
          </p>
          <Textarea label="Motif" value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={2000} required />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="secondary" onClick={() => setChanges(null)} disabled={busy}>
              Annuler
            </Button>
            <Button type="submit" disabled={busy || !reason.trim()}>
              {busy ? "Envoi…" : "Demander la correction"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={validating !== null} onClose={() => setValidating(null)} title="Valider le questionnaire" mobileLayout="sheet">
        <div className="flex flex-col gap-4">
          <p className="text-[15px] leading-[22px] text-ink-muted">
            « {validating?.label} » passe à l&apos;état Validé. Vous pourrez encore demander une correction tant que la campagne est ouverte.
          </p>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-ink">
            <Checkbox checked={pastoral} onChange={(e) => setPastoral(e.target.checked)} />
            La Pasteure a validé ce questionnaire
          </label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="secondary" onClick={() => setValidating(null)} disabled={busy}>
              Annuler
            </Button>
            <Button type="button" onClick={validate} disabled={busy}>
              {busy ? "Validation…" : "Valider"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

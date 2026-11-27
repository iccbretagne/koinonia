"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Alert, Button, Checkbox, ConfirmModal, DataTable, FilterChip, Input, Menu, Modal, Select, StatusChip, Textarea, buttonClasses, type MenuItem } from "@/components/ui";
import { ASSIGNMENT_STATUSES, ASSIGNMENT_STATUS_LABELS, type AssignmentStatus } from "@/modules/campaigns/schemas";
import { ASSIGNMENT_STATUS_TONES, formatDateTime, formatDay, parisDayKey, percent } from "../_components/display";
import { useApi } from "../_components/use-api";
import type { CommunicationPreset } from "./CommunicationModal";
import { TRACKING_FILTERS, TRACKING_FILTER_LABELS, groupIssues, matchesTrackingFilter, messageKindForStatus, type TrackingFilter } from "./pilotage";
import type { AssignmentData, CampaignOverviewData } from "./types";

type Row = AssignmentData & { formId: string; formTitle: string; confidential: boolean };
type ReviewAction = "reopen" | "unvalidate";

const REVIEW_ACTIONS: Record<ReviewAction, { title: string; message: string; label: string; success: string }> = {
  reopen: {
    title: "Rouvrir la contribution ?",
    message: "Elle repasse « En cours », réponses et fichiers intacts. Ses répondants sont prévenus et devront la soumettre de nouveau.",
    label: "Rouvrir",
    success: "Contribution rouverte",
  },
  unvalidate: {
    title: "Annuler la validation ?",
    message: "Elle revient à « Soumis » et perd la mention de la Pasteure. Vous pourrez ensuite la rouvrir. Aucune notification n'est envoyée.",
    label: "Annuler la validation",
    success: "Validation annulée",
  },
};

/** Questions concernées d'une ligne, dépliables, sans ouvrir le questionnaire. */
function IssuesDetails({ row }: { readonly row: Row }) {
  if (row.issues.length === 0) return <span className="text-ink-subtle">—</span>;
  const groups = groupIssues(row.issues);
  return (
    <details className="group max-w-sm">
      <summary className={`${buttonClasses("ghost", "sm")} list-none [&::-webkit-details-marker]:hidden`}>
        <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" strokeWidth={1.75} />
        {row.issues.length} question{row.issues.length > 1 ? "s" : ""} concernée{row.issues.length > 1 ? "s" : ""}
      </summary>
      <div className="mt-1 flex flex-col gap-2">
        {groups.map((g) => (
          <div key={g.kind}>
            <p className="text-[13px] font-semibold leading-[18px] text-ink">{g.label}</p>
            <ul className="list-disc pl-5 text-[13px] leading-[18px] text-ink-muted">
              {g.items.map((i) => (
                <li key={`${i.kind}-${i.code}`} className="break-words">
                  {i.label}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

const OPEN_STATUSES: readonly AssignmentStatus[] = ["NOT_STARTED", "IN_PROGRESS", "CHANGES_REQUESTED"];

function Indicator({ label, value, detail }: { readonly label: string; readonly value: string; readonly detail?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
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
export default function TrackingTab({
  overview,
  onMessage,
}: {
  readonly overview: CampaignOverviewData;
  /** Ouvre la fenêtre « Communication » pré-ciblée sur une contribution. */
  readonly onMessage: (preset: CommunicationPreset) => void;
}) {
  const { call, busy } = useApi();
  const { campaign, progress } = overview;
  const [statusFilter, setStatusFilter] = useState("");
  const [formFilter, setFormFilter] = useState("");
  const [changes, setChanges] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [validating, setValidating] = useState<Row | null>(null);
  const [pastoral, setPastoral] = useState(false);
  const [issueFilter, setIssueFilter] = useState<TrackingFilter | null>(null);
  const [review, setReview] = useState<{ row: Row; action: ReviewAction } | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  /** `initial` : jour de l'échéance propre à la contribution (vide si elle suit la campagne). */
  const [due, setDue] = useState<{ row: Row; value: string; initial: string } | null>(null);
  // Une valeur inchangée n'est jamais renvoyée : une échéance précise (heure posée par l'import)
  // n'est pas ramenée à 23 h 59 par un simple « Enregistrer ».
  const dueChanged = !!due?.value && due.value !== due.initial;

  const rows: Row[] = useMemo(
    () =>
      overview.forms.flatMap((f) =>
        f.assignments.map((a) => ({ ...a, formId: f.id, formTitle: f.title, confidential: f.confidential }))
      ),
    [overview.forms]
  );
  const shown = rows.filter(
    (r) => (!statusFilter || r.status === statusFilter) && (!formFilter || r.formTitle === formFilter) && matchesTrackingFilter(r, issueFilter)
  );
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

  async function confirmReview() {
    if (!review) return;
    const motive = reviewReason.trim();
    const ok = await call(
      `/api/campaigns/assignments/${review.row.id}/review`,
      "POST",
      { action: review.action, ...(motive ? { reason: motive } : {}) },
      REVIEW_ACTIONS[review.action].success
    );
    if (ok) {
      setReview(null);
      setReviewReason("");
    }
  }

  async function saveDue(value: string | null) {
    if (!due) return;
    const ok = await call(`/api/campaigns/assignments/${due.row.id}`, "PATCH", { dueAt: value }, value ? "Échéance enregistrée" : "Échéance de la campagne rétablie");
    if (ok) setDue(null);
  }

  const done = progress.byStatus.SUBMITTED + progress.byStatus.VALIDATED;

  return (
    <div className="flex flex-col gap-6">
      {campaign.status === "DRAFT" && (
        <Alert tone="info" title="Brouillon.">
          Les répondants ne voient rien tant que la campagne n&apos;est pas ouverte.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
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
        <Indicator
          label="Exploitables"
          value={`${progress.exploitable} / ${progress.total}`}
          detail="soumis, sans point bloquant"
        />
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

      <div role="group" aria-label="Points d'attention" className="flex flex-wrap gap-2">
        {TRACKING_FILTERS.map((f) => (
          <FilterChip key={f} pressed={issueFilter === f} onClick={() => setIssueFilter((cur) => (cur === f ? null : f))}>
            {TRACKING_FILTER_LABELS[f]}
            <span className="tabular-nums text-ink-subtle">{rows.filter((r) => matchesTrackingFilter(r, f)).length}</span>
          </FilterChip>
        ))}
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
                {r.exploitable && <StatusChip tone="success">Exploitable</StatusChip>}
                {r.pastoralValidated && <StatusChip tone="success">Pasteure</StatusChip>}
              </span>
            ),
          },
          { header: "Complétude", accessor: completenessLabel },
          { header: "Questions concernées", accessor: (r) => <IssuesDetails row={r} /> },
          { header: "Estimations", accessor: (r) => r.completeness.estimates.length, align: "right" },
          { header: "À rechercher", accessor: (r) => r.completeness.toResearch.length, align: "right" },
          { header: "Fichiers", accessor: (r) => `${r.completeness.filesReceived}/${r.completeness.filesExpected}`, align: "right" },
          { header: "Échéance", accessor: (r) => formatDay(r.dueAt), hideOnMobile: true },
          { header: "Dernière relance", accessor: (r) => formatDateTime(r.lastRemindedAt), hideOnMobile: true },
        ]}
        actions={(r) => {
          const extra: MenuItem[] = [
            { label: "Préparer un message", onSelect: () => onMessage({ kind: messageKindForStatus(r, new Date()), contributionId: r.id }) },
          ];
          if (open && OPEN_STATUSES.includes(r.status)) {
            extra.push({ label: "Relancer", disabled: busy || r.respondents.length === 0, onSelect: () => void remind(r) });
          }
          if (open && (r.status === "SUBMITTED" || r.status === "VALIDATED")) {
            extra.push({ label: "Demander une correction", disabled: busy, onSelect: () => setChanges(r) });
          }
          if (open && r.status === "SUBMITTED") {
            extra.push({ label: "Rouvrir", disabled: busy, onSelect: () => setReview({ row: r, action: "reopen" }) });
          }
          if (r.status === "VALIDATED") {
            extra.push({ label: "Annuler la validation", disabled: busy, onSelect: () => setReview({ row: r, action: "unvalidate" }) });
          }
          extra.push(
            { label: "Changer l'échéance", disabled: busy, onSelect: () => setDue({ row: r, value: parisDayKey(r.assignmentDueAt), initial: parisDayKey(r.assignmentDueAt) }) },
            { label: "Voir l'aperçu", href: `/collectes/${campaign.id}/apercu/${r.formId}` },
          );
          return (
            <div className="flex flex-wrap items-center gap-2">
              {r.status === "SUBMITTED" ? (
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setValidating(r)}>
                  Valider
                </Button>
              ) : null}
              <Link href={`/collectes/r/${r.id}`} className={buttonClasses(r.status === "SUBMITTED" ? "ghost" : "secondary", "sm")}>
                Ouvrir
              </Link>
              <Menu label={`Autres actions pour ${r.label} (${r.formTitle})`} items={extra} size="sm" />
            </div>
          );
        }}
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

      <ConfirmModal
        open={review !== null}
        title={review ? REVIEW_ACTIONS[review.action].title : ""}
        message={review ? `« ${review.row.label} » : ${REVIEW_ACTIONS[review.action].message}` : ""}
        confirmLabel={review ? REVIEW_ACTIONS[review.action].label : "Confirmer"}
        variant="primary"
        confirming={busy}
        onConfirm={() => void confirmReview()}
        onCancel={() => {
          setReview(null);
          setReviewReason("");
        }}
      >
        <Textarea
          label="Motif (facultatif)"
          value={reviewReason}
          onChange={(e) => setReviewReason(e.target.value)}
          rows={3}
          maxLength={2000}
          hint={
            review?.action === "reopen"
              ? "Affiché aux répondants dans le questionnaire, jamais dans la notification."
              : "Gardé dans l'historique de la contribution."
          }
        />
      </ConfirmModal>

      <Modal open={due !== null} onClose={() => setDue(null)} title={`Échéance · ${due?.row.label ?? ""}`} mobileLayout="sheet">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (due?.value && dueChanged) void saveDue(due.value);
          }}
        >
          <p className="text-[15px] leading-[22px] text-ink-muted">
            {due?.row.assignmentDueAt
              ? `Cette contribution a sa propre échéance (campagne : ${formatDay(campaign.dueAt)}).`
              : `Cette contribution suit l'échéance de la campagne : ${formatDay(campaign.dueAt)}.`}{" "}
            Une échéance repoussée permet une nouvelle relance automatique deux jours avant.
          </p>
          <Input
            label="Échéance de la contribution"
            type="date"
            value={due?.value ?? ""}
            onChange={(e) => setDue((d) => (d ? { ...d, value: e.target.value } : d))}
            hint={
              due?.row.assignmentDueAt
                ? "Fin de journée, heure de Paris."
                : `Vide : échéance de la campagne (${formatDay(campaign.dueAt)}). Fin de journée, heure de Paris.`
            }
            required
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="secondary" onClick={() => setDue(null)} disabled={busy}>
              Annuler
            </Button>
            {due?.row.assignmentDueAt && (
              <Button type="button" variant="ghost" onClick={() => void saveDue(null)} disabled={busy}>
                Effacer (échéance de la campagne)
              </Button>
            )}
            <Button type="submit" disabled={busy || !dueChanged}>
              {busy ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

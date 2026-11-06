"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Flag } from "lucide-react";
import { Button, ConfirmModal, Modal, StatusChip, Textarea, useToast, type StatusTone } from "@/components/ui";
import type { LedgerLine } from "@/modules/shuttle";
import {
  EXPENSE_CATEGORY_LABEL,
  MANAGER_ONLY_KINDS,
  PAYMENT_METHOD_LABEL,
  REIMBURSEMENT_STATUS_LABEL,
  type ReimbursementStatus,
} from "@/modules/shuttle/schemas";
import type { ShuttleEntryKind } from "@/generated/prisma/enums";
import { euro, frDate, lineTitle } from "./format";

const REIMBURSEMENT_TONE: Record<ReimbursementStatus, StatusTone> = {
  REQUESTED: "info",
  PROCESSING: "info",
  APPROVED: "info",
  REJECTED: "danger",
  CANCELLED: "neutral",
  PARTIALLY_PAID: "warning",
  PAID: "success",
};

export function ReimbursementChip({ status }: { readonly status: ReimbursementStatus }) {
  return <StatusChip tone={REIMBURSEMENT_TONE[status]}>{REIMBURSEMENT_STATUS_LABEL[status]}</StatusChip>;
}

const isActive = (s: ReimbursementStatus | undefined) => !!s && s !== "REJECTED" && s !== "CANCELLED";

/** Droit de corriger ou supprimer une ligne, vu de l'écran (le serveur revérifie). */
export function canEditLine(line: LedgerLine, viewer: { userId: string; manager: boolean }, now = Date.now()) {
  if (line.source !== "ledger") return false;
  if (viewer.manager) return true;
  return (
    line.createdBy?.id === viewer.userId &&
    !MANAGER_ONLY_KINDS.includes(line.kind as ShuttleEntryKind) &&
    now <= Date.parse(line.authorEditUntil) &&
    !isActive(line.reimbursement?.status)
  );
}

interface HistoryItem {
  id: string;
  action: string;
  at: string;
  by: string;
  details: Record<string, unknown> | null;
}

const ACTION_LABEL: Record<string, string> = { CREATE: "Création", UPDATE: "Modification", DELETE: "Suppression" };

function historyDetail(item: HistoryItem): string | null {
  const d = item.details ?? {};
  if (typeof d.flag === "string") return `Signalée : ${d.flag}`;
  if ("flag" in d && d.flag === null) return "Signalement levé";
  if (typeof d.reimbursement === "string") return `Remboursement ${d.reimbursement}`;
  if (typeof d.depositRetained === "string") return `Caution non restituée : ${d.depositRetained}`;
  if (typeof d.label === "string") return d.label;
  const before = d.before as Record<string, unknown> | undefined;
  const after = d.after as Record<string, unknown> | undefined;
  if (before && after) {
    const changed = Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    if (changed.includes("amount")) return `Montant : ${euro(Math.abs(Number(before.amount)))} → ${euro(Math.abs(Number(after.amount)))}`;
    return changed.length > 0 ? `Champs modifiés : ${changed.length}` : null;
  }
  return null;
}

/** Avance personnelle : état du remboursement et actions de l'auteur (lien A). */
function AdvanceBlock({
  line,
  isAuthor,
  busy,
  onRequest,
  onCancel,
}: {
  readonly line: LedgerLine;
  readonly isAuthor: boolean;
  readonly busy: boolean;
  readonly onRequest: () => void;
  readonly onCancel: () => void;
}) {
  const reimbursement = line.reimbursement;
  const canRequest = isAuthor && !isActive(reimbursement?.status);
  let status: React.ReactNode = null;
  if (reimbursement) {
    status = (
      <div className="flex flex-wrap items-center gap-2">
        <ReimbursementChip status={reimbursement.status} />
        {reimbursement.paid > 0 && <span className="text-sm text-ink-muted">{euro(reimbursement.paid)} versés</span>}
        {reimbursement.status === "REJECTED" && reimbursement.rejectionReason && (
          <span className="text-sm text-ink-muted">Motif : {reimbursement.rejectionReason}</span>
        )}
      </div>
    );
  } else if (!line.sourceRequestId) {
    status = <p className="text-sm text-ink-muted">Remboursement non demandé.</p>;
  }
  return (
    <div className="space-y-2 rounded-control bg-surface-sunken px-3 py-2">
      <p className="text-sm text-ink">Avance personnelle</p>
      {status}
      <div className="flex flex-wrap gap-2">
        {canRequest && (
          <Button size="sm" disabled={busy} onClick={onRequest}>
            Demander le remboursement
          </Button>
        )}
        {isAuthor && reimbursement?.status === "REQUESTED" && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={onCancel}>
            Annuler la demande
          </Button>
        )}
      </div>
    </div>
  );
}

/** Lignes « intitulé : valeur » du détail, selon ce que la ligne renseigne. */
function detailRows(line: LedgerLine): [string, React.ReactNode][] {
  const optional: [string, React.ReactNode | null][] = [
    ["Type", line.category ? EXPENSE_CATEGORY_LABEL[line.category] : null],
    ["Fournisseur", line.vendor],
    ["Mode", line.paymentMethod ? PAYMENT_METHOD_LABEL[line.paymentMethod] : null],
    ["Litres", line.liters === null ? null : String(line.liters).replace(".", ",")],
    ["Kilomètres", line.kilometers === null ? null : String(line.kilometers)],
    ["Location", line.rental?.label ?? null],
    ["Commentaire", line.label && line.category !== "OTHER" ? line.label : null],
    ["Déclarée par", line.createdBy?.name ?? null],
  ];
  return [
    ["Date", frDate(line.date)],
    ["Montant", <span key="a" className={line.amount < 0 ? "text-danger" : "text-success"}>{euro(line.amount)}</span>],
    ...optional.filter((row): row is [string, React.ReactNode] => row[1] !== null && row[1] !== ""),
  ];
}

/** Détail d'une ligne : justificatif, historique et actions permises (spec 073). */
export default function EntryDetail({
  line,
  onClose,
  onEdit,
  onReturnDeposit,
  viewer,
}: {
  readonly line: LedgerLine | null;
  readonly onClose: () => void;
  readonly onEdit: (line: LedgerLine) => void;
  readonly onReturnDeposit: (line: LedgerLine) => void;
  readonly viewer: { userId: string; manager: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [noteFor, setNoteFor] = useState<"flag" | "retained" | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (line?.source !== "ledger") return;
    let cancelled = false;
    fetch(`/api/accounting/navette/entries/${line.id}/history`)
      .then((r) => (r.ok ? r.json() : []))
      .then((h) => !cancelled && setHistory(h))
      .catch(() => !cancelled && setHistory([]));
    return () => {
      cancelled = true;
    };
  }, [line]);

  if (!line) return null;
  const base = `/api/accounting/navette/entries/${line.id}`;
  const editable = canEditLine(line, viewer);
  const isAuthor = line.createdBy?.id === viewer.userId;

  async function call(url: string, init: RequestInit, success: string) {
    setBusy(true);
    try {
      const res = await fetch(url, init);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Action impossible. Réessayez dans un instant.");
        return false;
      }
      toast.success(success);
      router.refresh();
      return true;
    } catch {
      toast.error("Action impossible. Réessayez dans un instant.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitNote() {
    if (!note.trim() || !noteFor) return;
    const ok = await call(
      `${base}/${noteFor}`,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: note.trim() }) },
      noteFor === "flag" ? "Ligne signalée" : "Caution marquée non restituée"
    );
    if (ok) onClose();
  }

  const rows = detailRows(line);

  return (
    <>
      <Modal open onClose={onClose} title={lineTitle(line)} mobileLayout="sheet">
        <div className="space-y-4">
          {line.flagNote && (
            <p className="flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2 text-sm text-ink">
              <Flag aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
              Signalée par la comptabilité : {line.flagNote}
            </p>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="text-ink">{v}</dd>
              </div>
            ))}
          </dl>

          {line.source === "accounting" && line.requestId && (
            <p className="text-sm text-ink-muted">
              Versement d&apos;une avance de budget, lu dans la comptabilité.{" "}
              {viewer.manager && (
                <Link href={`/accounting/requests/${line.requestId}`} className="font-semibold text-brand-text underline">
                  Voir la demande
                </Link>
              )}
            </p>
          )}

          {line.hasReceipt && (
            <a
              href={`${base}/receipt`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-text underline"
            >
              <ExternalLink aria-hidden="true" className="size-4" /> Voir le justificatif ({line.receiptName ?? "fichier"})
            </a>
          )}

          {line.kind === "EXPENSE" && line.personalAdvance && (
            <AdvanceBlock
              line={line}
              isAuthor={isAuthor}
              busy={busy}
              onRequest={() => call(`${base}/reimbursement`, { method: "POST" }, "Remboursement demandé à la comptabilité")}
              onCancel={() => call(`${base}/reimbursement`, { method: "DELETE" }, "Demande annulée")}
            />
          )}

          {noteFor ? (
            <div className="space-y-2">
              <Textarea
                label={noteFor === "flag" ? "Motif du signalement" : "Pourquoi la caution n'est pas restituée"}
                rows={2}
                maxLength={300}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={busy || !note.trim()} onClick={submitNote}>
                  Enregistrer
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setNoteFor(null)}>
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {editable && (
                <Button size="sm" variant="secondary" onClick={() => onEdit(line)}>
                  Corriger
                </Button>
              )}
              {line.kind === "EXPENSE" && line.category === "DEPOSIT" && !line.returned && !line.depositRetainedAt && (
                <Button size="sm" variant="secondary" onClick={() => onReturnDeposit(line)}>
                  Caution restituée
                </Button>
              )}
              {viewer.manager && line.kind === "EXPENSE" && line.category === "DEPOSIT" && !line.returned && !line.depositRetainedAt && (
                <Button size="sm" variant="secondary" onClick={() => setNoteFor("retained")}>
                  Non restituée
                </Button>
              )}
              {viewer.manager && line.source === "ledger" && !line.flagNote && (
                <Button size="sm" variant="secondary" onClick={() => setNoteFor("flag")}>
                  Signaler
                </Button>
              )}
              {viewer.manager && line.flagNote && (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => call(`${base}/flag`, { method: "DELETE" }, "Signalement levé")}>
                  Lever le signalement
                </Button>
              )}
              {editable && (
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
                  Supprimer
                </Button>
              )}
            </div>
          )}

          {line.source === "ledger" && (
            <section aria-label="Historique" className="border-t border-line pt-3">
              <h3 className="mb-2 text-sm font-semibold text-ink">Historique</h3>
              {history === null ? (
                <p className="text-sm text-ink-muted">Chargement…</p>
              ) : (
                <ul className="space-y-1.5">
                  {history.map((h) => {
                    const detail = historyDetail(h);
                    return (
                      <li key={h.id} className="text-[13px] leading-[18px] text-ink-muted">
                        <span className="text-ink">{ACTION_LABEL[h.action] ?? h.action}</span> · {h.by} ·{" "}
                        {new Date(h.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                        {detail && <> · {detail}</>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </div>
      </Modal>
      <ConfirmModal
        open={confirmDelete}
        title="Supprimer cette ligne ?"
        message="Elle sort des soldes et reste visible dans l'historique. La comptabilité est prévenue."
        confirmLabel="Supprimer la ligne"
        confirming={busy}
        onConfirm={async () => {
          const ok = await call(base, { method: "DELETE" }, "Ligne supprimée");
          setConfirmDelete(false);
          if (ok) onClose();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

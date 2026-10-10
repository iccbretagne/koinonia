"use client";

import { useState } from "react";
import { Trash } from "lucide-react";
import Button from "@/components/ui/Button";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { ROLE_LABELS } from "@/lib/roles";
import { REQUEST_TYPE_LABEL } from "@/lib/request-queue";
import ReasonForm from "./ReasonForm";
import {
  ActionRow,
  AnnouncementBlock,
  ChildrenBlock,
  DetailField,
  DetailMeta,
  NoteField,
  ReviewBlock,
} from "./DetailBlocks";
import { formatDate, formatDateTime, textOf, type DetailContext, type QueueItem } from "./queue-types";

/**
 * Panneau de détail du Secrétariat (spec 063) : annonces à diffuser et demandes exécutables
 * (événements, planning, accès). Une action principale par type ; refus et annulation avec motif.
 */

const RECURRENCE_LABEL: Record<string, string> = { weekly: "Chaque semaine", biweekly: "Toutes les deux semaines", monthly: "Chaque mois" };

function count(value: unknown, singular: string, plural: string): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return `${value.length} ${value.length === 1 ? singular : plural}`;
}

function changeValue(field: string, value: string | null): string {
  if (value === null) return "—";
  return field === "date" || field === "planningDeadline" ? formatDateTime(value) : value;
}

/** Résumé des données d'une demande exécutable, selon son type. */
function DemandSummary({ item }: { readonly item: QueueItem }) {
  const p = item.payload;
  switch (item.type) {
    case "AJOUT_EVENEMENT": {
      const recurrence = textOf(p.recurrenceRule);
      return (
        <dl className="grid gap-3 sm:grid-cols-2">
          <DetailField label="Événement">{textOf(p.eventTitle) ?? item.title}</DetailField>
          {textOf(p.eventType) && <DetailField label="Type">{textOf(p.eventType)}</DetailField>}
          {textOf(p.eventDate) && <DetailField label="Date">{formatDateTime(textOf(p.eventDate))}</DetailField>}
          {count(p.departmentIds, "département", "départements") && (
            <DetailField label="Départements">{count(p.departmentIds, "département", "départements")}</DetailField>
          )}
          {recurrence && (
            <DetailField label="Récurrence">
              {RECURRENCE_LABEL[recurrence] ?? recurrence}
              {textOf(p.recurrenceEnd) ? ` jusqu'au ${formatDate(textOf(p.recurrenceEnd))}` : ""}
            </DetailField>
          )}
        </dl>
      );
    }
    case "MODIFICATION_EVENEMENT":
      return (
        <div className="flex flex-col gap-3">
          {item.event && (
            <dl>
              <DetailField label="Événement">
                {item.event.title} — {formatDateTime(item.event.date)}
              </DetailField>
            </dl>
          )}
          {item.eventChanges && item.eventChanges.length > 0 ? (
            <table className="w-full table-fixed text-left text-sm">
              <caption className="sr-only">Changements demandés</caption>
              <thead className="text-ink-subtle">
                <tr>
                  <th scope="col" className="w-1/4 pb-1 font-semibold">Champ</th>
                  <th scope="col" className="pb-1 font-semibold">Actuel</th>
                  <th scope="col" className="pb-1 font-semibold">Demandé</th>
                </tr>
              </thead>
              <tbody className="align-top">
                {item.eventChanges.map((c) => (
                  <tr key={c.field} className="border-t border-line">
                    <th scope="row" className="py-1.5 pr-2 font-semibold text-ink">{c.label}</th>
                    <td className="break-words py-1.5 pr-2 text-ink-muted">{changeValue(c.field, c.before)}</td>
                    <td className="break-words py-1.5 font-semibold text-ink">{changeValue(c.field, c.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-ink-muted">Aucun changement lisible dans la demande.</p>
          )}
        </div>
      );
    case "ANNULATION_EVENEMENT":
      return (
        <dl className="flex flex-col gap-3">
          {item.event && (
            <DetailField label="Événement">
              {item.event.title} — {formatDateTime(item.event.date)}
            </DetailField>
          )}
          <DetailField label="Raison">{textOf(p.reason) ?? "—"}</DetailField>
        </dl>
      );
    case "MODIFICATION_PLANNING":
      return (
        <dl className="flex flex-col gap-3">
          {item.event && (
            <DetailField label="Événement">
              {item.event.title} — {formatDateTime(item.event.date)}
            </DetailField>
          )}
          <DetailField label="Départements en service">
            {count(p.departmentIds, "département sélectionné", "départements sélectionnés") ?? "Aucun département"}
          </DetailField>
        </dl>
      );
    case "DEMANDE_ACCES": {
      const role = textOf(p.role);
      return (
        <dl className="flex flex-col gap-3">
          <DetailField label="Rôle demandé">{role ? (ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role) : "—"}</DetailField>
          {count(p.departmentIds, "département", "départements") && (
            <DetailField label="Départements">{count(p.departmentIds, "département", "départements")}</DetailField>
          )}
        </dl>
      );
    }
    default:
      return null;
  }
}

function cascadeWarning(item: QueueItem): string | null {
  const pending = item.children.filter((c) => c.status === "EN_ATTENTE" || c.status === "EN_COURS");
  if (pending.length === 0) return null;
  const names = pending.map((c) => (REQUEST_TYPE_LABEL[c.type] ?? c.type).toLowerCase()).join(" et ");
  return `Les suites demandées (${names}) seront aussi annulées.`;
}

export default function SecretariatDetail({
  item,
  ctx,
  canManage,
}: {
  readonly item: QueueItem;
  readonly ctx: DetailContext;
  readonly canManage: boolean;
}) {
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"refuse" | "cancel" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isAnnouncement = item.type === "DIFFUSION_INTERNE";
  const isOpen = item.status === "EN_ATTENTE" || item.status === "EN_COURS";
  const reviewNotes = note.trim() || undefined;

  return (
    <>
      <DetailMeta item={item} doneLabel="Diffusée" />
      {isAnnouncement ? <AnnouncementBlock item={item} /> : <DemandSummary item={item} />}
      <ChildrenBlock item={item} />
      <ReviewBlock item={item} />

      {isOpen && mode === null && (
        <>
          <NoteField value={note} onChange={setNote} />
          <ActionRow>
            {isAnnouncement ? (
              <>
                <Button
                  disabled={ctx.busy}
                  onClick={() =>
                    ctx.act({ status: "LIVRE", reviewNotes }, { success: "Annonce marquée diffusée", undo: { status: item.status } })
                  }
                >
                  Marquer diffusée
                </Button>
                {item.status === "EN_ATTENTE" && (
                  <Button
                    variant="secondary"
                    disabled={ctx.busy}
                    onClick={() =>
                      ctx.act({ status: "EN_COURS", reviewNotes }, { success: "Annonce mise en cours", undo: { status: "EN_ATTENTE" } })
                    }
                  >
                    Mettre en cours
                  </Button>
                )}
                <Button variant="ghost" disabled={ctx.busy} onClick={() => setMode("cancel")}>
                  Annuler l&apos;annonce
                </Button>
              </>
            ) : (
              <>
                <Button
                  disabled={ctx.busy}
                  onClick={() => ctx.act({ status: "APPROUVEE", reviewNotes }, { success: "Demande approuvée" })}
                >
                  {ctx.busy ? "Envoi…" : "Approuver"}
                </Button>
                <Button variant="ghost" disabled={ctx.busy} onClick={() => setMode("refuse")}>
                  Refuser
                </Button>
              </>
            )}
          </ActionRow>
        </>
      )}

      {mode === "refuse" && (
        <ReasonForm
          label="Motif du refus"
          confirmLabel="Refuser la demande"
          busy={ctx.busy}
          onCancel={() => setMode(null)}
          onConfirm={(reason) => void ctx.act({ status: "REFUSEE", reviewNotes: reason }, { success: "Demande refusée" })}
        />
      )}
      {mode === "cancel" && (
        <ReasonForm
          label="Motif de l'annulation"
          confirmLabel="Annuler l'annonce"
          warning={cascadeWarning(item)}
          busy={ctx.busy}
          onCancel={() => setMode(null)}
          onConfirm={(reason) => void ctx.act({ status: "ANNULE", reviewNotes: reason }, { success: "Annonce annulée" })}
        />
      )}

      {!isOpen && canManage && (
        <ActionRow>
          <Button variant="ghost" disabled={ctx.busy} onClick={() => setConfirmDelete(true)}>
            <Trash aria-hidden="true" className="size-4" />
            Supprimer
          </Button>
        </ActionRow>
      )}
      <ConfirmModal
        open={confirmDelete}
        title="Supprimer cette demande ?"
        message={`« ${item.announcement?.title ?? item.title} » sera supprimée définitivement de l'historique.`}
        confirmLabel="Supprimer"
        variant="danger"
        confirming={ctx.busy}
        onConfirm={async () => {
          await ctx.remove();
          setConfirmDelete(false);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

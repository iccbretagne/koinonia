"use client";

import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import StatusChip from "@/components/ui/StatusChip";
import Alert from "@/components/ui/Alert";
import Textarea from "@/components/ui/Textarea";
import { REQUEST_TYPE_LABEL, formatDeadline } from "@/lib/request-queue";
import { STATUS_TONE, formatDate, formatDateTime, statusLabel, type QueueItem } from "./queue-types";

/** Briques communes des panneaux de détail (spec 063). */

export function DetailField({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[13px] font-semibold leading-[18px] text-ink-subtle">{label}</dt>
      <dd className="min-w-0 break-words text-[15px] leading-[22px] text-ink">{children}</dd>
    </div>
  );
}

const DEADLINE_LABEL: Record<string, string> = {
  culte: "Culte ciblé",
  event: "Date de l'événement",
  planning: "Date limite de planification",
  brief: "Date limite",
};

/** État, type, demandeur, date d'envoi et échéance. */
export function DetailMeta({ item, doneLabel }: { readonly item: QueueItem; readonly doneLabel: string }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={STATUS_TONE[item.status] ?? "neutral"}>{statusLabel(item.status, doneLabel)}</StatusChip>
        <span className="text-sm text-ink-muted">{REQUEST_TYPE_LABEL[item.type] ?? item.type}</span>
        {item.announcement?.isUrgent && <StatusChip tone="danger">Urgent</StatusChip>}
        {item.announcement?.isSaveTheDate && <StatusChip tone="brand">Save the Date</StatusChip>}
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <DetailField label="Demandeur">
          {item.author}
          {item.source ? ` · ${item.source}` : ""}
        </DetailField>
        <DetailField label="Envoyée le">{formatDate(item.submittedAt)}</DetailField>
        {item.deadline && (
          <DetailField label={DEADLINE_LABEL[item.deadlineKind] ?? "Échéance"}>{formatDeadline(item.deadline)}</DetailField>
        )}
      </dl>
    </>
  );
}

/** Texte complet d'une annonce et cultes ciblés. */
export function AnnouncementBlock({ item }: { readonly item: QueueItem }) {
  const a = item.announcement;
  if (!a) return null;
  return (
    <div className="flex flex-col gap-3">
      <p className="whitespace-pre-wrap break-words rounded-control bg-surface-sunken px-4 py-3 text-[15px] leading-[22px] text-ink">
        {a.content}
      </p>
      {a.targetEvents.length > 0 ? (
        <dl>
          <DetailField label="Cultes ciblés">
            <ul className="flex flex-col gap-0.5">
              {a.targetEvents.map((e) => (
                <li key={e.id}>
                  {e.title} — {formatDateTime(e.date)}
                </li>
              ))}
            </ul>
          </DetailField>
        </dl>
      ) : (
        a.eventDate && (
          <dl>
            <DetailField label="Date de l'événement annoncé">{formatDate(a.eventDate)}</DetailField>
          </dl>
        )
      )}
    </div>
  );
}

/** Suites demandées avec l'annonce (visuel, publication), chacune avec son état. */
export function ChildrenBlock({ item }: { readonly item: QueueItem }) {
  if (item.children.length === 0) return null;
  return (
    <dl>
      <DetailField label="Suites demandées">
        <ul className="flex flex-col gap-1.5">
          {item.children.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2">
              <span>{REQUEST_TYPE_LABEL[c.type] ?? c.type}</span>
              <StatusChip tone={STATUS_TONE[c.status] ?? "neutral"}>
                {statusLabel(c.status, c.type === "VISUEL" ? "Livré" : "Publiée")}
              </StatusChip>
              {c.deliveryLink && <ExternalAnchor href={c.deliveryLink}>Voir</ExternalAnchor>}
            </li>
          ))}
        </ul>
      </DetailField>
    </dl>
  );
}

/** Note ou motif déjà enregistrés, auteur de la décision, erreur d'exécution. */
export function ReviewBlock({ item }: { readonly item: QueueItem }) {
  return (
    <>
      {item.status === "ERREUR" && item.executionError && (
        <Alert tone="danger" title="Exécution échouée.">
          {item.executionError}
        </Alert>
      )}
      {(item.reviewNotes || item.reviewedBy) && item.status !== "EN_ATTENTE" && (
        <dl className="flex flex-col gap-3">
          {item.reviewNotes && (
            <DetailField label={item.status === "REFUSEE" || item.status === "ANNULE" ? "Motif" : "Note"}>
              <span className="whitespace-pre-wrap">{item.reviewNotes}</span>
            </DetailField>
          )}
          {item.reviewedBy && <DetailField label="Traitée par">{item.reviewedBy}</DetailField>}
        </dl>
      )}
    </>
  );
}

export function NoteField({ value, onChange }: { readonly value: string; readonly onChange: (value: string) => void }) {
  return (
    <Textarea
      label="Note (facultative)"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={2}
      hint="Visible par le demandeur avec la décision."
    />
  );
}

export function ExternalAnchor({ href, children }: { readonly href: string; readonly children: ReactNode }) {
  // Lien saisi par l'équipe : seuls http(s) sont rendus cliquables.
  if (!/^https?:\/\//i.test(href)) return <span className="break-all">{href}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-1 font-semibold text-brand-text underline underline-offset-2"
    >
      {children}
      <ExternalLink aria-hidden="true" className="size-4" />
    </a>
  );
}

/** Rangée d'actions : empilées pleine largeur sur mobile, en ligne à partir de 640px. */
export function ActionRow({ children }: { readonly children: ReactNode }) {
  return <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:flex-wrap">{children}</div>;
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, CircleCheck, CircleX, Repeat, UserMinus, UserRoundX } from "lucide-react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import ConfirmModal from "@/components/ui/ConfirmModal";
import EmptyState from "@/components/ui/EmptyState";
import StatusChip from "@/components/ui/StatusChip";
import { serviceStatusDescriptor } from "@/components/ui/status";
import { useToast } from "@/components/ui/Toast";

/**
 * Écran du service à remplacer (spec 061), conçu mobile d'abord : le STAR désisté et son message,
 * puis les remplaçants possibles en cartes (« Disponible » d'abord, puis « Si besoin »). Un choix
 * refusé (déjà pourvu, candidat devenu indisponible) affiche le message du serveur et rafraîchit la
 * liste.
 */

type Candidate = { memberId: string; firstName: string; lastName: string; state: "AVAILABLE" | "IF_NEEDED" };

export interface ReplacementDetail {
  withdrawal: {
    id: string;
    status: "PENDING" | "REPLACED" | "CANCELLED" | "CLOSED";
    message: string | null;
    originalStatus: string;
    createdAt: Date | string;
    replacementName: string | null;
  };
  event: { id: string; title: string; date: Date | string };
  department: { id: string; name: string };
  member: { id: string; firstName: string; lastName: string };
  candidates: Candidate[];
  /** Encore à remplacer (en attente, avant le début de l'événement) — calculé par le serveur. */
  open: boolean;
  canReplace: boolean;
}

function formatEventDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const day = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
  return `${day} · ${time}`;
}

function TerminalState({ detail }: { readonly detail: ReplacementDetail }) {
  const name = `${detail.member.firstName} ${detail.member.lastName}`;
  switch (detail.withdrawal.status) {
    case "REPLACED":
      return (
        <Alert tone="success" icon={CircleCheck} title="Service pourvu.">
          {detail.withdrawal.replacementName ?? "Un remplaçant"} remplace {name}.
        </Alert>
      );
    case "CANCELLED":
      return (
        <Alert tone="info" title="Désistement annulé.">
          {name} a repris son service.
        </Alert>
      );
    case "CLOSED":
      return (
        <Alert tone="info" icon={CircleX} title="Pas de remplacement.">
          Il a été décidé de ne pas remplacer {name} sur ce service.
        </Alert>
      );
    default:
      return (
        <Alert tone="info" title="L'événement a commencé.">
          Le remplacement n&apos;est plus possible.
        </Alert>
      );
  }
}

export default function ReplacementClient({ initial }: { readonly initial: ReplacementDetail }) {
  const toast = useToast();
  const [detail, setDetail] = useState(initial);
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);

  const { withdrawal, event, department, member, candidates, open, canReplace } = detail;
  const memberName = `${member.firstName} ${member.lastName}`;
  const original = serviceStatusDescriptor(withdrawal.originalStatus);
  const isPending = withdrawal.status === "PENDING";

  async function reload() {
    const res = await fetch(`/api/planning/withdrawals/${withdrawal.id}`);
    if (res.ok) setDetail(await res.json());
  }

  async function choose(candidate: Candidate) {
    setPendingMemberId(candidate.memberId);
    try {
      const res = await fetch(`/api/planning/withdrawals/${withdrawal.id}/replace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: candidate.memberId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Remplacement impossible");
      toast.success(`${candidate.firstName} ${candidate.lastName} remplace ${memberName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remplacement impossible");
    } finally {
      setPendingMemberId(null);
      await reload();
    }
  }

  async function close() {
    setClosing(true);
    try {
      const res = await fetch(`/api/planning/withdrawals/${withdrawal.id}/close`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Action impossible");
      toast.success(`${memberName} est informé(e) : pas de remplacement`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action impossible");
    } finally {
      setClosing(false);
      setConfirmClose(false);
      await reload();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Désistement" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
        <p className="text-sm leading-5 text-ink-muted first-letter:uppercase">{formatEventDate(event.date)} · {department.name}</p>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[15px] font-semibold leading-[22px] text-ink">{memberName}</p>
          <StatusChip tone="warning" icon={UserMinus}>
            {isPending ? "À remplacer" : "Désisté"}
          </StatusChip>
          {original && (
            <StatusChip tone={original.tone} icon={original.icon}>
              {original.label}
            </StatusChip>
          )}
        </div>
        {withdrawal.message && (
          <blockquote className="rounded-control bg-surface-sunken px-3 py-2 text-[15px] leading-[22px] text-ink">
            « {withdrawal.message} »
          </blockquote>
        )}
      </section>

      {!open ? (
        <TerminalState detail={detail} />
      ) : (
        <section aria-labelledby="candidates-title" className="flex flex-col gap-3">
          <h2 id="candidates-title" className="font-display text-[17px] font-semibold leading-[22px] text-ink">
            Remplaçants possibles
          </h2>
          {!canReplace && (
            <Alert tone="info">Lecture seule : seul un responsable du département peut choisir un remplaçant.</Alert>
          )}
          {candidates.length === 0 ? (
            <div className="rounded-card border border-line bg-surface">
              <EmptyState
                icon={UserRoundX}
                title="Aucun remplaçant possible"
                description="Aucun membre disponible ni « si besoin » libre ce jour-là. Vous pouvez placer quelqu'un depuis la grille."
                size="sm"
              />
            </div>
          ) : (
            <ul className="overflow-hidden rounded-card border border-line bg-surface">
              {candidates.map((c) => (
                <li key={c.memberId} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold leading-[22px] text-ink">
                      {c.firstName} {c.lastName}
                    </p>
                    {c.state === "AVAILABLE" ? (
                      <StatusChip tone="success" icon={Check}>Disponible</StatusChip>
                    ) : (
                      <StatusChip tone="warning" icon={Repeat}>Si besoin</StatusChip>
                    )}
                  </div>
                  {canReplace && (
                    <Button
                      type="button"
                      onClick={() => choose(c)}
                      disabled={pendingMemberId !== null || closing}
                      aria-busy={pendingMemberId === c.memberId || undefined}
                      className="shrink-0"
                    >
                      {pendingMemberId === c.memberId ? "Choix…" : "Choisir"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canReplace && (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <Link
                href={`/dashboard?event=${event.id}&dept=${department.id}`}
                className="inline-flex min-h-11 items-center justify-center rounded-control px-4 font-display text-sm font-semibold text-brand-text hover:bg-brand-soft"
              >
                Ouvrir la grille
              </Link>
              <Button type="button" variant="secondary" onClick={() => setConfirmClose(true)} disabled={pendingMemberId !== null}>
                Ne pas remplacer
              </Button>
            </div>
          )}
        </section>
      )}

      <ConfirmModal
        open={confirmClose}
        title="Ne pas remplacer ce service ?"
        message={`Le service ne sera plus signalé à remplacer et ${memberName} sera informé(e) que son désistement est pris en compte.`}
        confirmLabel="Ne pas remplacer"
        variant="primary"
        confirming={closing}
        onConfirm={close}
        onCancel={() => setConfirmClose(false)}
      />
    </div>
  );
}

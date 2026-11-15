"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, ConfirmModal, Modal, StatusChip, useToast } from "@/components/ui";
import type { ApplicationDetail } from "@/modules/serving";
import { CANCEL_REASON_LABEL, INTERVIEW_STATUS_LABEL, SCHEDULING_REASON_LABEL } from "@/modules/serving/schemas";

type FreeSlot = { id: string; startsAt: string; durationMinutes: number; location: string | null; visioUrl: string | null; interviewer: { name: string } | null };

const when = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** Entretien de la candidature (spec 082), vu par le PVS : rendez-vous, historique, issue. */
export default function InterviewBlock({
  churchId,
  applicationId,
  name,
  open,
  interviews,
  scheduling,
  repeatedNoShow,
  hasEmail,
}: {
  readonly churchId: string;
  readonly applicationId: string;
  readonly name: string;
  readonly open: boolean;
  readonly interviews: ApplicationDetail["interviews"];
  readonly scheduling: ApplicationDetail["scheduling"];
  readonly repeatedNoShow: boolean;
  readonly hasEmail: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [slots, setSlots] = useState<FreeSlot[] | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const current = interviews.find((i) => i.status === "BOOKED" || i.status === "TO_COMPLETE") ?? null;
  const history = interviews.filter((i) => i !== current);

  async function act(body: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/serving/applications/${applicationId}/interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "La demande n'a pas abouti.");
        return false;
      }
      toast.success(success);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function openPicker() {
    setPicking(true);
    setSlots(null);
    const res = await fetch(`/api/serving/interview-slots?churchId=${encodeURIComponent(churchId)}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({ slots: [] }));
    setSlots(((body.slots ?? []) as (FreeSlot & { past: boolean; candidate: unknown })[]).filter((s) => !s.past && !s.candidate && s.interviewer));
  }

  return (
    <section className="bg-surface rounded-xl border border-line p-4 sm:p-5 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-text">Entretien</h2>
      {repeatedNoShow && <Alert tone="warning" title="Absent à deux entretiens d'affilée." />}
      {scheduling && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
          <StatusChip tone="warning">À planifier</StatusChip> {SCHEDULING_REASON_LABEL[scheduling.reason]}
        </p>
      )}
      {current ? (
        <div className="space-y-2">
          <p className="text-[15px] text-ink">
            <span className="font-semibold first-letter:uppercase">{when(current.startsAt)}</span> · {current.durationMinutes} min ·{" "}
            {current.visioUrl ? "visio" : (current.location ?? "lieu non précisé")}
            {current.interviewerName ? ` · reçu par ${current.interviewerName}` : ""}
          </p>
          <StatusChip tone={current.status === "TO_COMPLETE" ? "warning" : "brand"}>{INTERVIEW_STATUS_LABEL[current.status]}</StatusChip>
          <div className="flex flex-wrap gap-2 pt-1">
            {current.status === "TO_COMPLETE" ? (
              <>
                <Button size="sm" disabled={busy} onClick={() => void act({ action: "outcome", status: "DONE" }, "Entretien noté réalisé")}>
                  Réalisé
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act({ action: "outcome", status: "NO_SHOW" }, "Absence notée")}>
                  Absent
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act({ action: "outcome", status: "EXCUSED" }, "Excuse notée")}>
                  Excusé
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => void openPicker()}>
                  Déplacer
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setCancelling(true)}>
                  Annuler le rendez-vous
                </Button>
              </>
            )}
          </div>
        </div>
      ) : open ? (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">Aucun rendez-vous en cours.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => void openPicker()}>
              Fixer un rendez-vous
            </Button>
            {hasEmail ? (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act({ action: "invite" }, "Invitation envoyée")}>
                Inviter à choisir un créneau
              </Button>
            ) : (
              <StatusChip>Pas d&apos;email : à contacter directement</StatusChip>
            )}
          </div>
        </div>
      ) : null}

      {history.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-muted">Historique ({history.length})</summary>
          <ul className="mt-2 space-y-1">
            {history.map((i) => (
              <li key={i.id} className="text-ink-muted">
                <span className="first-letter:uppercase">{when(i.startsAt)}</span> — {INTERVIEW_STATUS_LABEL[i.status]}
                {i.status === "CANCELLED" && i.cancelReason ? ` ${CANCEL_REASON_LABEL[i.cancelReason as keyof typeof CANCEL_REASON_LABEL] ?? ""}` : ""}
                {i.interviewerName ? ` · ${i.interviewerName}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}

      <Modal open={picking} onClose={() => setPicking(false)} title={`Rendez-vous de ${name}`}>
        {slots === null ? (
          <p className="text-ink-muted">Chargement…</p>
        ) : slots.length === 0 ? (
          <Alert tone="info" title="Aucun créneau libre : ajoutez-en depuis l'écran Entretiens." />
        ) : (
          <ul className="space-y-2">
            {slots.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={busy}
                  className="w-full min-h-11 rounded-control border border-line bg-surface p-3 text-left hover:border-brand"
                  onClick={() =>
                    void act({ action: "book", slotId: s.id }, hasEmail ? "Rendez-vous fixé, le candidat est prévenu" : "Rendez-vous fixé").then((ok) => ok && setPicking(false))
                  }
                >
                  <span className="font-semibold text-ink first-letter:uppercase">{when(s.startsAt)}</span>
                  <span className="block text-[13px] text-ink-muted">
                    {s.durationMinutes} min · {s.visioUrl ? "visio" : (s.location ?? "lieu non précisé")} · {s.interviewer?.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
      <ConfirmModal
        open={cancelling}
        title="Annuler le rendez-vous ?"
        message={`Le créneau sera libéré${hasEmail ? " et le candidat invité à en choisir un autre" : ""}.`}
        confirmLabel="Annuler le rendez-vous"
        confirmingLabel="Annulation…"
        variant="danger"
        confirming={busy}
        onConfirm={() => void act({ action: "cancel" }, "Rendez-vous annulé").then(() => setCancelling(false))}
        onCancel={() => setCancelling(false)}
      />
    </section>
  );
}

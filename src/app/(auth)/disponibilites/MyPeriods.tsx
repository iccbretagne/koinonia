"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { withdrawalSummary, type EditablePeriod } from "@/components/UnavailabilityPeriodForm";
import { isAbsencePast } from "@/lib/absence-lock";

/**
 * « Mes périodes d'indisponibilité » (spec 062) : le STAR modifie ou annule lui-même ses périodes
 * actives à venir, sans passer par l'écran des indisponibilités réservé aux responsables.
 */

interface PeriodRow {
  id: string;
  member: { id: string };
  kind: "PERIOD" | "EVENTS";
  status: string;
  startDate: string | null;
  endDate: string | null;
  allDepartments: boolean;
  targetDepartments: { id: string; name: string }[];
  reason: string | null;
  backups: { type: string; targetId: string }[];
}

// Dates saisies en jours, envoyées à minuit UTC : affichage en UTC pour ne pas décaler d'un jour.
const dayFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });

export default function MyPeriods({
  churchId,
  memberId,
  refreshKey,
  onEdit,
  onChanged,
}: {
  readonly churchId: string;
  readonly memberId: string;
  readonly refreshKey: number;
  readonly onEdit: (period: EditablePeriod) => void;
  readonly onChanged: () => void;
}) {
  const toast = useToast();
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [cancelling, setCancelling] = useState<PeriodRow | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/absences?churchId=${churchId}&scope=self`);
      if (!res.ok) return;
      const json: { absences: PeriodRow[] } = await res.json();
      setPeriods(
        json.absences
          .filter(
            (a) => a.member.id === memberId && a.kind === "PERIOD" && a.status === "ACTIVE" && a.startDate && a.endDate && !isAbsencePast(a.endDate)
          )
          .sort((x, y) => new Date(x.startDate!).getTime() - new Date(y.startDate!).getTime())
      );
    } catch {
      // Section secondaire : en cas d'échec, l'écran des disponibilités reste utilisable.
    }
  }, [churchId, memberId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement au montage et à chaque enregistrement (refreshKey)
    void load();
  }, [load, refreshKey]);

  async function confirmCancel() {
    if (!cancelling) return;
    setSending(true);
    try {
      const res = await fetch(`/api/absences/${cancelling.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Annulation impossible");
      const summary = withdrawalSummary(json);
      toast.success(summary ? `Indisponibilité annulée · ${summary}` : "Indisponibilité annulée");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Annulation impossible");
    } finally {
      setSending(false);
      setCancelling(null);
      void load();
    }
  }

  if (periods.length === 0) return null;

  return (
    <section aria-labelledby="my-periods-title" className="space-y-2">
      <h2 id="my-periods-title" className="text-base font-semibold text-ink">
        Mes périodes d&apos;indisponibilité
      </h2>
      <ul className="overflow-hidden rounded-card border border-line bg-surface">
        {periods.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 border-t border-line px-4 py-3 first:border-t-0 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold leading-[22px] text-ink">
                Du {dayFmt.format(new Date(p.startDate!))} au {dayFmt.format(new Date(p.endDate!))}
              </p>
              <p className="text-sm text-ink-muted break-words">
                {p.allDepartments ? "Tous mes départements" : p.targetDepartments.map((d) => d.name).join(", ")}
                {p.reason ? ` · ${p.reason}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-11 flex-1 sm:min-h-9 sm:flex-none"
                onClick={() =>
                  onEdit({
                    id: p.id,
                    memberId: p.member.id,
                    startDate: p.startDate,
                    endDate: p.endDate,
                    allDepartments: p.allDepartments,
                    departmentIds: p.targetDepartments.map((d) => d.id),
                    reason: p.reason,
                    backups: p.backups.map((b) => `${b.type}:${b.targetId}`),
                    isSelf: true,
                  })
                }
              >
                Modifier
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 flex-1 sm:min-h-9 sm:flex-none"
                onClick={() => setCancelling(p)}
              >
                Annuler
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmModal
        open={cancelling !== null}
        title="Annuler cette indisponibilité ?"
        message="Tu redeviens disponible sur cette période. Les services dont tu avais été retiré(e) et qui n'ont pas encore été pourvus te sont rendus ; tes responsables sont prévenus."
        confirmLabel="Annuler la période"
        confirming={sending}
        onConfirm={confirmCancel}
        onCancel={() => setCancelling(null)}
      />
    </section>
  );
}

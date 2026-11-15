"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button } from "@/components/ui";
import type { PublicInterviewView } from "@/modules/serving";

type View = PublicInterviewView;
type Slot = View["freeSlots"][number];

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
const dateTime = (iso: string) => `${dayLabel(iso)} à ${timeLabel(iso)}`;
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });

function SlotPicker({ slots, busy, onPick, onDecline, showDecline }: {
  readonly slots: readonly Slot[];
  readonly busy: boolean;
  readonly onPick: (id: string) => void;
  readonly onDecline: () => void;
  readonly showDecline: boolean;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const days = [...new Set(slots.map((s) => dayKey(s.startsAt)))];
  return (
    <div className="space-y-4">
      {days.map((d) => {
        const ofDay = slots.filter((s) => dayKey(s.startsAt) === d);
        return (
          <fieldset key={d} className="space-y-2">
            <legend className="font-semibold text-ink first-letter:uppercase">{dayLabel(ofDay[0].startsAt)}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {ofDay.map((s) => (
                <label
                  key={s.id}
                  className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-control border p-3 ${chosen === s.id ? "border-brand bg-brand-soft" : "border-line bg-surface"}`}
                >
                  <input type="radio" name="slot" className="mt-1 size-5 accent-brand" checked={chosen === s.id} disabled={busy} onChange={() => setChosen(s.id)} />
                  <span className="text-[15px] text-ink">
                    <span className="font-semibold">{timeLabel(s.startsAt)}</span> · {s.durationMinutes} min
                    <span className="block text-[13px] text-ink-muted">
                      {s.visioUrl ? "En visio" : (s.location ?? "Lieu communiqué par l'équipe")}
                      {s.interviewerName ? ` · avec ${s.interviewerName}` : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={!chosen || busy} onClick={() => chosen && onPick(chosen)}>
          {busy ? "Réservation…" : "Réserver ce créneau"}
        </Button>
        {showDecline && (
          <Button type="button" variant="ghost" disabled={busy} onClick={onDecline}>
            Aucun créneau ne me convient
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Rendez-vous d'entretien du candidat (spec 082), par son lien : choisir un créneau, le changer
 * ou l'annuler jusqu'à 24 h avant. Utilisé après l'envoi de la fiche et sur `/entretien/<lien>`.
 */
export default function InterviewManager({ token, afterSubmit = false }: { readonly token: string; readonly afterSubmit?: boolean }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const [declined, setDeclined] = useState(false);

  const url = `/api/serving/public/interview/${encodeURIComponent(token)}`;
  const load = useCallback(async () => {
    const res = await fetch(url, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? "Ce lien ne mène à aucun rendez-vous.");
    setView(body as View);
  }, [url]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement initial du rendez-vous
    void load();
  }, [load]);

  async function act(body: Record<string, unknown>, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "La demande n'a pas abouti.");
      void load();
      return;
    }
    setView(json as View);
    setChanging(false);
    setNotice(success);
  }

  if (!view) return error ? <Alert tone="info" title={error} /> : <p className="text-ink-muted">Chargement…</p>;
  if (!view.open) return <Alert tone="info" title="Ta candidature n'est plus à l'étude : l'équipe te recontactera." />;

  const i = view.interview;
  const contact = view.pvsEmail ? ` (${view.pvsEmail})` : "";

  return (
    <div className="space-y-5">
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      {i && !changing ? (
        <div className="space-y-3 rounded-card border border-line bg-surface p-4">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-muted">Ton entretien</p>
          <p className="text-lg font-semibold text-ink first-letter:uppercase">{dateTime(i.startsAt)}</p>
          <p className="text-[15px] text-ink">
            {i.durationMinutes} min ·{" "}
            {i.visioUrl ? (
              <a href={i.visioUrl} className="font-semibold text-brand-text underline" target="_blank" rel="noopener noreferrer">
                Rejoindre la visio
              </a>
            ) : (
              (i.location ?? "lieu communiqué par l'équipe")
            )}
            {i.interviewerName ? ` · avec ${i.interviewerName}` : ""}
          </p>
          {i.past ? null : i.canChange ? (
            <div className="flex flex-wrap gap-3">
              {view.freeSlots.length > 0 && (
                <Button type="button" variant="secondary" disabled={busy} onClick={() => setChanging(true)}>
                  Changer de créneau
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (confirm("Annuler ton rendez-vous ?")) void act({ action: "cancel" }, "Ton rendez-vous est annulé. Tu peux en choisir un autre quand tu veux.");
                }}
              >
                Annuler le rendez-vous
              </Button>
            </div>
          ) : (
            <p className="text-[14px] text-ink-muted">
              Ton entretien est dans moins de 24 heures : pour le changer ou l&apos;annuler, contacte l&apos;équipe Vie des STAR{contact}.
            </p>
          )}
        </div>
      ) : declined ? (
        <Alert tone="info" title="C'est noté : l'équipe Vie des STAR te recontactera pour fixer un rendez-vous." />
      ) : view.freeSlots.length === 0 ? (
        <Alert tone="info" title="Aucun créneau d'entretien n'est disponible pour le moment.">
          Tu recevras un email dès que de nouveaux créneaux seront proposés, ou l&apos;équipe te recontactera.
        </Alert>
      ) : (
        <div className="space-y-3">
          <h2 className="font-semibold text-ink">{i ? "Choisis un nouveau créneau" : afterSubmit ? "Choisis ton créneau d'entretien" : "Choisis un créneau d'entretien"}</h2>
          <p className="text-[14px] text-ink-muted">
            Un membre de l&apos;équipe Vie des STAR te recevra. Tu pourras changer ou annuler jusqu&apos;à 24 heures avant.
          </p>
          <SlotPicker
            slots={view.freeSlots}
            busy={busy}
            showDecline={!i}
            onPick={(slotId) => void act({ action: "book", slotId }, "C'est réservé ! Un email de confirmation t'a été envoyé si ta fiche comporte une adresse.")}
            onDecline={() => void act({ action: "decline" }, "").then(() => setDeclined(true))}
          />
          {changing && (
            <Button type="button" variant="ghost" onClick={() => setChanging(false)}>
              Garder mon rendez-vous actuel
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

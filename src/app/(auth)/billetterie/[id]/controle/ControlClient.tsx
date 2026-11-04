"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, CameraOff, Minus, Plus, UserPlus } from "lucide-react";
import { Alert, Button, Checkbox, Input, Modal, SearchInput, Select } from "@/components/ui";
import { sha256Hex, newOpId } from "@/lib/offline/hash";
import { startScanner } from "@/lib/offline/scanner";
import type { ReceptionSnapshot } from "@/modules/ticketing";
import { AGE_GROUPS, AGE_GROUP_LABEL, formatEuros, parseScannedCode } from "@/modules/ticketing/schemas";
import type { TicketingAgeGroup } from "@/generated/prisma/enums";
import NetworkBar from "../_offline/NetworkBar";
import { useFieldSync } from "../_offline/use-field-sync";

type Mode = "IN" | "OUT" | "AUTO";
type Participant = ReceptionSnapshot["participants"][number];
type Tone = "ok" | "warn" | "bad";
interface Result {
  tone: Tone;
  title: string;
  detail?: string;
  /** Entrée à régler : encaissement proposé. */
  pay?: { participant: Participant };
}

const TONE_CLASS: Record<Tone, string> = {
  ok: "bg-success text-on-brand",
  warn: "bg-warning text-on-brand",
  bad: "bg-danger text-on-brand",
};
const MANUAL_REASONS = ["Enfant porté", "Intervenant sans badge", "Personne sans billet (accord)", "Correction de comptage"];

function modeStorage(eventId: string) {
  return `koinonia-control-mode:${eventId}`;
}

/** Contrôle des entrées et sorties : scan, code de réservation, recherche, comptage manuel, ajout sur place. */
export default function ControlClient({ eventId }: { readonly eventId: string }) {
  const { snapshot, setSnapshot, status, enqueue } = useFieldSync<ReceptionSnapshot>(eventId, "reception");
  const [mode, setMode] = useState<Mode>("AUTO");
  const [result, setResult] = useState<Result | null>(null);
  const [group, setGroup] = useState<{ bookingId: string; reference: string } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [camera, setCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState<{ direction: "IN" | "OUT"; reason: string } | null>(null);
  const [walkIn, setWalkIn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(modeStorage(eventId));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- préférence lue dans le stockage local au montage
      if (saved === "IN" || saved === "OUT" || saved === "AUTO") setMode(saved);
    } catch {
      // stockage indisponible : mode automatique
    }
  }, [eventId]);
  const chooseMode = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem(modeStorage(eventId), m);
    } catch {
      // sans incidence
    }
  };

  const index = useMemo(() => {
    const byTicket = new Map<string, Participant>();
    const byBooking = new Map<string, Participant[]>();
    for (const p of snapshot?.participants ?? []) {
      byTicket.set(p.ticketHash, p);
      byBooking.set(p.bookingId, [...(byBooking.get(p.bookingId) ?? []), p]);
    }
    return {
      byTicket,
      byBooking,
      bookingByScan: new Map((snapshot?.bookings ?? []).map((b) => [b.scanHash, b])),
      badgeByHash: new Map((snapshot?.badges ?? []).map((b) => [b.hash, b])),
    };
  }, [snapshot]);

  const inside = useMemo(() => new Set(snapshot?.inside ?? []), [snapshot]);
  const total = snapshot ? inside.size + snapshot.manual : 0;
  const capacity = snapshot?.event.capacity ?? 0;
  const level = capacity > 0 && total >= capacity ? 100 : capacity > 0 && total >= capacity * 0.9 ? 90 : 0;

  /** Met à jour l'état local (optimiste) puis met l'opération en file. */
  const record = useCallback(
    async (key: string, direction: "IN" | "OUT", op: Parameters<typeof enqueue>[0]) => {
      setSnapshot((s) => {
        if (!s) return s;
        const set = new Set(s.inside);
        if (direction === "IN") set.add(key);
        else set.delete(key);
        return { ...s, inside: [...set] };
      });
      await enqueue(op);
    },
    [enqueue, setSnapshot]
  );

  const directionFor = (key: string): "IN" | "OUT" => (mode === "AUTO" ? (inside.has(key) ? "OUT" : "IN") : mode);

  async function admitParticipant(p: Participant) {
    if (!p.active) return setResult({ tone: "bad", title: "Billet annulé", detail: `${p.firstName} ${p.lastName}` });
    const key = `p:${p.id}`;
    const direction = directionFor(key);
    if (direction === "IN" && inside.has(key)) return setResult({ tone: "warn", title: "Déjà à l'intérieur", detail: `${p.firstName} ${p.lastName}` });
    if (direction === "OUT" && !inside.has(key)) return setResult({ tone: "warn", title: "Pas enregistré à l'intérieur", detail: `${p.firstName} ${p.lastName}` });
    await record(key, direction, { type: "passage", id: newOpId(), subject: "PARTICIPANT", participantId: p.id, direction, scannedAt: new Date() });
    if (direction === "OUT" && p.unaccompanied) {
      return setResult({ tone: "warn", title: `Sortie d'un mineur non accompagné`, detail: `${p.firstName} ${p.lastName} — responsable : ${p.guardianPhone ?? "?"}` });
    }
    if (direction === "IN" && p.entryDue > 0) {
      return setResult({ tone: "warn", title: `Entrée à régler : ${formatEuros(p.entryDue)}`, detail: `${p.firstName} ${p.lastName} — entré(e)`, pay: { participant: p } });
    }
    setResult({ tone: "ok", title: direction === "IN" ? "Entrée" : "Sortie", detail: `${p.firstName} ${p.lastName} · ${AGE_GROUP_LABEL[p.ageGroup]}${p.unaccompanied ? " · mineur non accompagné" : ""}` });
  }

  async function onCode(raw: string) {
    const parsed = parseScannedCode(raw);
    if (!parsed) return setResult({ tone: "bad", title: "Code inconnu", detail: "Ce n'est pas un billet Koinonia." });
    if (parsed.scope === "label") return setResult({ tone: "bad", title: "Étiquette repas", detail: "Ce code sert à la restauration, pas à l'entrée." });
    const hash = await sha256Hex(parsed.token);
    if (parsed.scope === "ticket") {
      const p = index.byTicket.get(hash);
      return p ? admitParticipant(p) : setResult({ tone: "bad", title: "Billet inconnu", detail: "Billet d'un autre événement, ou instantané à mettre à jour." });
    }
    if (parsed.scope === "scan") {
      const booking = index.bookingByScan.get(hash);
      if (!booking) return setResult({ tone: "bad", title: "Réservation inconnue" });
      const members = (index.byBooking.get(booking.id) ?? []).filter((p) => p.active);
      setPicked(new Set(members.filter((p) => !inside.has(`p:${p.id}`)).map((p) => p.id)));
      setGroup({ bookingId: booking.id, reference: booking.reference });
      return;
    }
    const badge = index.badgeByHash.get(hash);
    if (!badge) return setResult({ tone: "bad", title: "Badge inconnu ou retiré" });
    const key = `s:${badge.id}`;
    const direction = directionFor(key);
    await record(key, direction, { type: "passage", id: newOpId(), subject: "STAFF", assignmentId: badge.id, direction, scannedAt: new Date() });
    setResult({ tone: "ok", title: direction === "IN" ? "Équipe — entrée" : "Équipe — sortie", detail: `${badge.name}${badge.postName ? ` · ${badge.postName}` : ""}` });
  }
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  });

  useEffect(() => {
    if (!camera || !videoRef.current) return;
    let stop: (() => void) | null = null;
    startScanner(videoRef.current, (text) => void onCodeRef.current(text))
      .then((s) => {
        stop = s;
      })
      .catch(() => {
        setCameraError("Caméra indisponible ou refusée. La recherche par nom reste possible.");
        setCamera(false);
      });
    return () => stop?.();
  }, [camera]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return (snapshot?.participants ?? []).filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q)).slice(0, 12);
  }, [search, snapshot]);

  if (!snapshot) {
    return (
      <div className="space-y-4">
        <NetworkBar status={status} />
        <p className="text-ink-muted">Chargement de l&apos;instantané… Une première connexion est nécessaire.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link href={`/billetterie/${eventId}`} className="text-[13px] text-brand-text underline">
          ← {snapshot.event.title}
        </Link>
        <span className="text-[13px] text-ink-muted">Contrôle</span>
      </div>
      <NetworkBar status={status} />

      <div className={`rounded-card p-4 text-center ${level === 100 ? "bg-danger-soft" : level === 90 ? "bg-warning-soft" : "bg-surface border border-line"}`}>
        <p className="text-[13px] text-ink-muted">Présents</p>
        <p className="text-4xl font-bold text-ink" aria-live="polite">
          {total} <span className="text-xl text-ink-muted">/ {capacity}</span>
        </p>
        {level > 0 && <p className="font-semibold text-ink">{level === 100 ? "Jauge atteinte : n'admettez plus personne." : "Jauge à 90 %."}</p>}
      </div>

      <fieldset className="grid grid-cols-3 gap-2">
        <legend className="sr-only">Mode du téléphone</legend>
        {(["IN", "OUT", "AUTO"] as const).map((m) => (
          <Button key={m} type="button" variant={mode === m ? "primary" : "secondary"} onClick={() => chooseMode(m)} aria-pressed={mode === m}>
            {{ IN: "Entrée", OUT: "Sortie", AUTO: "Auto" }[m]}
          </Button>
        ))}
      </fieldset>

      {result && (
        <button type="button" className={`w-full rounded-card p-5 text-left ${TONE_CLASS[result.tone]}`} onClick={() => setResult(null)} aria-live="assertive">
          <p className="text-2xl font-bold">{result.title}</p>
          {result.detail && <p className="text-lg">{result.detail}</p>}
        </button>
      )}
      {result?.pay && (
        <div className="flex gap-2">
          {(["CASH", "CHEQUE"] as const).map((method) => (
            <Button
              key={method}
              type="button"
              variant="secondary"
              onClick={async () => {
                const p = result.pay!.participant;
                await enqueue({ type: "receipt", id: newOpId(), bookingId: p.bookingId, participantIds: [p.id], method });
                setSnapshot((s) => (s ? { ...s, participants: s.participants.map((x) => (x.id === p.id ? { ...x, entryDue: 0 } : x)) } : s));
                setResult({ tone: "ok", title: "Entrée encaissée", detail: `${p.firstName} ${p.lastName}` });
              }}
            >
              Encaissé — {method === "CASH" ? "espèces" : "chèque"}
            </Button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {camera && <video ref={videoRef} className="aspect-square w-full rounded-card bg-surface-sunken object-cover" muted />}
        <Button type="button" variant={camera ? "secondary" : "primary"} className="w-full" onClick={() => setCamera((c) => !c)}>
          {camera ? <CameraOff className="size-4" aria-hidden="true" /> : <Camera className="size-4" aria-hidden="true" />}
          {camera ? "Arrêter la caméra" : "Scanner"}
        </Button>
        {cameraError && <Alert tone="warning">{cameraError}</Alert>}
      </div>

      <div className="space-y-2">
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Chercher un nom…" aria-label="Chercher un participant" />
        {matches.length > 0 && (
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {matches.map((p) => (
              <li key={p.id}>
                <button type="button" className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left" onClick={() => void admitParticipant(p)}>
                  <span className={p.active ? "text-ink" : "text-ink-subtle line-through"}>
                    {p.firstName} {p.lastName}
                  </span>
                  <span className="text-[13px] text-ink-muted">{inside.has(`p:${p.id}`) ? "à l'intérieur" : AGE_GROUP_LABEL[p.ageGroup]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" onClick={() => setManual({ direction: "IN", reason: MANUAL_REASONS[0] })}>
          <Plus className="size-4" aria-hidden="true" /> 1
        </Button>
        <Button type="button" variant="secondary" onClick={() => setManual({ direction: "OUT", reason: MANUAL_REASONS[0] })}>
          <Minus className="size-4" aria-hidden="true" /> 1
        </Button>
      </div>
      {snapshot.event.allowWalkIns && (
        <Button type="button" variant="secondary" className="w-full" onClick={() => setWalkIn(true)}>
          <UserPlus className="size-4" aria-hidden="true" /> Ajout sur place
        </Button>
      )}

      {group && (
        <Modal open onClose={() => setGroup(null)} title={`Réservation ${group.reference}`} mobileLayout="sheet">
          <div className="space-y-2">
            {(index.byBooking.get(group.bookingId) ?? []).map((p) => (
              <label key={p.id} className="flex min-h-11 items-center gap-3">
                <Checkbox
                  disabled={!p.active}
                  checked={picked.has(p.id)}
                  onChange={(e) =>
                    setPicked((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      return next;
                    })
                  }
                />
                <span className={`flex-1 ${p.active ? "text-ink" : "text-ink-subtle line-through"}`}>
                  {p.firstName} {p.lastName}
                </span>
                <span className="text-[13px] text-ink-muted">
                  {inside.has(`p:${p.id}`) ? "à l'intérieur" : ""}
                  {p.entryDue > 0 ? ` · à régler ${formatEuros(p.entryDue)}` : ""}
                </span>
              </label>
            ))}
            <Button
              type="button"
              disabled={picked.size === 0}
              onClick={async () => {
                const people = (index.byBooking.get(group.bookingId) ?? []).filter((p) => picked.has(p.id));
                const direction = mode === "OUT" ? "OUT" : "IN";
                for (const p of people) {
                  await record(`p:${p.id}`, direction, { type: "passage", id: newOpId(), subject: "PARTICIPANT", participantId: p.id, direction, scannedAt: new Date() });
                }
                const due = people.reduce((n, p) => n + p.entryDue, 0);
                setResult(
                  due > 0 && direction === "IN"
                    ? { tone: "warn", title: `${people.length} ${direction === "IN" ? "entrée(s)" : "sortie(s)"} — à régler ${formatEuros(due)}`, detail: group.reference }
                    : { tone: "ok", title: `${people.length} ${direction === "IN" ? "entrée(s)" : "sortie(s)"}`, detail: group.reference }
                );
                setGroup(null);
              }}
            >
              {mode === "OUT" ? "Faire sortir" : "Faire entrer"} ({picked.size})
            </Button>
          </div>
        </Modal>
      )}

      {manual && (
        <Modal open onClose={() => setManual(null)} title={manual.direction === "IN" ? "Comptage +1" : "Comptage −1"} mobileLayout="sheet">
          <div className="space-y-3">
            <Select label="Motif" value={manual.reason} options={MANUAL_REASONS.map((r) => ({ value: r, label: r }))} onChange={(e) => setManual({ ...manual, reason: e.target.value })} />
            <Button
              type="button"
              onClick={async () => {
                setSnapshot((s) => (s ? { ...s, manual: s.manual + (manual.direction === "IN" ? 1 : -1) } : s));
                await enqueue({ type: "manual", id: newOpId(), direction: manual.direction, reason: manual.reason, scannedAt: new Date() });
                setManual(null);
              }}
            >
              Enregistrer
            </Button>
          </div>
        </Modal>
      )}

      {walkIn && (
        <WalkInModal
          tariffs={snapshot.event.tariffs}
          onClose={() => setWalkIn(false)}
          onSubmit={async (people, method) => {
            const id = newOpId();
            setSnapshot((s) =>
              s
                ? {
                    ...s,
                    inside: [...s.inside, ...people.map((_, i) => `p:${id}-${i}`)],
                    participants: [
                      ...s.participants,
                      ...people.map((p, i) => ({ id: `${id}-${i}`, bookingId: `walkin-${id}`, firstName: p.firstName, lastName: p.lastName, ageGroup: p.ageGroup, ticketHash: "", active: true, entryDue: 0, unaccompanied: false, guardianPhone: null })),
                    ],
                  }
                : s
            );
            await enqueue({ type: "walkin", id, participants: people, method, enter: true, scannedAt: new Date() });
            setWalkIn(false);
            setResult({ tone: "ok", title: `${people.length} ajout(s) sur place`, detail: method ? "Entrée encaissée" : undefined });
          }}
        />
      )}
    </div>
  );
}

function WalkInModal({
  tariffs,
  onClose,
  onSubmit,
}: {
  readonly tariffs: { ageGroup: TicketingAgeGroup; price: number }[];
  readonly onClose: () => void;
  readonly onSubmit: (people: { firstName: string; lastName: string; ageGroup: TicketingAgeGroup }[], method: "CASH" | "CHEQUE" | null) => Promise<void>;
}) {
  const offered = AGE_GROUPS.filter((g) => tariffs.some((t) => t.ageGroup === g));
  const [people, setPeople] = useState([{ firstName: "", lastName: "", ageGroup: (offered[0] ?? "ADULT") as TicketingAgeGroup }]);
  const [method, setMethod] = useState<string>("");
  const total = people.reduce((n, p) => n + (tariffs.find((t) => t.ageGroup === p.ageGroup)?.price ?? 0), 0);
  const valid = people.every((p) => p.firstName.trim() && p.lastName.trim());
  return (
    <Modal open onClose={onClose} title="Ajout sur place">
      <div className="space-y-3">
        {people.map((p, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-3">
            <Input label="Prénom" value={p.firstName} onChange={(e) => setPeople((l) => l.map((x, j) => (j === i ? { ...x, firstName: e.target.value } : x)))} />
            <Input label="Nom" value={p.lastName} onChange={(e) => setPeople((l) => l.map((x, j) => (j === i ? { ...x, lastName: e.target.value } : x)))} />
            <Select
              label="Âge"
              value={p.ageGroup}
              options={offered.map((g) => ({ value: g, label: AGE_GROUP_LABEL[g] }))}
              onChange={(e) => setPeople((l) => l.map((x, j) => (j === i ? { ...x, ageGroup: e.target.value as TicketingAgeGroup } : x)))}
            />
          </div>
        ))}
        {people.length < 10 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setPeople((l) => [...l, { firstName: "", lastName: "", ageGroup: offered[0] ?? "ADULT" }])}>
            <Plus className="size-4" aria-hidden="true" /> Une personne de plus
          </Button>
        )}
        {total > 0 && (
          <Select
            label={`Entrée : ${formatEuros(total)}`}
            value={method}
            placeholder="Pas encore réglée"
            options={[
              { value: "CASH", label: "Encaissée en espèces" },
              { value: "CHEQUE", label: "Encaissée par chèque" },
            ]}
            onChange={(e) => setMethod(e.target.value)}
          />
        )}
        <Button
          type="button"
          disabled={!valid}
          onClick={() =>
            onSubmit(
              people.map((p) => ({ ...p, firstName: p.firstName.trim(), lastName: p.lastName.trim() })),
              method === "CASH" || method === "CHEQUE" ? method : null
            )
          }
        >
          Ajouter et faire entrer
        </Button>
      </div>
    </Modal>
  );
}

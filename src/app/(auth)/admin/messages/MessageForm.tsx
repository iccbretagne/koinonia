"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Checkbox, CheckboxGroup, Input, Textarea, useToast } from "@/components/ui";
import SystemMessageBanner from "@/components/SystemMessageBanner";
import { ROLE_LABELS } from "@/lib/roles";
import type { AudienceOptions, MessageStatus, SystemMessageView } from "@/modules/messages";
import { SEVERITIES, SEVERITY_LABEL, type Audience } from "@/modules/messages/schemas";
import type { Role } from "@/generated/prisma/enums";

const ROLE_ORDER: Role[] = [
  "ADMIN",
  "SECRETARY",
  "MINISTER",
  "DEPARTMENT_HEAD",
  "STAR",
  "DISCIPLE_MAKER",
  "REPORTER",
  "PASTORAL_CARE_REFERENT",
  "ACCOUNTANT",
  "SUPER_ADMIN",
];

const SEVERITY_HINT: Record<(typeof SEVERITIES)[number], string> = {
  INFO: "Neutre, se ferme d'une croix.",
  IMPORTANT: "Mis en avant, se ferme d'une croix.",
  URGENT: "Ne se ferme pas ; l'email part même si la personne a coupé ces messages.",
};

/** `datetime-local` ↔ ISO, dans l'heure de l'appareil. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const defaultEnd = () => toLocalInput(new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString());

async function errorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? "Enregistrement impossible. Réessayez dans un instant.";
}

interface MessageFormProps {
  readonly churchId: string;
  readonly isSuperAdmin: boolean;
  readonly options: AudienceOptions;
  /** Modification : message existant et son état. */
  readonly message?: SystemMessageView & { status: MessageStatus };
}

/** Rédaction et correction d'un message système (spec 071). */
export default function MessageForm({ churchId, isSuperAdmin, options, message }: MessageFormProps) {
  const router = useRouter();
  const toast = useToast();
  const id = useId();
  const editing = Boolean(message);
  const locked = message?.status === "active";

  const [title, setTitle] = useState(message?.title ?? "");
  const [body, setBody] = useState(message?.body ?? "");
  const [linkUrl, setLinkUrl] = useState(message?.linkUrl ?? "");
  const [linkLabel, setLinkLabel] = useState(message?.linkLabel ?? "");
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>(message?.severity ?? "INFO");
  const [instance, setInstance] = useState(message ? message.churchId === null : false);
  const [choose, setChoose] = useState(() => {
    const a = message?.audience;
    return Boolean(a && (a.roles.length || a.ministryIds.length || a.departmentIds.length));
  });
  const [roles, setRoles] = useState<string[]>(message?.audience.roles ?? []);
  const [ministryIds, setMinistryIds] = useState<string[]>(message?.audience.ministryIds ?? []);
  const [departmentIds, setDepartmentIds] = useState<string[]>(message?.audience.departmentIds ?? []);
  const [headsOnly, setHeadsOnly] = useState(message?.audience.headsOnly ?? false);
  const [startNow, setStartNow] = useState(!message || message.status !== "scheduled");
  const [startsAt, setStartsAt] = useState(toLocalInput(message?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(message ? toLocalInput(message.endsAt) : defaultEnd());
  const [count, setCount] = useState<{ recipients: number; membersWithoutAccount: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audience: Audience = useMemo(
    () =>
      choose
        ? {
            roles: roles as Role[],
            ministryIds: instance ? [] : ministryIds,
            departmentIds: instance ? [] : departmentIds,
            headsOnly: !instance && headsOnly,
          }
        : { roles: [], ministryIds: [], departmentIds: [], headsOnly: false },
    [choose, roles, ministryIds, departmentIds, headsOnly, instance]
  );
  const scope = useMemo(() => (instance ? { scope: "instance" as const } : { scope: "church" as const, churchId }), [instance, churchId]);

  // Décompte du public, retardé pour ne pas interroger à chaque case cochée.
  useEffect(() => {
    if (locked) return;
    let active = true;
    const timer = setTimeout(() => {
      fetch("/api/system-messages/audience-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...scope, audience }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (active) setCount(data);
        })
        .catch(() => {
          if (active) setCount(null);
        });
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [audience, scope, locked]);

  async function submit() {
    setError(null);
    if (!endsAt) {
      setError("Indiquez la date de fin.");
      return;
    }
    const period = {
      ...(startNow ? {} : { startsAt: new Date(startsAt).toISOString() }),
      endsAt: new Date(endsAt).toISOString(),
    };
    const content = { title, body, linkUrl: linkUrl || null, linkLabel: linkLabel || null };
    const payload = locked
      ? { ...content, endsAt: period.endsAt }
      : editing
        ? { ...content, severity, audience, ...period }
        : { ...scope, ...content, severity, audience, ...period };
    setBusy(true);
    try {
      const res = await fetch(editing ? `/api/system-messages/${message!.id}` : "/api/system-messages", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(await errorMessage(res));
        return;
      }
      toast.success(editing ? "Message mis à jour" : startNow ? "Message publié" : "Message programmé");
      router.push(`/admin/messages?etat=${startNow || locked ? "en-cours" : "programmes"}`);
      router.refresh();
    } catch {
      setError("Enregistrement impossible. Vérifiez votre connexion.");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (list: string[], value: string, on: boolean) =>
    on ? Array.from(new Set([...list, value])) : list.filter((v) => v !== value);

  return (
    <div className="flex flex-col gap-6">
      {locked && (
        <Alert tone="info" title="Message en cours.">
          Le titre, le texte, le lien et la date de fin se corrigent sans renvoyer de notification ; le public et la
          sévérité restent ceux de la publication.
        </Alert>
      )}

      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
        <Input label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
        <Textarea
          label="Texte"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={5}
          hint="Pas d'information sensible : le titre et le début du texte peuvent s'afficher sur un écran verrouillé."
        />
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Input
            label="Lien (facultatif)"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://… ou /planning"
          />
          <Input
            label="Libellé du lien"
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            placeholder="En savoir plus"
            maxLength={60}
            disabled={!linkUrl}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
        <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Sévérité</h2>
        <div role="radiogroup" aria-label="Sévérité" className="grid gap-2 sm:grid-cols-3">
          {SEVERITIES.map((s) => (
            <label
              key={s}
              className={`flex cursor-pointer flex-col gap-1 rounded-control border p-3 ${
                severity === s ? "border-brand bg-brand-soft" : "border-line"
              } ${locked ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${id}-severity`}
                  checked={severity === s}
                  disabled={locked}
                  onChange={() => setSeverity(s)}
                />
                <span className="text-[15px] font-semibold text-ink">{SEVERITY_LABEL[s]}</span>
              </span>
              <span className="text-[13px] leading-[18px] text-ink-muted">{SEVERITY_HINT[s]}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
        <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Public</h2>
        {isSuperAdmin && !editing && (
          <label className="flex items-center gap-2 text-[15px] text-ink">
            <Checkbox checked={instance} onChange={(e) => setInstance(e.target.checked)} />
            Toute l&apos;instance (toutes les églises)
          </label>
        )}
        <div role="radiogroup" aria-label="Public" className="flex flex-wrap gap-4">
          {[
            { value: false, label: instance ? "Tout le monde" : "Toute l'église" },
            { value: true, label: "Choisir" },
          ].map((o) => (
            <label key={String(o.value)} className="flex items-center gap-2 text-[15px] text-ink">
              <input
                type="radio"
                name={`${id}-audience`}
                checked={choose === o.value}
                disabled={locked}
                onChange={() => setChoose(o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>

        {choose && (
          <div className="flex flex-col gap-4">
            <CheckboxGroup
              label="Rôles (aucun coché : tous les rôles)"
              options={ROLE_ORDER.map((r) => ({ value: r, label: ROLE_LABELS[r], disabled: locked }))}
              selected={roles}
              onChange={setRoles}
            />
            {!instance && options.ministries.length > 0 && (
              <fieldset className="flex flex-col gap-2" disabled={locked}>
                <legend className="mb-1 text-sm font-medium text-ink">
                  Ministères et départements (aucun coché : toute l&apos;église)
                </legend>
                {options.ministries.map((m) => (
                  <div key={m.id} className="flex flex-col gap-1">
                    <label className="flex items-center gap-2 text-[15px] font-medium text-ink">
                      <Checkbox
                        checked={ministryIds.includes(m.id)}
                        onChange={(e) => setMinistryIds((prev) => toggle(prev, m.id, e.target.checked))}
                      />
                      {m.name}
                    </label>
                    <div className="ml-6 flex flex-wrap gap-x-4 gap-y-1">
                      {m.departments.map((d) => (
                        <label key={d.id} className="flex items-center gap-2 text-[13px] text-ink-muted">
                          <Checkbox
                            checked={departmentIds.includes(d.id)}
                            onChange={(e) => setDepartmentIds((prev) => toggle(prev, d.id, e.target.checked))}
                          />
                          {d.name}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <label className="mt-2 flex items-center gap-2 text-[15px] text-ink">
                  <Checkbox checked={headsOnly} onChange={(e) => setHeadsOnly(e.target.checked)} />
                  Responsables seulement (Ministres et responsables de département)
                </label>
              </fieldset>
            )}
          </div>
        )}

        {!locked && count && (
          <p className="text-[15px] text-ink" aria-live="polite">
            <strong>{count.recipients}</strong> personne{count.recipients > 1 ? "s" : ""} visée
            {count.recipients > 1 ? "s" : ""}
            {count.membersWithoutAccount > 0 &&
              ` · ${count.membersWithoutAccount} STAR sans compte ne recevront pas ce message`}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
        <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Période</h2>
        {!locked && (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-[15px] text-ink">
              <input type="radio" name={`${id}-start`} checked={startNow} onChange={() => setStartNow(true)} />
              Publier maintenant
            </label>
            <label className="flex items-center gap-2 text-[15px] text-ink">
              <input type="radio" name={`${id}-start`} checked={!startNow} onChange={() => setStartNow(false)} />
              Programmer
            </label>
            {!startNow && (
              <Input
                label="Début"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            )}
          </div>
        )}
        <Input label="Fin" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
      </section>

      {title && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-ink">Aperçu du bandeau</h2>
          <SystemMessageBanner preview messages={[{ id: "preview", title, body: body || "…", severity }]} />
        </section>
      )}

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex flex-wrap gap-2">
        <Button onClick={submit} disabled={busy || !title.trim() || !body.trim()}>
          {busy ? "Enregistrement…" : editing ? "Enregistrer" : startNow ? "Publier" : "Programmer"}
        </Button>
        <Button variant="ghost" onClick={() => router.push("/admin/messages")} disabled={busy}>
          Annuler
        </Button>
      </div>
    </div>
  );
}

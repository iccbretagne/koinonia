"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Checkbox, CheckboxGroup, Input, RadioGroup, Textarea, useToast } from "@/components/ui";
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

/** Libellé du bouton et du message de confirmation. */
function submitLabel(editing: boolean, startNow: boolean): { button: string; toast: string } {
  if (editing) return { button: "Enregistrer", toast: "Message mis à jour" };
  if (startNow) return { button: "Publier", toast: "Message publié" };
  return { button: "Programmer", toast: "Message programmé" };
}

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
  const [startNow, setStartNow] = useState(message?.status !== "scheduled");
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
    // En cours : seuls le contenu et la fin changent ; création : la portée s'ajoute.
    let payload: Record<string, unknown> = { ...content, severity, audience, ...period };
    if (locked) payload = { ...content, endsAt: period.endsAt };
    else if (!editing) payload = { ...scope, ...payload };
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
      toast.success(editing ? "Message mis à jour" : submitLabel(false, startNow).toast);
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

      <section className="flex flex-col gap-4">
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
            hint={linkUrl ? undefined : "Renseignez d'abord le lien."}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Sévérité</h2>
        <RadioGroup
          legend="Sévérité"
          hideLegend
          name={`${id}-severity`}
          value={severity}
          disabled={locked}
          onChange={setSeverity}
          options={SEVERITIES.map((s) => ({ value: s, label: SEVERITY_LABEL[s], description: SEVERITY_HINT[s] }))}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Public</h2>
        {isSuperAdmin && !editing && (
          <label className="flex min-h-11 items-center gap-2 text-[15px] text-ink">
            <Checkbox checked={instance} onChange={(e) => setInstance(e.target.checked)} />
            Toute l&apos;instance (toutes les églises)
          </label>
        )}
        <RadioGroup
          legend="Public"
          hideLegend
          name={`${id}-audience`}
          value={choose ? "choose" : "all"}
          disabled={locked}
          onChange={(v) => setChoose(v === "choose")}
          options={[
            { value: "all", label: instance ? "Tout le monde" : "Toute l'église" },
            { value: "choose", label: "Choisir" },
          ]}
        />

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

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Période</h2>
        {!locked && (
          <div className="flex flex-col gap-2">
            <RadioGroup
              legend="Début"
              hideLegend
              name={`${id}-start`}
              value={startNow ? "now" : "later"}
              onChange={(v) => setStartNow(v === "now")}
              options={[
                { value: "now", label: "Publier maintenant" },
                { value: "later", label: "Programmer" },
              ]}
            />
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
          <h2 className="font-display text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-subtle">Aperçu du bandeau</h2>
          <SystemMessageBanner preview messages={[{ id: "preview", title, body: body || "…", severity }]} />
        </section>
      )}

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={submit}
          disabled={busy || !title.trim() || !body.trim()}
          title={!title.trim() || !body.trim() ? "Renseignez le titre et le texte" : undefined}
        >
          {busy ? "Enregistrement…" : submitLabel(editing, startNow).button}
        </Button>
        <Button variant="ghost" onClick={() => router.push("/admin/messages")} disabled={busy}>
          Annuler
        </Button>
      </div>
    </div>
  );
}

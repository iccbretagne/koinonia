"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Link2 } from "lucide-react";
import { Alert, Button, Checkbox, CheckboxGroup, Modal, Select, StatusChip, Textarea, buttonClasses, useToast } from "@/components/ui";
import {
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_STATUS_LABELS,
  MESSAGE_KINDS,
  MESSAGE_KIND_LABELS,
  composeMessage,
  isCollectiveKind,
  type AssignmentStatus,
  type MessageKind,
} from "@/modules/campaigns/schemas";
import {
  TARGET_MODE_LABELS,
  buildMessageContext,
  composeOptions,
  initialSettings,
  withKind,
  type CommunicationSettings,
  type TargetMode,
} from "./pilotage";
import { useCopy } from "./use-copy";
import type { CampaignOverviewData } from "./types";

export interface CommunicationPreset {
  kind: MessageKind;
  contributionId?: string | null;
}

type Entry = { key: string; title: string; text: string; assignmentId: string | null; guest?: string };

const TARGET_MODES: readonly TargetMode[] = ["auto", "remaining", "overdue", "statuses", "one"];

function CheckLine({ checked, onChange, children }: { readonly checked: boolean; readonly onChange: (v: boolean) => void; readonly children: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-ink">
      <Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

/**
 * Fenêtre « Communication » (spec 091, EVOL-01 et EVOL-04) : compose un message depuis l'état réel
 * de la campagne (données serveur relues à l'ouverture), modifiable puis copié. **Rien n'est
 * envoyé.** Un message collectif ne porte aucun lien de contribution ; le lien personnel d'une
 * personne sans compte est récupéré à la demande et donne un message pour elle seule.
 */
export default function CommunicationModal({
  overview,
  appUrl,
  preset,
  onClose,
}: {
  readonly overview: CampaignOverviewData;
  readonly appUrl: string;
  readonly preset: CommunicationPreset | null;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const copy = useCopy();
  const [settings, setSettings] = useState<CommunicationSettings>(() => initialSettings(preset ?? undefined));
  // Date du point : l'ouverture de la fenêtre (montée à chaque ouverture).
  const [now] = useState(() => new Date());
  const [edits, setEdits] = useState<{ key: string; texts: Record<string, string> }>({ key: "", texts: {} });
  const [guestLinks, setGuestLinks] = useState<Record<string, { assignmentId: string; name: string; link: string }>>({});
  const [loadingGuest, setLoadingGuest] = useState<string | null>(null);

  // État réel : les données serveur sont relues à l'ouverture de la fenêtre.
  useEffect(() => {
    router.refresh();
  }, [router]);

  const set = <K extends keyof CommunicationSettings>(key: K, value: CommunicationSettings[K]) => setSettings((s) => ({ ...s, [key]: value }));
  const collective = isCollectiveKind(settings.kind);
  const templates = useMemo(() => overview.campaign.messageTemplates ?? {}, [overview.campaign.messageTemplates]);

  const assignmentsById = useMemo(() => {
    const map = new Map<string, CampaignOverviewData["forms"][number]["assignments"][number]>();
    for (const f of overview.forms) for (const a of f.assignments) map.set(a.id, a);
    return map;
  }, [overview.forms]);

  const contributionOptions = overview.forms.flatMap((f) =>
    f.assignments.map((a) => ({ value: a.id, label: `${f.title} › ${a.label}${f.confidential ? " (confidentiel)" : ""}` }))
  );

  const result = useMemo(
    () => composeMessage(settings.kind, buildMessageContext(overview, appUrl, now), composeOptions(settings, templates)),
    [settings, overview, appUrl, now, templates]
  );

  const entries: Entry[] = useMemo(() => {
    if (result.collective) return [{ key: "collective", title: MESSAGE_KIND_LABELS[settings.kind], text: result.messages[0]?.text ?? "", assignmentId: null }];
    const list: Entry[] = [];
    for (const m of result.messages) {
      const c = m.contribution;
      if (!c) continue;
      list.push({ key: c.id, title: c.label === c.formTitle ? c.label : `${c.formTitle} › ${c.label}`, text: m.text, assignmentId: c.id });
      for (const [respondentId, g] of Object.entries(guestLinks)) {
        if (g.assignmentId !== c.id) continue;
        const personal = composeMessage(
          settings.kind,
          buildMessageContext(overview, appUrl, now, { [c.id]: g.link }),
          { ...composeOptions(settings, templates), contributionIds: [c.id] }
        );
        const text = personal.messages[0]?.text;
        if (text) list.push({ key: `${c.id}:${respondentId}`, title: `${c.label} · pour ${g.name} seulement`, text, assignmentId: c.id, guest: g.name });
      }
    }
    return list;
  }, [result, settings, overview, appUrl, now, templates, guestLinks]);

  // Les modifications du texte valent pour les réglages en cours ; les changer recompose.
  const editKey = JSON.stringify(settings);
  const textOf = (e: Entry) => (edits.key === editKey ? edits.texts[e.key] : undefined) ?? e.text;
  const edit = (k: string, text: string) =>
    setEdits((prev) => ({ key: editKey, texts: { ...(prev.key === editKey ? prev.texts : {}), [k]: text } }));

  async function prepareGuest(assignmentId: string, respondentId: string, name: string) {
    setLoadingGuest(respondentId);
    try {
      const res = await fetch(`/api/campaigns/assignments/${assignmentId}/respondents/${respondentId}/link`);
      const data = (await res.json().catch(() => ({}))) as { link?: string; error?: string };
      if (!res.ok || !data.link) {
        toast.error(data.error ?? "Le lien personnel n'a pas pu être récupéré.");
        return;
      }
      setGuestLinks((g) => ({ ...g, [respondentId]: { assignmentId, name, link: data.link as string } }));
    } catch {
      toast.error("Connexion impossible. Réessayez dans un instant.");
    } finally {
      setLoadingGuest(null);
    }
  }

  const scope = result.excludedConfidential
    ? `${result.excludedConfidential} ${result.excludedConfidential > 1 ? "contributions confidentielles non comptées" : "contribution confidentielle non comptée"}.`
    : settings.includeConfidential
      ? "Contributions confidentielles comprises."
      : null;

  return (
    <Modal open onClose={onClose} title="Communication" size="lg">
      <div className="flex flex-col gap-5">
        <Alert tone="info" title="Rien n'est envoyé : copiez le message.">
          Collez-le ensuite dans WhatsApp ou votre messagerie. Aucune notification n&apos;est envoyée, aucun statut ne change.
        </Alert>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Type de message"
            value={settings.kind}
            onChange={(e) => setSettings((prev) => withKind(prev, e.target.value as MessageKind))}
            options={MESSAGE_KINDS.map((k) => ({ value: k, label: MESSAGE_KIND_LABELS[k] }))}
          />
          <Select
            label="Contributions concernées"
            value={settings.mode}
            onChange={(e) => set("mode", e.target.value as TargetMode)}
            options={TARGET_MODES.map((m) => ({ value: m, label: TARGET_MODE_LABELS[m] }))}
          />
        </div>

        {settings.mode === "statuses" && (
          <CheckboxGroup
            label="Statuts"
            options={ASSIGNMENT_STATUSES.map((s) => ({ value: s, label: ASSIGNMENT_STATUS_LABELS[s] }))}
            selected={[...settings.statuses]}
            onChange={(v) => set("statuses", v as AssignmentStatus[])}
          />
        )}
        {settings.mode === "one" && (
          <Select
            label="Contribution"
            value={settings.contributionId ?? ""}
            placeholder="Choisir une contribution"
            onChange={(e) => set("contributionId", e.target.value || null)}
            options={contributionOptions}
          />
        )}

        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <Select
            label="Niveau de détail"
            value={settings.detail}
            onChange={(e) => set("detail", e.target.value as "short" | "full")}
            options={[
              { value: "short", label: "Court" },
              { value: "full", label: "Complet (statuts et échéances)" },
            ]}
          />
          <div className="flex flex-col pt-2 sm:pt-6">
            <CheckLine checked={settings.includeConfidential} onChange={(v) => set("includeConfidential", v)}>
              Inclure les questionnaires confidentiels
            </CheckLine>
          </div>
        </div>
        {collective && (
          <div className="flex flex-col sm:flex-row sm:gap-6">
            <CheckLine checked={settings.showDone} onChange={(v) => set("showDone", v)}>
              Afficher les services ayant répondu
            </CheckLine>
            <CheckLine checked={settings.showRemaining} onChange={(v) => set("showRemaining", v)}>
              Afficher les services restant à répondre
            </CheckLine>
          </div>
        )}

        <p className="text-[13px] leading-[18px] text-ink-muted" aria-live="polite">
          {result.counts.done}/{result.counts.total} contributions transmises · {result.counts.overdue} en retard
          {scope ? ` · ${scope}` : ""}
          {!collective && ` · ${entries.length} message${entries.length > 1 ? "s" : ""}`}
        </p>

        {entries.length === 0 && (
          <p className="text-[15px] text-ink-muted">Aucune contribution ne correspond à ce ciblage : aucun message à préparer.</p>
        )}

        <ul className="flex flex-col gap-5">
          {entries.map((e) => {
            const fieldId = `message-${e.key.replace(/[^A-Za-z0-9_-]/g, "-")}`;
            const assignment = e.assignmentId ? assignmentsById.get(e.assignmentId) : undefined;
            const guests = !e.guest && assignment ? assignment.respondents.filter((r) => r.kind === "link") : [];
            const hasAccount = !!assignment?.respondents.some((r) => r.kind === "account");
            return (
              <li key={e.key} className="flex flex-col gap-2 rounded-card border border-line px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="min-w-0 font-display text-[15px] font-semibold leading-[22px] text-ink">{e.title}</h3>
                  {e.guest && <StatusChip tone="warning">Lien personnel</StatusChip>}
                  {!e.guest && assignment && !hasAccount && <StatusChip tone="neutral">Aucun compte répondant</StatusChip>}
                </div>
                <Textarea
                  id={fieldId}
                  label="Message"
                  value={textOf(e)}
                  onChange={(ev) => edit(e.key, ev.target.value)}
                  rows={collective ? 12 : 9}
                  hint={e.guest ? "Contient un lien personnel : à envoyer à cette seule personne, par un canal privé." : undefined}
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button type="button" variant="secondary" size="sm" onClick={() => void copy(textOf(e), "Message copié", fieldId)}>
                    <Copy aria-hidden="true" className="size-4" strokeWidth={1.75} />
                    Copier le message
                  </Button>
                  {e.assignmentId ? (
                    <Link href={`/collectes/r/${e.assignmentId}`} target="_blank" className={buttonClasses("secondary", "sm")}>
                      <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.75} />
                      Ouvrir le questionnaire
                    </Link>
                  ) : (
                    <Link href="/collectes" target="_blank" className={buttonClasses("secondary", "sm")}>
                      <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.75} />
                      Ouvrir les questionnaires
                    </Link>
                  )}
                  {guests.map((g) =>
                    guestLinks[g.id] ? null : (
                      <Button
                        key={g.id}
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={loadingGuest !== null}
                        onClick={() => void prepareGuest(e.assignmentId as string, g.id, g.name)}
                      >
                        <Link2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
                        {loadingGuest === g.id ? "Préparation…" : `Préparer son message · ${g.name}`}
                      </Button>
                    )
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </Modal>
  );
}

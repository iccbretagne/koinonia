"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, FolderOpen } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { buttonClasses } from "@/components/ui/button-classes";
import { useToast } from "@/components/ui/Toast";
import { REQUEST_TYPE_LABEL } from "@/lib/request-queue";
import ReasonForm from "./ReasonForm";
import { ActionRow, DetailField, DetailMeta, ExternalAnchor, ReviewBlock } from "./DetailBlocks";
import { textOf, type DetailContext, type QueueItem } from "./queue-types";

export interface MediaProjectOption {
  readonly id: string;
  readonly name: string;
  readonly shareTokens: readonly { readonly token: string; readonly type: string }[];
}

/**
 * Panneau de détail de la Production Média (spec 063) : demande de visuel. Prise en charge en
 * rattachant un projet média (existant ou nouveau), livraison, annulation avec motif.
 */
export default function VisuelDetail({
  item,
  ctx,
  churchId,
  projects,
  onProjectCreated,
}: {
  readonly item: QueueItem;
  readonly ctx: DetailContext;
  readonly churchId: string;
  readonly projects: readonly MediaProjectOption[];
  readonly onProjectCreated: (project: MediaProjectOption) => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<"take" | "cancel" | null>(null);
  const [projectMode, setProjectMode] = useState<"existing" | "new">(projects.length > 0 ? "existing" : "new");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [projectName, setProjectName] = useState("");
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState("");

  const p = item.payload;
  const brief = textOf(p.brief);
  const format = textOf(p.format);
  const deliveryLink = textOf(p.deliveryLink);
  const linkedId = textOf(p.mediaProjectId);
  const linked = linkedId ? projects.find((pr) => pr.id === linkedId) : undefined;
  const share = linked?.shareTokens[0];
  const shareUrl = share ? (share.type === "GALLERY" ? `/media/g/${share.token}` : `/media/d/${share.token}`) : null;
  const isOpen = item.status === "EN_ATTENTE" || item.status === "EN_COURS";
  const busy = ctx.busy || creating;
  const canConfirmTake = projectMode === "existing" ? projectId !== "" : projectName.trim() !== "";

  async function takeCharge() {
    let id = projectId;
    let isNew = false;
    if (projectMode === "new") {
      setCreating(true);
      try {
        const res = await fetch("/api/media-projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: projectName.trim(), churchId }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Création du projet impossible");
        id = json.id;
        isNew = true;
        onProjectCreated({ id, name: projectName.trim(), shareTokens: [] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Création du projet impossible");
        return;
      } finally {
        setCreating(false);
      }
    }
    // Un projet créé reste dans la bibliothèque : pas de retour arrière dans ce cas (spec 063).
    await ctx.act(
      { status: "EN_COURS", payload: { mediaProjectId: id } },
      {
        success: "Visuel pris en charge",
        undo: isNew ? undefined : { status: "EN_ATTENTE", payload: { mediaProjectId: null } },
      }
    );
  }

  return (
    <>
      <DetailMeta item={item} doneLabel="Livré" />
      {brief && (
        <p className="whitespace-pre-wrap break-words rounded-control bg-surface-sunken px-4 py-3 text-[15px] leading-[22px] text-ink">
          {brief}
        </p>
      )}
      <dl className="grid gap-3 sm:grid-cols-2">
        {format && <DetailField label="Format">{format}</DetailField>}
        {item.announcement ? (
          <DetailField label="Annonce">
            {item.announcement.title}
            {item.parentType ? ` · pour ${REQUEST_TYPE_LABEL[item.parentType]?.toLowerCase() ?? item.parentType}` : ""}
          </DetailField>
        ) : (
          <DetailField label="Annonce">Visuel demandé sans annonce</DetailField>
        )}
      </dl>
      <ReviewBlock item={item} />

      {linked && (item.status === "EN_COURS" || item.status === "LIVRE") && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Link href={`/media/projects/${linked.id}`} className={buttonClasses("secondary")}>
            <FolderOpen aria-hidden="true" className="size-4" />
            {linked.name}
          </Link>
          {shareUrl && (
            <a href={shareUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses("ghost")}>
              <Download aria-hidden="true" className="size-4" />
              Télécharger
            </a>
          )}
        </div>
      )}
      {!linked && item.status === "LIVRE" && deliveryLink && <ExternalAnchor href={deliveryLink}>Voir le visuel livré</ExternalAnchor>}

      {isOpen && mode === null && (
        <>
          {item.status === "EN_COURS" && !linked && (
            <Input
              type="url"
              label="Lien de livraison (facultatif)"
              hint="Canva, Drive…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://"
            />
          )}
          <ActionRow>
            {item.status === "EN_ATTENTE" ? (
              <Button disabled={busy} onClick={() => setMode("take")}>
                Prendre en charge
              </Button>
            ) : (
              <Button
                disabled={busy}
                onClick={() =>
                  ctx.act(
                    { status: "LIVRE", ...(!linked && link.trim() ? { deliveryLink: link.trim() } : {}) },
                    { success: "Visuel marqué livré", undo: { status: "EN_COURS" } }
                  )
                }
              >
                Marquer livré
              </Button>
            )}
            <Button variant="ghost" disabled={busy} onClick={() => setMode("cancel")}>
              Annuler la demande
            </Button>
          </ActionRow>
        </>
      )}

      {mode === "take" && (
        <form
          className="flex flex-col gap-3 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canConfirmTake) void takeCharge();
          }}
        >
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-[13px] font-semibold leading-[18px] text-ink-subtle">Rattacher à un projet média</legend>
            {projects.length > 0 && (
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-ink">
                <input type="radio" name="project-mode" checked={projectMode === "existing"} onChange={() => setProjectMode("existing")} className="size-5 accent-brand" />
                Projet existant
              </label>
            )}
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-ink">
              <input type="radio" name="project-mode" checked={projectMode === "new"} onChange={() => setProjectMode("new")} className="size-5 accent-brand" />
              Nouveau projet
            </label>
          </fieldset>
          {projectMode === "existing" ? (
            <Select
              label="Projet"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              options={projects.map((pr) => ({ value: pr.id, label: pr.name }))}
            />
          ) : (
            <Input label="Nom du projet" value={projectName} onChange={(e) => setProjectName(e.target.value)} required autoFocus />
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" disabled={!canConfirmTake || busy}>
              {busy ? "Envoi…" : "Confirmer la prise en charge"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setMode(null)} disabled={busy}>
              Retour
            </Button>
          </div>
        </form>
      )}

      {mode === "cancel" && (
        <ReasonForm
          label="Motif de l'annulation"
          confirmLabel="Annuler la demande"
          busy={busy}
          onCancel={() => setMode(null)}
          onConfirm={(reason) => void ctx.act({ status: "ANNULE", reviewNotes: reason }, { success: "Demande de visuel annulée" })}
        />
      )}
    </>
  );
}

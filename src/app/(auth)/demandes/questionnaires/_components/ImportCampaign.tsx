"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { FileJson } from "lucide-react";
import { Button, Textarea, useToast } from "@/components/ui";
import type { ImportPreview } from "@/modules/campaigns";
import ImportPreviewView, { ImportErrorAlert, importErrorFrom, isPreviewBlocked, type ImportError } from "./ImportPreviewView";
import FileInput from "@/components/ui/FileInput";
import { paths } from "@/lib/paths";

/**
 * Import d'une définition de campagne (spec 090) : coller ou déposer un JSON, vérifier (aperçu
 * sans écriture), puis appliquer. En mise à jour, `campaignId` est envoyé : le serveur applique la
 * définition à cette campagne, dans son église, et refuse une autre clé ; `expectedKey` l'annonce
 * dès l'aperçu.
 */
export default function ImportCampaign({
  expectedKey,
  campaignId,
}: {
  readonly expectedKey?: string;
  /** Mise à jour d'une campagne existante : toujours envoyé, son église fait foi côté serveur. */
  readonly campaignId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<ImportError | null>(null);
  const [busy, setBusy] = useState<"check" | "apply" | null>(null);

  function change(value: string) {
    setText(value);
    setPreview(null);
    setError(null);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError({ title: "Fichier trop volumineux (2 Mo au plus).", items: [] });
      return;
    }
    change(await file.text());
  }

  async function send(dryRun: boolean) {
    let definition: unknown;
    try {
      definition = JSON.parse(text);
    } catch {
      setError({ title: "Ce texte n'est pas du JSON valide.", items: [] });
      setPreview(null);
      return;
    }
    setBusy(dryRun ? "check" : "apply");
    setError(null);
    try {
      const res = await fetch("/api/campaigns/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definition, dryRun, ...(campaignId ? { campaignId } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(importErrorFrom(data));
        if (res.status !== 409) setPreview(null);
        return;
      }
      const result = data as ImportPreview;
      if (dryRun) {
        setPreview(result);
        return;
      }
      toast.success(result.campaign.action === "create" ? "Campagne créée" : "Définition appliquée");
      if (result.campaignId) router.push(paths.collectes.campaign(result.campaignId));
      router.refresh();
    } catch {
      setError({ title: "Connexion impossible. Réessayez dans un instant.", items: [] });
    } finally {
      setBusy(null);
    }
  }

  const blocked = !!preview && isPreviewBlocked(preview, expectedKey);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Textarea
          label="Définition (JSON koinonia.campaign)"
          value={text}
          onChange={(e) => change(e.target.value)}
          rows={10}
          spellCheck={false}
          className="font-mono"
          placeholder='{ "format": "koinonia.campaign", "version": 1, … }'
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <FileInput accept=".json,application/json" icon={FileJson} buttonLabel="Choisir un fichier JSON" fileNames={[]} onChange={onFile} />
          <Button type="button" variant={preview ? "secondary" : "primary"} disabled={!text.trim() || busy !== null} onClick={() => send(true)}>
            {busy === "check" ? "Vérification…" : "Vérifier"}
          </Button>
        </div>
      </div>

      {error && <ImportErrorAlert error={error} />}

      {preview && (
        <div className="flex flex-col gap-5">
          <ImportPreviewView preview={preview} expectedKey={expectedKey} />

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" disabled={blocked || busy !== null} onClick={() => send(false)}>
              {busy === "apply" ? "Application…" : preview.campaign.action === "create" ? "Créer la campagne" : "Appliquer"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";

const ALLOWED_COVER_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_COVER_SIZE = 10 * 1024 * 1024; // 10 MB


interface Settings {
  captureDepartmentId: string | null;
  defaultCoverKey: string | null;
  sequenceTemplate: string[];
}

export default function AudioSettingsClient({
  settings,
  departments,
  coverPreviewUrl,
}: {
  settings: Settings;
  departments: { id: string; label: string }[];
  coverPreviewUrl: string | null;
}) {
  const [captureDepartmentId, setCaptureDepartmentId] = useState(settings.captureDepartmentId ?? "");
  const [defaultCoverKey, setDefaultCoverKey] = useState(settings.defaultCoverKey ?? "");
  const [coverPreview, setCoverPreview] = useState(coverPreviewUrl);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [templateText, setTemplateText] = useState(settings.sequenceTemplate.join("\n"));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCoverSelected(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setCoverError(null);

    if (!ALLOWED_COVER_MIME_TYPES.includes(file.type)) {
      setCoverError(`Type de fichier non supporté : ${file.type}`);
      return;
    }
    if (file.size > MAX_COVER_SIZE) {
      setCoverError(`Fichier trop lourd : ${Math.round(file.size / 1024 / 1024)}MB (max 10MB)`);
      return;
    }

    setUploadingCover(true);
    try {
      const signRes = await fetch("/api/audio/settings/cover/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, size: file.size }),
      });
      if (!signRes.ok) {
        const body = await signRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Échec de la signature d'upload");
      }
      const { key, url, previewUrl } = (await signRes.json()) as {
        key: string;
        url: string;
        previewUrl: string;
      };

      const putRes = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Échec de l'envoi du fichier");

      setDefaultCoverKey(key);
      setCoverPreview(previewUrl);
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setUploadingCover(false);
    }
  }

  function removeCover() {
    setDefaultCoverKey("");
    setCoverPreview(null);
    setCoverError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const sequenceTemplate = templateText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const res = await fetch("/api/audio/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          captureDepartmentId: captureDepartmentId || null,
          defaultCoverKey: defaultCoverKey.trim() || null,
          sequenceTemplate,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Échec de l'enregistrement");
      }
      setMessage("Paramètres enregistrés.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <Select
        label="Département de captation"
        value={captureDepartmentId}
        onChange={(e) => setCaptureDepartmentId(e.target.value)}
        placeholder="Aucun (module inactif)"
        options={departments.map((d) => ({ value: d.id, label: d.label }))}
      />
      <p className="text-xs text-gray-500 -mt-2">
        Tout membre de ce département peut déposer, nommer et publier les cultes audio, quel que soit son rôle.
      </p>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Couverture par défaut</label>
        {coverPreview && (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverPreview}
              alt="Couverture par défaut"
              className="w-20 h-20 object-cover rounded-lg border-2 border-gray-200"
            />
            <Button type="button" variant="danger" size="sm" onClick={removeCover}>
              Retirer
            </Button>
          </div>
        )}
        <input
          type="file"
          accept={ALLOWED_COVER_MIME_TYPES.join(",")}
          onChange={(e) => handleCoverSelected(e.target.files)}
          disabled={uploadingCover}
          className="block text-sm text-gray-600"
        />
        {uploadingCover && <p className="text-xs text-gray-500">Envoi en cours...</p>}
        {coverError && <p className="text-sm text-icc-rouge">{coverError}</p>}
        <p className="text-xs text-gray-500">
          Utilisée pour les cultes publiés sans couverture propre. JPEG, PNG ou WebP, 10MB max.
        </p>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          Template de noms de séquences (un par ligne)
        </label>
        <textarea
          value={templateText}
          onChange={(e) => setTemplateText(e.target.value)}
          rows={5}
          className="block w-full px-3 py-2.5 md:py-2 border-2 border-gray-300 rounded-lg shadow-sm text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
          placeholder={"Louange\nPrédication\nPrière"}
        />
      </div>

      {message && <p className="text-sm text-green-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button onClick={save} disabled={saving}>
        {saving ? "Enregistrement..." : "Enregistrer"}
      </Button>
    </div>
  );
}

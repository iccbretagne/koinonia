"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

export interface SourceSummary {
  id: string;
  durationMs: number | null;
  uploadStatus: string;
  filename: string;
  sizeBytes: number | null;
}

export interface SegmentSummary {
  id: string;
  sourceId: string | null;
  order: number;
  title: string;
}

interface Row {
  sourceId: string;
  title: string;
  discarded: boolean;
  durationMs: number | null;
  filename: string;
  sizeBytes: number | null;
  /** Dépôt non abouti : aucun objet S3 côté stockage, le rendu échouerait. */
  incomplete: boolean;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "…";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/** Titre marqué « non diffusé » — le segment est conservé côté données mais mis de côté. */
const DISCARDED_TITLE_SUFFIX = " (non diffusé)";

function rowFromSource(s: SourceSummary, seg: SegmentSummary | undefined): Row {
  const rawTitle = seg?.title ?? "";
  return {
    sourceId: s.id,
    title: rawTitle.endsWith(DISCARDED_TITLE_SUFFIX)
      ? rawTitle.slice(0, -DISCARDED_TITLE_SUFFIX.length)
      : rawTitle,
    discarded: rawTitle.endsWith(DISCARDED_TITLE_SUFFIX),
    durationMs: s.durationMs,
    filename: s.filename,
    sizeBytes: s.sizeBytes,
    incomplete: s.uploadStatus !== "DONE",
  };
}

function buildRows(sources: SourceSummary[], segments: SegmentSummary[]): Row[] {
  const bySource = new Map(segments.map((seg) => [seg.sourceId, seg]));
  const named = sources
    .filter((s) => bySource.has(s.id))
    .sort((a, b) => bySource.get(a.id)!.order - bySource.get(b.id)!.order);
  const unnamed = sources.filter((s) => !bySource.has(s.id));
  return [...named, ...unnamed].map((s) => rowFromSource(s, bySource.get(s.id)));
}

export default function SequenceListEditor({
  serviceId,
  sources,
  segments,
  templateNames,
}: {
  serviceId: string;
  sources: SourceSummary[];
  segments: SegmentSummary[];
  templateNames: string[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [rows, setRows] = useState<Row[]>(() => buildRows(sources, segments));
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // `rows` n'est initialisé qu'au montage — un nouveau dépôt (ou une suppression) après coup
  // ne se voit jamais sans ce resync, malgré le `router.refresh()` du composant parent (les
  // nouvelles props `sources`/`segments` arrivent bien, mais un `useState` initial les ignore).
  // On ajoute les nouvelles sources et met à jour la durée des existantes (remplie après coup
  // par le job PROBE) sans toucher au titre/à l'ordre déjà saisis par l'utilisateur.
  const sourcesKey = sources.map((s) => `${s.id}:${s.durationMs ?? ""}:${s.uploadStatus}`).join(",");
  useEffect(() => {
    setRows((prev) => {
      const sourceIds = new Set(sources.map((s) => s.id));
      const bySource = new Map(segments.map((seg) => [seg.sourceId, seg]));
      const stillPresent = prev
        .filter((r) => sourceIds.has(r.sourceId))
        .map((r) => {
          const s = sources.find((src) => src.id === r.sourceId)!;
          const incomplete = s.uploadStatus !== "DONE";
          return s.durationMs !== r.durationMs || incomplete !== r.incomplete
            ? { ...r, durationMs: s.durationMs, incomplete }
            : r;
        });
      const knownIds = new Set(prev.map((r) => r.sourceId));
      const added = sources.filter((s) => !knownIds.has(s.id)).map((s) => rowFromSource(s, bySource.get(s.id)));
      if (added.length === 0 && stillPresent.length === prev.length && stillPresent.every((r, i) => r === prev[i])) {
        return prev;
      }
      return [...stillPresent, ...added];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesKey]);

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function removeRow(sourceId: string) {
    if (!confirm("Supprimer cette séquence déposée ? Cette action est irréversible.")) return;
    setDeletingId(sourceId);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/audio/services/${serviceId}/sources/${sourceId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Échec de la suppression");
      }
      setRows((prev) => prev.filter((r) => r.sourceId !== sourceId));
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setDeletingId(null);
    }
  }

  function move(from: number, to: number) {
    setRows((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const sequences = rows
        .filter((r) => r.title.trim())
        .map((r, i) => ({
          sourceId: r.sourceId,
          order: i,
          title: r.discarded ? `${r.title.trim()}${DISCARDED_TITLE_SUFFIX}` : r.title.trim(),
        }));

      const res = await fetch(`/api/audio/services/${serviceId}/sequences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequences }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Échec de l'enregistrement");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">Aucune séquence déposée pour le moment.</p>;
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li
            key={row.sourceId}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null && dragIndex !== index) move(dragIndex, index);
              setDragIndex(null);
            }}
            className={`flex flex-wrap items-center gap-2 p-3 border-2 rounded-lg bg-white ${
              row.discarded ? "opacity-60 border-gray-200" : "border-gray-300"
            }`}
          >
            <span className="cursor-grab text-gray-400 select-none" title="Glisser pour réordonner">
              ⠿
            </span>
            <span className="w-8 text-center text-sm font-semibold text-gray-500">{index + 1}</span>
            <div className="flex-1 min-w-[220px] space-y-1">
              <p className="text-xs text-gray-500 truncate" title={row.filename}>
                {row.filename}
                {row.sizeBytes != null && <span> · {formatSize(row.sizeBytes)}</span>}
                {row.incomplete && (
                  <span className="text-icc-rouge font-medium">
                    {" "}
                    · dépôt non terminé — à supprimer et redéposer
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <div className="flex-1 min-w-[160px]">
                  <Select
                    label="Nom"
                    value={templateNames.includes(row.title) ? row.title : ""}
                    onChange={(e) => {
                      if (e.target.value) updateRow(index, { title: e.target.value });
                    }}
                    placeholder="Choisir un nom usuel…"
                    options={templateNames.map((n) => ({ value: n, label: n }))}
                  />
                </div>
                <div className="flex-1 min-w-[160px]">
                  <Input
                    label="Ou saisie libre"
                    value={row.title}
                    onChange={(e) => updateRow(index, { title: e.target.value })}
                    placeholder="Titre de la séquence"
                  />
                </div>
              </div>
            </div>
            <span className="text-sm text-gray-500 w-14 text-right">{formatDuration(row.durationMs)}</span>
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={row.discarded}
                onChange={(e) => updateRow(index, { discarded: e.target.checked })}
              />
              Non diffusé
            </label>
            <button
              type="button"
              onClick={() => removeRow(row.sourceId)}
              disabled={deletingId === row.sourceId}
              title="Supprimer cette séquence"
              className="text-icc-rouge hover:opacity-70 disabled:opacity-40 text-sm px-1"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <Button onClick={save} disabled={saving}>
        {saving ? "Enregistrement..." : "Enregistrer l'ordre et les noms"}
      </Button>
    </div>
  );
}

"use client";

import { ChevronLeft, ChevronRight, Download, FileText, X } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import type { CollectionConfig } from "@/modules/media";
import DownloadAllButton from "../../_components/DownloadAllButton";
import { Button } from "@/components/ui";
import IconButton from "@/components/ui/IconButton";

type Photo = {
  id: string;
  filename: string;
  size: number;
  width: number | null;
  height: number | null;
  thumbnailUrl: string;
};

type MediaFile = {
  id: string;
  filename: string;
  type: string;
  size: number;
  width: number | null;
  height: number | null;
  thumbnailUrl: string;
};

type PhotoGroup = {
  eventId: string;
  eventName: string;
  eventDate: string;
  photos: Photo[];
};

type FileGroup = {
  projectId: string;
  projectName: string;
  files: MediaFile[];
};

type CollectionData = {
  token: { id: string; label: string | null; config: CollectionConfig };
  photoGroups: PhotoGroup[];
  fileGroups: FileGroup[];
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

type LightboxItem = { kind: "photo"; item: Photo } | { kind: "file"; item: MediaFile };

function Lightbox({
  items,
  index,
  token,
  onClose,
  onPrev,
  onNext,
}: {
  readonly items: LightboxItem[];
  readonly index: number;
  readonly token: string;
  readonly onClose: () => void;
  readonly onPrev: () => void;
  readonly onNext: () => void;
}) {
  const current = items[index];
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function download() {
    setDownloading(true);
    try {
      const path =
        current.kind === "photo"
          ? `/api/media/collection/${token}/photo/${current.item.id}`
          : `/api/media/collection/${token}/file/${current.item.id}`;
      const res = await fetch(path);
      const json = await res.json();
      if (!res.ok || !json.downloadUrl) return;
      const a = document.createElement("a");
      a.href = json.downloadUrl;
      a.download = current.item.filename;
      a.click();
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-scrim/95 flex flex-col" role="none" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <IconButton variant="on-dark" icon={X} onClick={onClose} aria-label="Fermer la visionneuse" className="shrink-0" />
          <span className="text-on-brand/80 text-sm truncate">{current.item.filename}</span>
          {current.kind === "file" && (
            <span className="text-xs font-semibold text-on-brand bg-brand/60 rounded-full px-2 py-0.5 shrink-0">
              {current.item.type}
            </span>
          )}
        </div>
        <span className="text-on-brand/50 text-sm tabular-nums shrink-0">{index + 1}/{items.length}</span>
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center relative px-14 overflow-hidden">
        <IconButton variant="on-dark" icon={ChevronLeft} onClick={onPrev} disabled={index === 0} aria-label="Média précédent" className="absolute left-3 top-1/2 -translate-y-1/2 bg-scrim rounded-full z-10" />
        <IconButton variant="on-dark" icon={ChevronRight} onClick={onNext} disabled={index === items.length - 1} aria-label="Média suivant" className="absolute right-3 top-1/2 -translate-y-1/2 bg-scrim rounded-full z-10" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.item.thumbnailUrl}
          alt={current.item.filename}
          className="max-w-full max-h-[75vh] object-contain rounded-control shadow-overlay"
        />
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-end px-4 py-3 gap-3 shrink-0">
        <Button type="button" onClick={download} disabled={downloading}>
          {downloading ? (
            <span className="w-4 h-4 border-2 border-on-brand/30 border-t-on-brand rounded-full animate-spin" />
          ) : (
            <Download className="w-4 h-4" aria-hidden="true" />
          )}
          {downloading ? "Téléchargement en cours…" : "Télécharger le média"}
        </Button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function CollectionView({ token, data }: { readonly token: string; readonly data: CollectionData }) {
  const { photoGroups, fileGroups } = data;

  // Flat list for lightbox navigation
  const allItems: LightboxItem[] = [
    ...photoGroups.flatMap((g) => g.photos.map((p): LightboxItem => ({ kind: "photo", item: p }))),
    ...fileGroups.flatMap((g) => g.files.map((f): LightboxItem => ({ kind: "file", item: f }))),
  ];

  // Maps item.id → flat index
  const idxMap = new Map<string, number>();
  allItems.forEach((it, i) => idxMap.set(it.item.id, i));

  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [zipping, setZipping]         = useState(false);

  const closeLightbox = useCallback(() => setLightboxIdx(null), []);
  const prevItem = useCallback(() => setLightboxIdx((i) => i !== null ? Math.max(0, i - 1) : null), []);
  const nextItem = useCallback(() => setLightboxIdx((i) => i !== null ? Math.min(allItems.length - 1, i + 1) : null), [allItems.length]);

  const totalPhotos = photoGroups.reduce((n, g) => n + g.photos.length, 0);
  const totalFiles  = fileGroups.reduce((n, g) => n + g.files.length, 0);

  async function downloadZip() {
    setZipping(true);
    try {
      const res = await fetch(`/api/media/collection/${token}/zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "collection.zip";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }

  return (
    <>
      {lightboxIdx !== null && (
        <Lightbox
          items={allItems}
          index={lightboxIdx}
          token={token}
          onClose={closeLightbox}
          onPrev={prevItem}
          onNext={nextItem}
        />
      )}

      <div className="min-h-screen bg-bg">
        {/* Header */}
        <header className="bg-surface border-b border-line px-4 py-5">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-xl font-bold text-ink">
              {data.token.label ?? "Collection"}
            </h1>
            <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
              <p className="text-sm text-ink-muted">
                {totalPhotos > 0 && `${totalPhotos} photo${totalPhotos > 1 ? "s" : ""}`}
                {totalPhotos > 0 && totalFiles > 0 && " · "}
                {totalFiles > 0 && `${totalFiles} visuel${totalFiles > 1 ? "s" : ""}`}
              </p>
              {allItems.length > 0 && (
                <DownloadAllButton onClick={downloadZip} zipping={zipping} />
              )}
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto p-4 space-y-8">
          {allItems.length === 0 && (
            <p className="text-center text-ink-subtle py-16">Aucun contenu disponible.</p>
          )}

          {/* Photos grouped by event */}
          {photoGroups.map((group) => (
            group.photos.length > 0 && (
              <section key={group.eventId}>
                <div className="flex items-baseline gap-2 mb-3">
                  <h2 className="text-base font-semibold text-ink">{group.eventName}</h2>
                  <span className="text-xs text-ink-subtle">{formatDate(group.eventDate)}</span>
                  <span className="text-xs text-ink-subtle">· {group.photos.length} photo{group.photos.length > 1 ? "s" : ""}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {group.photos.map((photo) => (
                    <button
                      key={photo.id}
                      onClick={() => setLightboxIdx(idxMap.get(photo.id) ?? null)}
                      aria-label={`Agrandir ${photo.filename}`}
                      className="group aspect-square rounded-control overflow-hidden bg-surface-sunken hover:opacity-90 transition-opacity relative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.thumbnailUrl} alt={photo.filename} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                      <div className="absolute inset-0 bg-scrim/0 group-hover:bg-scrim/20 transition-colors" />
                    </button>
                  ))}
                </div>
              </section>
            )
          ))}

          {/* Files grouped by project */}
          {fileGroups.map((group) => (
            group.files.length > 0 && (
              <section key={group.projectId}>
                <div className="flex items-baseline gap-2 mb-3">
                  <h2 className="text-base font-semibold text-ink">{group.projectName}</h2>
                  <span className="text-xs text-ink-subtle">· {group.files.length} visuel{group.files.length > 1 ? "s" : ""}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {group.files.map((file) => {
                    const flatIdx = idxMap.get(file.id) ?? null;
                    return (
                      <div key={file.id} className="group rounded-control overflow-hidden border border-line bg-surface">
                        <button
                          onClick={() => setLightboxIdx(flatIdx)}
                          aria-label={`Agrandir ${file.filename}`}
                          className="w-full aspect-square bg-surface-sunken relative overflow-hidden block focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                        >
                          {file.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={file.thumbnailUrl} alt={file.filename} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-ink-subtle">
                              <FileText className="w-10 h-10" aria-hidden="true" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-scrim/0 group-hover:bg-scrim/20 transition-colors" />
                        </button>
                        <div className="p-2">
                          <p className="text-xs text-ink-muted truncate font-medium">{file.filename}</p>
                          <p className="text-xs text-ink-subtle">{formatSize(file.size)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )
          ))}
        </main>
      </div>
    </>
  );
}

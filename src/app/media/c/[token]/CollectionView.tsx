"use client";

import { useState, useCallback } from "react";
import type { CollectionConfig } from "@/modules/media";

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
  items: LightboxItem[];
  index: number;
  token: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const current = items[index];
  const [downloading, setDownloading] = useState(false);

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
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col" onClick={onClose}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <span className="text-white/80 text-sm truncate">{current.item.filename}</span>
          {current.kind === "file" && (
            <span className="text-xs text-icc-violet bg-icc-violet/20 rounded-full px-2 py-0.5 shrink-0">
              {current.item.type}
            </span>
          )}
        </div>
        <span className="text-white/50 text-sm tabular-nums shrink-0">{index + 1}/{items.length}</span>
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center relative px-14 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <button onClick={onPrev} disabled={index === 0} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-2.5 transition-all disabled:opacity-20 z-10">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button onClick={onNext} disabled={index === items.length - 1} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-2.5 transition-all disabled:opacity-20 z-10">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.item.thumbnailUrl}
          alt={current.item.filename}
          className="max-w-full max-h-[75vh] object-contain rounded shadow-2xl"
        />
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-end px-4 py-3 gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={download}
          disabled={downloading}
          className="flex items-center gap-1.5 text-sm bg-icc-violet text-white px-3 py-1.5 rounded-lg hover:bg-icc-violet/90 disabled:opacity-50 transition-colors font-medium"
        >
          {downloading ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          )}
          Télécharger
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function CollectionView({ token, data }: { token: string; data: CollectionData }) {
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

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-4 py-5">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-xl font-bold text-gray-900">
              {data.token.label ?? "Collection"}
            </h1>
            <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
              <p className="text-sm text-gray-500">
                {totalPhotos > 0 && `${totalPhotos} photo${totalPhotos !== 1 ? "s" : ""}`}
                {totalPhotos > 0 && totalFiles > 0 && " · "}
                {totalFiles > 0 && `${totalFiles} visuel${totalFiles !== 1 ? "s" : ""}`}
              </p>
              {allItems.length > 0 && (
                <button
                  onClick={downloadZip}
                  disabled={zipping}
                  className="flex items-center gap-1.5 text-sm bg-icc-violet text-white px-4 py-2 rounded-lg hover:bg-icc-violet/90 disabled:opacity-50 transition-colors font-medium"
                >
                  {zipping ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Préparation…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Tout télécharger (.zip)
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto p-4 space-y-8">
          {allItems.length === 0 && (
            <p className="text-center text-gray-400 py-16">Aucun contenu disponible.</p>
          )}

          {/* Photos grouped by event */}
          {photoGroups.map((group) => (
            group.photos.length > 0 && (
              <section key={group.eventId}>
                <div className="flex items-baseline gap-2 mb-3">
                  <h2 className="text-base font-semibold text-gray-800">{group.eventName}</h2>
                  <span className="text-xs text-gray-400">{formatDate(group.eventDate)}</span>
                  <span className="text-xs text-gray-400">· {group.photos.length} photo{group.photos.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {group.photos.map((photo) => (
                    <button
                      key={photo.id}
                      onClick={() => setLightboxIdx(idxMap.get(photo.id) ?? null)}
                      className="group aspect-square rounded-lg overflow-hidden bg-gray-100 hover:opacity-90 transition-opacity relative"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.thumbnailUrl} alt={photo.filename} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
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
                  <h2 className="text-base font-semibold text-gray-800">{group.projectName}</h2>
                  <span className="text-xs text-gray-400">· {group.files.length} visuel{group.files.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {group.files.map((file) => {
                    const flatIdx = idxMap.get(file.id) ?? null;
                    return (
                      <div key={file.id} className="group rounded-lg overflow-hidden border border-gray-200 bg-white">
                        <button
                          onClick={() => setLightboxIdx(flatIdx)}
                          className="w-full aspect-square bg-gray-100 relative overflow-hidden block"
                        >
                          {file.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={file.thumbnailUrl} alt={file.filename} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                        </button>
                        <div className="p-2">
                          <p className="text-xs text-gray-600 truncate font-medium">{file.filename}</p>
                          <p className="text-xs text-gray-400">{formatSize(file.size)}</p>
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

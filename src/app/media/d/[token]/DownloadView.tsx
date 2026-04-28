"use client";

import { useState } from "react";

type Photo = {
  id: string;
  filename: string;
  thumbnailUrl: string;
  size: number;
  width: number | null;
  height: number | null;
  status: string;
};

type DownloadData = {
  token: { id: string; type: string; label: string | null };
  event: { id: string; name: string; date: string; photoCount: number } | null;
  photos: Photo[];
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function DownloadView({
  token,
  data,
}: {
  token: string;
  data: DownloadData;
}) {
  const { event, photos } = data;
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zipping, setZipping] = useState(false);

  async function downloadZip(photoIds?: string[]) {
    setZipping(true);
    try {
      const res = await fetch(`/api/media/download/${token}/zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(photoIds?.length ? { photoIds } : {}),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "photos.zip";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }

  async function downloadPhoto(photoId: string, filename: string) {
    setDownloading((prev) => ({ ...prev, [photoId]: true }));
    try {
      const res = await fetch(`/api/media/download/${token}/photo/${photoId}`);
      const json = await res.json();
      if (!res.ok) return;
      // Trigger download
      const a = document.createElement("a");
      a.href = json.downloadUrl;
      a.download = filename;
      a.click();
    } finally {
      setDownloading((prev) => ({ ...prev, [photoId]: false }));
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalSize = photos.reduce((acc, p) => acc + p.size, 0);
  const selectedSize = photos
    .filter((p) => selected.has(p.id))
    .reduce((acc, p) => acc + p.size, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-5">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900">{event?.name ?? "Téléchargement"}</h1>
          {event && <p className="text-sm text-gray-500 mt-1">{formatDate(event.date)}</p>}
          {data.token.label && <p className="text-xs text-gray-400 mt-0.5">{data.token.label}</p>}
          <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
            <p className="text-sm text-gray-600">
              {photos.length} photo{photos.length !== 1 ? "s" : ""}
              {data.token.type === "MEDIA_ALL" && photos.some((p) => p.status !== "APPROVED") && (
                <span className="ml-1.5 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-full px-2 py-0.5">
                  dont {photos.filter((p) => p.status !== "APPROVED").length} non validée{photos.filter((p) => p.status !== "APPROVED").length > 1 ? "s" : ""}
                </span>
              )}
              {" · "}{formatSize(totalSize)}
            </p>
            {photos.length > 0 && (
              <button
                onClick={() => downloadZip()}
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

      <main className="max-w-4xl mx-auto p-4 space-y-4">
        {/* Select all */}
        {photos.length > 0 && (
          <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
            <input
              type="checkbox"
              checked={selected.size === photos.length}
              onChange={() => {
                if (selected.size === photos.length) setSelected(new Set());
                else setSelected(new Set(photos.map((p) => p.id)));
              }}
              className="w-4 h-4 rounded border-gray-300"
            />
            <span className="text-sm text-gray-600">
              {selected.size > 0
                ? `${selected.size} sélectionnée${selected.size > 1 ? "s" : ""} (${formatSize(selectedSize)})`
                : "Tout sélectionner"}
            </span>
            {selected.size > 0 && (
              <button
                onClick={() => downloadZip(Array.from(selected))}
                disabled={zipping}
                className="ml-auto flex items-center gap-1.5 text-sm bg-icc-violet text-white px-3 py-1.5 rounded-lg hover:bg-icc-violet/90 disabled:opacity-50 transition-colors font-medium"
              >
                {zipping ? "Préparation…" : `Télécharger (${selected.size})`}
              </button>
            )}
          </div>
        )}

        {photos.length === 0 ? (
          <p className="text-center text-gray-500 py-16">Aucune photo approuvée disponible.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className={`rounded-lg overflow-hidden border-2 bg-white transition-colors ${
                  selected.has(photo.id) ? "border-icc-violet" : "border-gray-200"
                }`}
              >
                <div
                  className="aspect-square bg-gray-100 cursor-pointer"
                  onClick={() => toggleSelect(photo.id)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.thumbnailUrl}
                    alt={photo.filename}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-1.5">
                            {photo.status !== "APPROVED" && (
                    <span className="inline-block text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-full px-1.5 py-0.5 mb-0.5">
                      Non validée
                    </span>
                  )}
                  <p className="text-xs text-gray-500 truncate">{photo.filename}</p>
                  <p className="text-xs text-gray-400">{formatSize(photo.size)}</p>
                  <button
                    onClick={() => downloadPhoto(photo.id, photo.filename)}
                    disabled={downloading[photo.id]}
                    className="mt-1 w-full text-xs bg-icc-violet text-white py-1 rounded hover:bg-icc-violet/90 disabled:opacity-50 transition-colors"
                  >
                    {downloading[photo.id] ? "…" : "Télécharger"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

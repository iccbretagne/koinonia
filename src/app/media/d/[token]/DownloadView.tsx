"use client";

import { useState } from "react";

type Photo = {
  id: string;
  filename: string;
  thumbnailUrl: string;
  size: number;
  width: number | null;
  height: number | null;
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
          <p className="text-sm text-gray-600 mt-2">
            {photos.length} photo{photos.length !== 1 ? "s" : ""} approuvée{photos.length !== 1 ? "s" : ""} · {formatSize(totalSize)}
          </p>
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
              <span className="text-xs text-gray-400 ml-auto">
                Téléchargement individuel uniquement
              </span>
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

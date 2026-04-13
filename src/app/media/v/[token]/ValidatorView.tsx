"use client";

import { useState } from "react";

type Photo = {
  id: string;
  filename: string;
  thumbnailUrl: string;
  status: string;
  size: number;
};

type ValidationData = {
  token: { id: string; type: string; label: string | null };
  event: {
    id: string;
    name: string;
    date: string;
    isPrevalidator: boolean;
    hasPrevalidator: boolean;
    photos: Photo[];
    stats: { total: number; pending: number; approved: number; rejected: number };
  } | null;
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "border-gray-300",
  APPROVED: "border-green-500",
  REJECTED: "border-red-500",
  PREVALIDATED: "border-blue-400",
  PREREJECTED: "border-orange-400",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  APPROVED: "Approuvée",
  REJECTED: "Rejetée",
  PREVALIDATED: "Pré-validée",
  PREREJECTED: "Pré-rejetée",
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export default function ValidatorView({
  token,
  data,
}: {
  token: string;
  data: ValidationData;
}) {
  const { event } = data;
  const isPrevalidator = data.token.type === "PREVALIDATOR";
  const approveStatus = isPrevalidator ? "PREVALIDATED" : "APPROVED";
  const rejectStatus = isPrevalidator ? "PREREJECTED" : "REJECTED";

  const [photos, setPhotos] = useState<Photo[]>(event?.photos ?? []);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  async function setPhotoStatus(photoId: string, status: string) {
    setLoading((prev) => ({ ...prev, [photoId]: true }));
    try {
      const res = await fetch(`/api/media/validate/${token}/photo/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setPhotos((prev) => prev.map((p) => p.id === photoId ? { ...p, status } : p));
      }
    } finally {
      setLoading((prev) => ({ ...prev, [photoId]: false }));
    }
  }

  async function bulkSetStatus(status: string) {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      await Promise.all(
        Array.from(selected).map((id) =>
          fetch(`/api/media/validate/${token}/photo/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          })
        )
      );
      setPhotos((prev) => prev.map((p) => selected.has(p.id) ? { ...p, status } : p));
      setSelected(new Set());
    } finally {
      setBulkLoading(false);
    }
  }

  const pendingPhotos = photos.filter((p) => p.status === "PENDING");

  if (!event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-gray-600">Aucun événement associé à ce lien.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900">{event.name}</h1>
          <p className="text-sm text-gray-500 mt-1">{formatDate(event.date)}</p>
          {data.token.label && <p className="text-xs text-gray-400 mt-0.5">{data.token.label}</p>}
          <div className="flex gap-4 mt-3 text-sm">
            <span>{photos.length} photo{photos.length !== 1 ? "s" : ""}</span>
            <span className="text-yellow-600">{pendingPhotos.length} en attente</span>
            <span className="text-green-600">
              {photos.filter((p) => p.status === approveStatus || p.status === "APPROVED").length} approuvée{photos.filter((p) => p.status === approveStatus || p.status === "APPROVED").length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-4">
        {/* Bulk actions */}
        {pendingPhotos.length > 0 && (
          <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
            <input
              type="checkbox"
              checked={selected.size === pendingPhotos.length && pendingPhotos.length > 0}
              onChange={() => {
                if (selected.size === pendingPhotos.length) setSelected(new Set());
                else setSelected(new Set(pendingPhotos.map((p) => p.id)));
              }}
              className="w-4 h-4 rounded border-gray-300"
            />
            <span className="text-sm text-gray-600">
              {selected.size > 0 ? `${selected.size} sélectionnée${selected.size > 1 ? "s" : ""}` : "Sélectionner tout"}
            </span>
            {selected.size > 0 && (
              <>
                <button
                  onClick={() => bulkSetStatus(approveStatus)}
                  disabled={bulkLoading}
                  className="text-sm bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  ✓ Approuver
                </button>
                <button
                  onClick={() => bulkSetStatus(rejectStatus)}
                  disabled={bulkLoading}
                  className="text-sm bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  ✗ Rejeter
                </button>
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map((photo) => {
            const isPending = photo.status === "PENDING";
            return (
              <div
                key={photo.id}
                className={`relative rounded-lg overflow-hidden border-2 ${STATUS_COLORS[photo.status] ?? "border-gray-300"} bg-white`}
              >
                {isPending && (
                  <input
                    type="checkbox"
                    checked={selected.has(photo.id)}
                    onChange={() => setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(photo.id)) next.delete(photo.id);
                      else next.add(photo.id);
                      return next;
                    })}
                    className="absolute top-2 left-2 z-10 w-4 h-4 rounded border-gray-300"
                  />
                )}
                <div className="aspect-square bg-gray-100 relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.thumbnailUrl}
                    alt={photo.filename}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-1.5">
                  <span className="text-xs text-gray-500">{STATUS_LABELS[photo.status] ?? photo.status}</span>
                  {isPending && (
                    <div className="flex gap-1 mt-1">
                      <button
                        onClick={() => setPhotoStatus(photo.id, approveStatus)}
                        disabled={loading[photo.id]}
                        className="flex-1 text-xs bg-green-600 text-white py-1 rounded hover:bg-green-700 disabled:opacity-50"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => setPhotoStatus(photo.id, rejectStatus)}
                        disabled={loading[photo.id]}
                        className="flex-1 text-xs bg-red-600 text-white py-1 rounded hover:bg-red-700 disabled:opacity-50"
                      >
                        ✗
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {photos.length === 0 && (
          <p className="text-center text-gray-500 py-12">Aucune photo à valider.</p>
        )}
      </main>
    </div>
  );
}

"use client";

import { useState } from "react";

type Photo = {
  id: string;
  filename: string;
  thumbnailUrl: string;
  status: string;
  width: number | null;
  height: number | null;
};

type GalleryData = {
  token: { id: string; type: string; label: string | null };
  event: { id: string; name: string; date: string; photoCount: number } | null;
  photos: Photo[];
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export default function GalleryView({ data }: { data: GalleryData }) {
  const [lightbox, setLightbox] = useState<Photo | null>(null);

  const { event, photos } = data;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="px-4 py-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold">{event?.name ?? "Galerie"}</h1>
        {event && <p className="text-gray-400 text-sm mt-1">{formatDate(event.date)}</p>}
        {data.token.label && <p className="text-gray-500 text-xs mt-0.5">{data.token.label}</p>}
        <p className="text-gray-400 text-sm mt-2">{photos.length} photo{photos.length !== 1 ? "s" : ""}</p>
      </header>

      <main className="max-w-5xl mx-auto px-4 pb-8">
        {photos.length === 0 ? (
          <p className="text-center text-gray-500 py-16">Aucune photo disponible.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {photos.map((photo) => (
              <button
                key={photo.id}
                onClick={() => setLightbox(photo)}
                className="aspect-square bg-gray-800 rounded-lg overflow-hidden hover:opacity-90 transition-opacity"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.thumbnailUrl}
                  alt={photo.filename}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-2xl hover:text-gray-300"
            onClick={() => setLightbox(null)}
          >
            ✕
          </button>
          <div className="max-w-3xl w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.thumbnailUrl}
              alt={lightbox.filename}
              className="w-full rounded-lg max-h-[80vh] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <p className="text-gray-400 text-sm text-center mt-2">{lightbox.filename}</p>
          </div>
        </div>
      )}
    </div>
  );
}

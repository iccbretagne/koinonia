"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";

interface Segment {
  id: string;
  title: string;
  order: number;
  durationMs: number;
}

interface Props {
  token: string;
  backHref: string | null;
  service: {
    title: string | null;
    serviceDate: string;
    speaker: string | null;
    coverUrl: string | null;
    segments: Segment[];
  };
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function positionKey(segmentId: string): string {
  return `audio-position:${segmentId}`;
}

export default function AudioPlayerClient({ token, backHref, service }: Props) {
  const [currentId, setCurrentId] = useState<string | null>(service.segments[0]?.id ?? null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playReported = useRef(new Set<string>());

  const current = service.segments.find((s) => s.id === currentId) ?? null;

  useEffect(() => {
    if (!current || !audioRef.current) return;
    try {
      const saved = localStorage.getItem(positionKey(current.id));
      if (saved) audioRef.current.currentTime = parseFloat(saved);
    } catch {
      // localStorage indisponible — la position ne sera pas restaurée
    }
  }, [current]);

  function handleTimeUpdate() {
    if (!current || !audioRef.current) return;
    try {
      localStorage.setItem(positionKey(current.id), String(audioRef.current.currentTime));
    } catch {
      // ignore
    }
  }

  function handlePlay() {
    if (!current || playReported.current.has(current.id)) return;
    playReported.current.add(current.id);
    fetch(`/api/audio/public/${token}/play`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segmentId: current.id }),
    }).catch(() => {
      // le compteur de lecture n'est pas critique — on n'affiche pas d'erreur à l'auditeur
    });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-4 md:p-8">
        {backHref && (
          <div className="mb-4">
            <Link href={backHref}>
              <Button variant="secondary" size="sm">
                ← Retour à l&apos;événement
              </Button>
            </Link>
          </div>
        )}

        <div className="flex items-center gap-4 mb-6">
          {service.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={service.coverUrl} alt="" className="w-20 h-20 rounded-lg object-cover shadow" />
          )}
          <div>
            <h1 className="text-xl font-bold text-gray-900">{service.title || "Enregistrement du culte"}</h1>
            <p className="text-sm text-gray-500">
              {new Date(service.serviceDate).toLocaleDateString("fr-FR")}
              {service.speaker && ` · ${service.speaker}`}
            </p>
          </div>
        </div>

        {current && (
          <div className="bg-white rounded-xl shadow p-4 mb-4 border-2 border-gray-100">
            <p className="font-medium text-gray-900 mb-2">{current.title}</p>
            <audio
              ref={audioRef}
              controls
              className="w-full"
              src={`/api/audio/public/${token}/stream/${current.id}`}
              onTimeUpdate={handleTimeUpdate}
              onPlay={handlePlay}
            />
          </div>
        )}

        <ul className="bg-white rounded-xl shadow divide-y divide-gray-100 border-2 border-gray-100 overflow-hidden">
          {service.segments.map((seg) => (
            <li key={seg.id}>
              <button
                onClick={() => setCurrentId(seg.id)}
                className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm hover:bg-gray-50 ${
                  seg.id === currentId ? "bg-icc-violet/5 font-medium text-icc-violet" : "text-gray-700"
                }`}
              >
                <span>
                  {seg.order + 1}. {seg.title}
                </span>
                <span className="text-gray-400">{formatDuration(seg.durationMs)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

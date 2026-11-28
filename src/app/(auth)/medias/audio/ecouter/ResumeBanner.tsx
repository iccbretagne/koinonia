"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { findMostRecentResume } from "@/lib/audio-progress";
import { paths } from "@/lib/paths";

interface ServiceRef {
  id: string;
  title: string | null;
  serviceDate: string;
  segmentIds: string[];
}

function formatPosition(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Bandeau « Reprendre l'écoute » (spec 021) — uniquement si la reprise disponible porte sur un
 * culte effectivement présent dans la liste affichée (jamais de reprise fantôme après filtrage).
 * `localStorage` n'existant que côté client, ce composant se résout après montage.
 */
export default function ResumeBanner({ services }: { readonly services: ServiceRef[] }) {
  const [resume, setResume] = useState<{ service: ServiceRef; position: number } | null>(null);

  useEffect(() => {
    const allSegmentIds = services.flatMap((s) => s.segmentIds);
    if (allSegmentIds.length === 0) return;

    const match = findMostRecentResume(allSegmentIds);
    if (!match) return;

    const service = services.find((s) => s.segmentIds.includes(match.segmentId));
    // La reprise vit dans localStorage, indisponible au rendu serveur : la lire pendant le
    // rendu provoquerait une divergence d'hydratation. L'effet est ici le patron correct, pas
    // un contournement.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (service) setResume({ service, position: match.position });
  }, [services]);

  if (!resume) return null;

  return (
    <Link
      href={paths.audio.ecouterService(resume.service.id)}
      className="flex min-h-11 items-center gap-3 bg-brand-soft text-brand-text rounded-card px-4 py-3 mb-4 hover:bg-brand/15 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <Play aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.75} />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold truncate">
          Reprendre l&apos;écoute — {resume.service.title || "Enregistrement du culte"}
        </span>
        <span className="block text-xs opacity-80">
          à {formatPosition(resume.position)} · {new Date(resume.service.serviceDate).toLocaleDateString("fr-FR")}
        </span>
      </span>
    </Link>
  );
}

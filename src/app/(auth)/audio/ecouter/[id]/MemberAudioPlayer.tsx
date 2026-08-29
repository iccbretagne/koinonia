"use client";

import { useState } from "react";
import AudioPlayer, { type AudioPlayerService } from "@/components/audio/AudioPlayer";
import { buildStreamUrl } from "./stream-url";

interface Props {
  serviceId: string;
  service: AudioPlayerService;
}

/**
 * Frontière client pour la fiche d'écoute (spec 021) — construit `streamUrl`/`onPlay`/`onShare`
 * à partir de l'ID du culte, seule donnée sérialisable transmise par le Server Component.
 */
export default function MemberAudioPlayer({ serviceId, service }: Props) {
  const [confirmation, setConfirmation] = useState<string | null>(null);

  async function share(segmentId: string | null) {
    try {
      const res = await fetch(`/api/audio/services/${serviceId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(segmentId ? { segmentId } : {}),
      });
      if (!res.ok) throw new Error();
      const { url } = (await res.json()) as { url: string };

      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: service.title ?? "Enregistrement du culte", url });
        return;
      }

      await navigator.clipboard.writeText(url);
      setConfirmation("Lien copié !");
      setTimeout(() => setConfirmation(null), 2500);
    } catch {
      setConfirmation("Impossible de partager ce lien.");
      setTimeout(() => setConfirmation(null), 2500);
    }
  }

  return (
    <div>
      {confirmation && (
        <div
          role="status"
          className="fixed top-4 inset-x-4 md:inset-x-auto md:right-4 md:left-auto z-30 bg-gray-900 text-white text-sm rounded-lg px-4 py-2 shadow-lg text-center"
        >
          {confirmation}
        </div>
      )}
      <AudioPlayer
        service={service}
        streamUrl={(segment) => buildStreamUrl(serviceId, segment)}
        onPlay={(segmentId) => {
          fetch(`/api/audio/services/${serviceId}/play`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ segmentId }),
          }).catch(() => {
            // le compteur de lecture n'est pas critique — on n'affiche pas d'erreur à l'auditeur
          });
        }}
        onShare={share}
        backHref="/audio/ecouter"
        backLabel="Retour à la bibliothèque"
      />
    </div>
  );
}

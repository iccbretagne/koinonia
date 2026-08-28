"use client";

import AudioPlayer, { type AudioPlayerService } from "@/components/audio/AudioPlayer";

interface Props {
  token: string;
  backHref: string | null;
  service: AudioPlayerService;
}

/**
 * Frontière client pour la page publique — un Server Component ne peut pas passer de fonctions
 * (`streamUrl`, `onPlay`) à un composant client ; ce wrapper les construit ici à partir du
 * `token`, seule donnée sérialisable nécessaire.
 */
export default function PublicAudioPlayer({ token, backHref, service }: Props) {
  return (
    <AudioPlayer
      service={service}
      streamUrl={(segmentId) => `/api/audio/public/${token}/stream/${segmentId}`}
      onPlay={(segmentId) => {
        fetch(`/api/audio/public/${token}/play`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segmentId }),
        }).catch(() => {
          // le compteur de lecture n'est pas critique — on n'affiche pas d'erreur à l'auditeur
        });
      }}
      backHref={backHref}
      backLabel="Retour à l'événement"
      // Pas de bouton Partager ici : la page est déjà atteinte via un lien de partage,
      // et l'expérience de la page publique doit rester strictement inchangée (spec 021).
    />
  );
}

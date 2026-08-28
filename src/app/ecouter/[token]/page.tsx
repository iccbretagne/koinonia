import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { resolvePublicAudioService, recordAudioServiceOpen } from "@/modules/audio";
import PublicAudioPlayer from "./PublicAudioPlayer";

interface Props {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const result = await resolvePublicAudioService(token);
  if (result.status !== "OK") {
    return { title: "Enregistrement audio" };
  }
  const { data } = result;
  const title = data.title || "Enregistrement du culte";
  const description = [data.speaker, new Date(data.serviceDate).toLocaleDateString("fr-FR")]
    .filter(Boolean)
    .join(" — ");

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: data.coverUrl ? [{ url: data.coverUrl }] : undefined,
    },
  };
}

export default async function PublicAudioPage({ params }: Props) {
  const { token } = await params;
  const result = await resolvePublicAudioService(token);

  if (result.status === "OK") {
    // Le token n'existe qu'une fois résolu avec succès — l'incrément se fait ici plutôt que
    // dans resolvePublicAudioService pour ne pas compter les résolutions de l'API interne
    // /api/audio/public/[token]/stream et .../play qui réutilisent la même fonction ailleurs.
    const { prisma } = await import("@/lib/prisma");
    const shareToken = await prisma.audioShareToken.findUnique({ where: { token }, select: { serviceId: true } });
    if (shareToken) await recordAudioServiceOpen(shareToken.serviceId);
  }

  // Lien retour vers l'événement uniquement pour un membre connecté (spec §1 — plan.md UI).
  const session = await auth();
  const backHref =
    result.status === "OK" && result.data.planningEventId && session?.user
      ? `/events/${result.data.planningEventId}/star-view`
      : null;

  if (result.status !== "OK") {
    const message =
      result.status === "NOT_FOUND"
        ? "Ce lien n'existe pas."
        : result.status === "REVOKED"
          ? "Ce lien a été révoqué."
          : "Ce culte n'est plus disponible.";
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <p className="text-gray-600 text-center max-w-sm">{message}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-4 md:p-8">
        <PublicAudioPlayer
          token={token}
          backHref={backHref}
          service={{
            title: result.data.title,
            serviceDate: result.data.serviceDate.toISOString(),
            speaker: result.data.speaker,
            coverUrl: result.data.coverUrl,
            segments: result.data.segments,
          }}
        />
      </div>
    </div>
  );
}

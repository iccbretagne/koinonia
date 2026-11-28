"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui";
import ForbiddenNotice from "@/components/ForbiddenNotice";

const MESSAGES: Record<string, { title: string; body: string }> = {
  UNAUTHORIZED: {
    title: "Session expirée",
    body: "Votre session a expiré ou n'est plus valide. Reconnectez-vous pour continuer.",
  },
};

export default function AuthError({ error }: { readonly error: Error & { digest?: string } }) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  // Refus qui n'est pas passé par `forbidden()` (garde hors `forbiddenError`) : même message
  // que `forbidden.tsx`, pour qu'un refus n'ait qu'un seul visage.
  if (error.message === "FORBIDDEN") return <ForbiddenNotice />;

  const known = MESSAGES[error.message];

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-card border border-line bg-surface p-8 text-center shadow-card">
        <div className="mb-2 grid size-14 place-items-center rounded-full bg-danger-soft text-danger">
          <TriangleAlert aria-hidden="true" className="size-6" strokeWidth={1.75} />
        </div>
        <h1 className="font-display text-[22px] font-bold leading-7 text-balance text-ink">
          {known?.title ?? "Une erreur est survenue"}
        </h1>
        <p className="text-[15px] leading-[22px] text-ink-muted">
          {known?.body ?? "Impossible d'afficher cette page. Réessayez ou revenez à l'accueil."}
        </p>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center sm:gap-3">
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Revenir à la page précédente
          </Button>
          {/* La racine redirige vers l'accueil du rôle (un STAR n'a pas accès à /dashboard). */}
          <Link href="/" className={buttonClasses("primary")}>
            Aller à l&apos;accueil
          </Link>
        </div>
      </div>
    </div>
  );
}

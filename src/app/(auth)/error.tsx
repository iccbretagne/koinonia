"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const MESSAGES: Record<string, { title: string; body: string }> = {
  FORBIDDEN: {
    title: "Accès refusé",
    body: "Vous n'avez pas les droits nécessaires pour accéder à cette page.",
  },
  UNAUTHORIZED: {
    title: "Session expirée",
    body: "Votre session a expiré ou n'est plus valide. Reconnectez-vous pour continuer.",
  },
};

export default function AuthError({ error }: { error: Error & { digest?: string } }) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  const known = MESSAGES[error.message];

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg border-2 border-gray-200 p-8 text-center">
        <div className="w-16 h-16 bg-icc-rouge/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-icc-rouge" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          {known?.title ?? "Une erreur est survenue"}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          {known?.body ?? "Impossible d'afficher cette page. Réessayez ou revenez à l'accueil."}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => router.back()}
            className="px-4 py-2 text-sm font-medium rounded-lg border-2 border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            Page précédente
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-icc-violet text-white hover:bg-icc-violet/90"
          >
            Accueil
          </button>
        </div>
      </div>
    </div>
  );
}

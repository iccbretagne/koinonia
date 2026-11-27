import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { buttonClasses } from "@/components/ui/button-classes";

/**
 * Message unique d'une page refusée (HTTP 403) : `forbidden.tsx` racine (refus décidé avant le
 * flux, page entière), `(auth)/forbidden.tsx` (refus dans la coquille) et `(auth)/error.tsx`.
 * Ne dit rien de la page demandée ni de son contenu ; une adresse inconnue reste un 404.
 * Composant sans état ni hook : utilisable côté serveur comme dans `error.tsx` (client).
 */
export default function ForbiddenNotice({ fullPage = false }: { readonly fullPage?: boolean }) {
  return (
    <div className={fullPage ? "flex min-h-screen items-center justify-center bg-bg p-4" : "flex min-h-[60vh] items-center justify-center py-4"}>
      <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-card border border-line bg-surface p-6 text-center shadow-card sm:p-8">
        <div className="mb-2 grid size-14 place-items-center rounded-full bg-warning-soft text-warning">
          <ShieldOff aria-hidden="true" className="size-6" strokeWidth={1.75} />
        </div>
        <h1 className="font-display text-[22px] font-bold leading-7 text-balance text-ink">Accès refusé</h1>
        <p className="text-[15px] leading-[22px] text-ink-muted">
          Votre rôle dans cette église ne donne pas accès à cette page.
        </p>
        <p className="text-sm leading-5 text-ink-subtle">
          Si vous servez aussi dans une autre église, choisissez-la avec le sélecteur d&apos;église
          du menu. En cas de besoin, adressez-vous à l&apos;administration de votre église.
        </p>
        {/* La racine redirige vers l'accueil du rôle (un STAR n'a pas accès à tous les espaces). */}
        <Link href="/" className={`${buttonClasses("primary")} mt-4`}>
          Revenir à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";
import { SearchX } from "lucide-react";
import { buttonClasses } from "@/components/ui/button-classes";

/**
 * Page 404 globale. Sert aussi bien une adresse qui n'a jamais existé qu'une adresse d'un
 * module désactivé sur cette instance (spec 038) — rien ne les distingue, c'est voulu :
 * « accès refusé » révèlerait l'existence de la fonctionnalité, « introuvable » ne dit rien
 * de plus que la vérité sur une instance qui ne porte pas le module.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-card border border-line bg-surface p-8 text-center shadow-card">
        <div className="mb-2 grid size-14 place-items-center rounded-full bg-brand-soft text-brand-text">
          <SearchX aria-hidden="true" className="size-6" strokeWidth={1.75} />
        </div>
        <h1 className="font-display text-[22px] font-bold leading-7 text-balance text-ink">Page introuvable</h1>
        <p className="text-[15px] leading-[22px] text-ink-muted">
          Cette adresse n&apos;existe pas ou n&apos;est pas disponible sur cette instance.
        </p>
        <Link href="/" className={`${buttonClasses("primary")} mt-4`}>
          Revenir à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}

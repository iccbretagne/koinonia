import Link from "next/link";

/**
 * Page 404 globale. Sert aussi bien une adresse qui n'a jamais existé qu'une adresse d'un
 * module désactivé sur cette instance (spec 038) — rien ne les distingue, c'est voulu :
 * « accès refusé » révèlerait l'existence de la fonctionnalité, « introuvable » ne dit rien
 * de plus que la vérité sur une instance qui ne porte pas le module.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface-sunken flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-surface rounded-lg border border-line p-8 text-center">
        <div className="w-16 h-16 bg-brand-soft rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🔍</span>
        </div>
        <h1 className="text-xl font-bold text-ink mb-2">Page introuvable</h1>
        <p className="text-sm text-ink-muted mb-6">
          Cette adresse n&apos;existe pas ou n&apos;est pas disponible sur cette instance.
        </p>
        <Link
          href="/"
          className="inline-block border border-brand text-brand-text rounded-lg px-4 py-2 text-sm font-medium hover:bg-brand-hover hover:text-on-brand transition-colors"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}

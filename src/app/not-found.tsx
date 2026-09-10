import Link from "next/link";

/**
 * Page 404 globale. Sert aussi bien une adresse qui n'a jamais existé qu'une adresse d'un
 * module désactivé sur cette instance (spec 038) — rien ne les distingue, c'est voulu :
 * « accès refusé » révèlerait l'existence de la fonctionnalité, « introuvable » ne dit rien
 * de plus que la vérité sur une instance qui ne porte pas le module.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg border-2 border-gray-200 p-8 text-center">
        <div className="w-16 h-16 bg-icc-violet/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🔍</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Page introuvable</h1>
        <p className="text-sm text-gray-500 mb-6">
          Cette adresse n&apos;existe pas ou n&apos;est pas disponible sur cette instance.
        </p>
        <Link
          href="/"
          className="inline-block border-2 border-icc-violet text-icc-violet rounded-lg px-4 py-2 text-sm font-medium hover:bg-icc-violet hover:text-white transition-colors"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}

import ForbiddenNotice from "@/components/ForbiddenNotice";

/**
 * Refus rendu dans la coquille (navigation, barre latérale) quand une page appelle `forbidden()`
 * — ou qu'une garde (`requireChurchPermission`…) refuse — après le début du flux : derrière un
 * `loading.tsx`, Next.js a déjà envoyé l'en-tête et le statut reste 200, avec le même message
 * que le 403 de `src/app/forbidden.tsx`.
 */
export default function Forbidden() {
  return <ForbiddenNotice />;
}

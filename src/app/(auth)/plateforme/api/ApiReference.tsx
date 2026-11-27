"use client";

import dynamic from "next/dynamic";
import "swagger-ui-react/swagger-ui.css";

// Swagger UI lit `window` au chargement : rendu côté client uniquement.
const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

/**
 * Swagger UI, toujours en clair (ses styles n'ont pas de thème sombre). « Try it out » appelle
 * l'API de la même origine avec la session courante : à manier comme l'application elle-même.
 */
export default function ApiReference({ spec }: { readonly spec: object }) {
  // Lecture seule : aucune requête envoyée depuis la page de référence (pas de « Try it out »).
  return (
    // eslint-disable-next-line no-restricted-syntax -- Swagger UI n'a pas de thème sombre : fond clair forcé
    <div className="overflow-x-auto rounded-card border border-line bg-white [color-scheme:light]">
      <SwaggerUI spec={spec} docExpansion="none" defaultModelsExpandDepth={0} supportedSubmitMethods={[]} />
    </div>
  );
}

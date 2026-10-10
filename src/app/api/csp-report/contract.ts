import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "Collecte des violations de la politique CSP",
    description: "Appelée par le navigateur (formats `report-uri` et Reporting API, ADR-0022). Les violations sont journalisées sans query ni stockage ; les corps illisibles sont ignorés. Limitée à 30 requêtes par minute et par IP (429) et à 16 Ko (413).",
    access: "public",
    body: { contentType: "application/csp-report", description: "Rapport de violation CSP : objet `{ \"csp-report\": {...} }` ou tableau Reporting API `[{ type: \"csp-violation\", body }]` (20 violations au plus traitées)." },
    status: 204,
    response: "Aucun contenu",
  },
});

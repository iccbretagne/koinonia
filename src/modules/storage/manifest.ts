import { defineModule } from "@/core/module-registry";

/**
 * Module storage — primitifs de stockage S3 et de jeton, extraits de `media` (ADR-0006).
 *
 * Périmètre :
 *   - Client S3 (upload simple, multipart avec reprise, URLs signées)
 *   - Génération/validation de jetons opaques (liens sans authentification)
 *
 * N'a pas de modèle Prisma propre : les modules consommateurs (`media`, `audio`) portent
 * leurs propres tables et n'utilisent ce module que pour ces primitifs transverses.
 *
 * Dépendances : aucune (infrastructure pure)
 */
export const storageModule = defineModule({
  name: "storage",
  version: "1.0.0",
  dependsOn: [],
  // Aucune surface HTTP propre : storage n'expose ni page ni route API, seulement des
  // primitifs consommés par media et audio. Volontairement omis (et non `routes: {}` —
  // le champ absent et le champ vide se valent pour le test d'exhaustivité).
});

import { defineContract } from "@/lib/openapi/contract";
import { appIconDeleteSchema } from "@/modules/core/schemas";

export const deleteSchema = appIconDeleteSchema;

export const contract = defineContract({
  GET: {
    summary: "Icône de l'application en vigueur",
    description:
      "Réglage de plateforme (spec 069), une icône pour toute l'instance. Indique si l'icône est celle livrée avec Koinonia ou une icône déposée, sa version, sa couleur de fond, la présence d'une silhouette de badge et les 20 derniers changements (journal `AppIcon`).",
    access: "superAdmin",
    response: "`{ custom, version, background, hasBadge, updatedAt, updatedBy, history[] }`",
  },
  PUT: {
    summary: "Dépôt ou remplacement de l'icône de l'application et/ou de sa silhouette de badge",
    description:
      "Au moins un fichier. Icône : PNG, JPEG ou WebP carré (2 % de tolérance), 512 px au moins, 5 Mo au plus ; le format décodé fait foi (SVG, GIF refusés). `background` (#rrggbb) remplit les coins clairs ou transparents, obligatoire avec une icône. Silhouette : PNG ou WebP avec transparence, rendue en blanc ; exige une icône déposée. Le fichier n'est jamais servi tel quel : seules les variantes préparées sont enregistrées, dans une transaction (l'icône en vigueur ne change pas en cas de refus). 411 sans Content-Length, 413 au-delà de 11 Mo. Journalisé.",
    access: "superAdmin",
    body: {
      contentType: "multipart/form-data",
      description: "`icon` (image, facultatif), `background` (#rrggbb, requis avec `icon`), `badge` (image, facultatif)",
    },
    response: "État à jour (comme GET)",
  },
  DELETE: {
    summary: "Retour à l'icône par défaut, ou retrait de la seule silhouette",
    description:
      "`icon` : toutes les variantes déposées sont retirées, l'icône livrée avec Koinonia s'applique. `badge` : la cloche générique remplace la silhouette. Journalisé si quelque chose a été retiré.",
    access: "superAdmin",
    body: deleteSchema,
    response: "État à jour (comme GET)",
  },
});

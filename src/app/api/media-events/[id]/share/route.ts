import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { mediaShareHandlers } from "../../../_media-share/handlers";

const handlers = mediaShareHandlers({
  resource: "mediaEvent",
  domain: "PHOTOS",
  // L'équipe Photos voit aussi les tokens sensibles
  teamSeesSensitive: true,
  async beforeCreate(id, type) {
    // Rule: only one PREVALIDATOR per event
    if (type === "PREVALIDATOR") {
      const existing = await prisma.mediaShareToken.count({
        where: { mediaEventId: id, type: "PREVALIDATOR" },
      });
      if (existing > 0) {
        throw new ApiError(409, "Un lien de prévalidation existe déjà pour cet événement");
      }
    }

    // Rule: block VALIDATOR/MEDIA if prevalidation active and pending photos remain
    if (type === "VALIDATOR" || type === "MEDIA") {
      const hasPrevalidator = await prisma.mediaShareToken.count({
        where: { mediaEventId: id, type: "PREVALIDATOR" },
      });
      if (hasPrevalidator > 0) {
        const pendingCount = await prisma.mediaPhoto.count({
          where: { mediaEventId: id, status: "PENDING" },
        });
        if (pendingCount > 0) {
          throw new ApiError(
            409,
            `La prévalidation est en cours (${pendingCount} photo(s) restante(s)). Terminez la prévalidation avant de créer un lien de validation.`
          );
        }
      }
    }
  },
});

export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;

import { mediaShareHandlers } from "../../../_media-share/handlers";

const handlers = mediaShareHandlers({
  resource: "mediaProject",
  domain: "VISUELS",
  // Seul media:manage voit les tokens sensibles d'un projet
  teamSeesSensitive: false,
});

export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;

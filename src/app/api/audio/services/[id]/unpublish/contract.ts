import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "Dépublication d'un culte audio",
    description: "Les liens publics existants cessent de fonctionner. Journalisé.",
    access: "audio:manage",
    accessNote: "`audio:manage`, ou responsable/ministre d'un département de captation audio (`requireAudioUnpublishAccess`)",
    response: "Culte dépublié",
  },
});

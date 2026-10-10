import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const schema = z.object({ churchId: z.string().min(1) });

export const contract = defineContract({
  POST: {
    summary: "Attribution en masse du rôle STAR",
    description: "Donne le rôle STAR aux comptes liés à une fiche STAR qui ne l'ont pas, dans le périmètre de l'appelant (spec 054).",
    access: "access:manage",
    body: schema,
    response: "`{ assigned, total }` : rôles attribués et comptes liés examinés",
  },
});

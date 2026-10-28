import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Fiches STAR qui pourraient correspondre",
    description:
      "Spec 073. Fiches STAR de l'église portant les mêmes prénom et nom que la candidature, ou la même adresse email, pour rattacher la candidature plutôt que créer un doublon à l'accueil. Identité et départements seulement.",
    access: "session",
    accessNote: "équipe PVS, `serving:manage` ou Super Admin, dans l'église de la candidature",
    response: "Liste `{ id, firstName, lastName, email, departmentNames, reason }`",
  },
});

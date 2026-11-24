import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
export const formatSchema = z.enum(["png", "pdf"]);
export const contract = defineContract({ GET: { summary: "Visuel nominatif du billet (PNG ou PDF)", access: "token", accessNote: "jeton secret du billet actif", description: "format=png (défaut) ou pdf ; download=1 pour télécharger. Visuel publié courant uniquement, 404 si billet annulé/absent ou sans publication. Aucun cache ; 30 rendus/minute/IP.", response: "PNG ou PDF", responseType: "application/octet-stream" } });

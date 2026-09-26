import { CircleCheck, CircleX, MessageSquare, Repeat, type LucideIcon } from "lucide-react";
import type { ServiceStatus } from "@/generated/prisma/client";
import type { StatusTone } from "./StatusChip";

export interface StatusDescriptor {
  readonly tone: StatusTone;
  readonly icon: LucideIcon;
  readonly label: string;
}

/**
 * Correspondance des statuts de service (docs/design-system/README.md, section Couleur) : une
 * seule source pour la pastille, la grille de planning et les vues mensuelles/hebdomadaires. Le
 * vert `success` est tiré vers le bleu pour rester distinct de `danger` pour un daltonien ; le
 * mot reste de toute façon affiché.
 */
export const SERVICE_STATUS: Readonly<Record<ServiceStatus, StatusDescriptor>> = {
  EN_SERVICE: { tone: "success", icon: CircleCheck, label: "En service" },
  EN_SERVICE_DEBRIEF: { tone: "brand", icon: MessageSquare, label: "En service + Debrief" },
  INDISPONIBLE: { tone: "danger", icon: CircleX, label: "Indisponible" },
  REMPLACANT: { tone: "info", icon: Repeat, label: "Remplaçant" },
};

/** Ordre d'affichage des statuts (légendes, contrôle segmenté, décomptes). */
export const SERVICE_STATUS_ORDER: readonly ServiceStatus[] = [
  "EN_SERVICE",
  "EN_SERVICE_DEBRIEF",
  "INDISPONIBLE",
  "REMPLACANT",
];

export function isServiceStatus(value: unknown): value is ServiceStatus {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SERVICE_STATUS, value);
}

/** Descripteur d'un statut reçu de l'API, ou `null` si le STAR n'a pas de statut (non planifié). */
export function serviceStatusDescriptor(status: string | null | undefined): StatusDescriptor | null {
  return isServiceStatus(status) ? SERVICE_STATUS[status] : null;
}

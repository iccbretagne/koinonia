/**
 * Projection des demandes d'intégration en lignes de tableur.
 *
 * Fonction **pure** : aucun accès BDD, aucune I/O. Elle porte les 18 colonnes de l'export
 * (spec 033), les libellés français (jamais de code interne dans le fichier), la règle
 * « étape non atteinte → cellule vide » et l'exclusion des champs sensibles (notes
 * internes, motif d'abandon). L'adresse postale figure au fichier quand elle a été
 * renseignée — cellule vide sinon.
 */

/** En-têtes de l'export, dans l'ordre imposé par la spec. */
export const EXPORT_COLUMNS = [
  "Nom",
  "Prénom",
  "Téléphone",
  "Email",
  "Adresse",
  "Ville",
  "Tranche d'âge",
  "Statut dans l'église",
  "Appel au salut",
  "Soin pastoral demandé",
  "Famille assignée",
  "Berger assigné",
  "Statut de la demande",
  "Date de soumission",
  "Date d'assignation",
  "Date de contact",
  "Date d'ajout WhatsApp",
  "Date d'intégration",
] as const;

const AGE_RANGE_LABELS: Record<string, string> = {
  YOUTH: "Jeune (−18 ans)",
  YOUNG_ADULT: "Jeune adulte (18–30 ans)",
  ADULT: "Adulte (30–60 ans)",
  SENIOR: "Senior (60+ ans)",
};

const CHURCH_STATUS_LABELS: Record<string, string> = {
  VISITOR: "Visiteur",
  REGULAR: "Régulier",
  ENGAGED: "Engagé",
};

const REQUEST_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "En attente",
  ASSIGNED: "Assigné",
  CONTACTED: "Contacté",
  WHATSAPP_ADDED: "WhatsApp ajouté",
  INTEGRATED: "Intégré",
  ABANDONED: "Abandonné",
};

/** Forme d'entrée : le sous-ensemble de `FamilyIntegrationRequest` que l'export exploite. */
export interface IntegrationExportInput {
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  ageRange: string;
  churchStatus: string;
  salvationCall: boolean;
  pastoralCareRequested: boolean;
  assignedFamilyName: string | null;
  assignedBerger: { name: string | null; displayName: string | null } | null;
  status: string;
  submittedAt: Date;
  assignedAt: Date | null;
  contactedAt: Date | null;
  whatsappAddedAt: Date | null;
  integratedAt: Date | null;
}

function frDate(d: Date | null): string {
  return d ? d.toLocaleDateString("fr-FR") : "";
}

function yesNo(v: boolean): string {
  return v ? "Oui" : "Non";
}

/** Une ligne par demande ; les clés sont les en-têtes de `EXPORT_COLUMNS`. */
export function buildIntegrationExportRows(
  requests: IntegrationExportInput[]
): Record<string, string>[] {
  return requests.map((r) => ({
    Nom: r.lastName,
    Prénom: r.firstName,
    Téléphone: r.phone ?? "",
    Email: r.email ?? "",
    Adresse: r.address ?? "",
    Ville: r.city ?? "",
    "Tranche d'âge": AGE_RANGE_LABELS[r.ageRange] ?? r.ageRange,
    "Statut dans l'église": CHURCH_STATUS_LABELS[r.churchStatus] ?? r.churchStatus,
    "Appel au salut": yesNo(r.salvationCall),
    "Soin pastoral demandé": yesNo(r.pastoralCareRequested),
    "Famille assignée": r.assignedFamilyName ?? "",
    "Berger assigné": r.assignedBerger?.displayName ?? r.assignedBerger?.name ?? "",
    "Statut de la demande": REQUEST_STATUS_LABELS[r.status] ?? r.status,
    "Date de soumission": frDate(r.submittedAt),
    "Date d'assignation": frDate(r.assignedAt),
    "Date de contact": frDate(r.contactedAt),
    "Date d'ajout WhatsApp": frDate(r.whatsappAddedAt),
    "Date d'intégration": frDate(r.integratedAt),
  }));
}

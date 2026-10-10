/**
 * Règles d'affichage de l'espace Offres (spec 064) : onglets, pastilles, recherche, états.
 *
 * Module **pur** (seuls des imports de types côté module) : même arbitrage que
 * `whatsapp-recap.ts`, l'index de `@/modules/jobs` réexportant des services Prisma qu'un
 * composant client ne doit pas embarquer.
 */
import type { Publication, PublicationKind, PublicationState } from "@/modules/jobs";
import { daysUntil, normalizeText } from "@/lib/paris-days";

export type BoardTab = "opportunites" | "profils";
export type TypeChip = "EMPLOI" | "STAGE" | "ALTERNANCE" | "MISSION" | "FREELANCE";
export type StateFilter = "active" | "inactive" | "all";

export const TAB_LABEL: Record<BoardTab, string> = {
  opportunites: "Opportunités",
  profils: "Profils disponibles",
};

export const TAB_KINDS: Record<BoardTab, readonly PublicationKind[]> = {
  opportunites: ["OFFER", "MISSION"],
  profils: ["SEEKER", "FREELANCE"],
};

export const TAB_CHIPS: Record<BoardTab, readonly TypeChip[]> = {
  opportunites: ["EMPLOI", "STAGE", "ALTERNANCE", "MISSION"],
  profils: ["EMPLOI", "STAGE", "ALTERNANCE", "FREELANCE"],
};

export const CHIP_LABEL: Record<TypeChip, string> = {
  EMPLOI: "Emploi",
  STAGE: "Stage",
  ALTERNANCE: "Alternance",
  MISSION: "Mission",
  FREELANCE: "Freelance",
};

export function tabOf(kind: PublicationKind): BoardTab {
  return kind === "OFFER" || kind === "MISSION" ? "opportunites" : "profils";
}

/**
 * Onglet et pastilles à l'ouverture, d'après l'adresse. Les anciens onglets restent valides :
 * « En recherche » ouvre les profils, « Freelance » les opportunités filtrées sur les missions.
 */
export function resolveInitialView(tab: string | undefined): { tab: BoardTab; chips: TypeChip[] } {
  if (tab === "profils" || tab === "seekers") return { tab: "profils", chips: [] };
  if (tab === "freelance") return { tab: "opportunites", chips: ["MISSION"] };
  return { tab: "opportunites", chips: [] };
}

/** Pastilles de type d'une publication. */
export function chipsOf(pub: Publication): TypeChip[] {
  if (pub.kind === "MISSION") return ["MISSION"];
  if (pub.kind === "FREELANCE") return ["FREELANCE"];
  return [...pub.contractTypes];
}

/** Aucune pastille active = tous les types ; sinon l'un des types de la publication suffit. */
export function matchesTypes(pub: Publication, active: readonly TypeChip[]): boolean {
  if (active.length === 0) return true;
  return chipsOf(pub).some((chip) => active.includes(chip));
}

/** Recherche sans accents ni casse : titre, entreprise ou domaine, lieu, description. */
export function matchesQuery(pub: Publication, query: string): boolean {
  const q = normalizeText(query.trim());
  if (!q) return true;
  return [pub.title, pub.organization, pub.location, pub.description]
    .filter((value): value is string => !!value)
    .some((value) => normalizeText(value).includes(q));
}

/**
 * Hors « Mes publications », un non-modérateur ne voit que l'actif ; « Mes publications » montre
 * tout ce que l'on a publié ; un modérateur choisit l'état.
 */
export function matchesState(
  pub: Publication,
  filter: StateFilter,
  { canManage, mine }: { canManage: boolean; mine: boolean }
): boolean {
  if (mine && !pub.isOwn) return false;
  if (!canManage) return mine || pub.state === "active";
  return filter === "all" || (filter === "active") === (pub.state === "active");
}

export const STATE_LABEL: Record<Exclude<PublicationState, "active">, string> = {
  retired: "Retirée",
  expired: "Expirée",
  filled: "Pourvue",
  found: "A trouvé",
  unavailable: "Indisponible",
};

export const STATE_TONE: Record<Exclude<PublicationState, "active">, "neutral" | "warning" | "success"> = {
  retired: "neutral",
  expired: "warning",
  filled: "success",
  found: "success",
  unavailable: "neutral",
};

export const KIND_LABEL: Record<PublicationKind, string> = {
  OFFER: "Offre",
  MISSION: "Mission",
  SEEKER: "En recherche",
  FREELANCE: "Freelance",
};

/** Libellé de type affiché sur une carte : le contrat d'une offre, sinon la sorte de publication. */
export function typeLabel(pub: Publication): string {
  if (pub.kind === "OFFER" && pub.contractTypes[0]) return CHIP_LABEL[pub.contractTypes[0]];
  return KIND_LABEL[pub.kind];
}

/** Échéance relative d'une offre (« Expire dans 5 j »), et `soon` à moins de 7 jours. */
export function expiryLabel(deadline: string | null, now: Date): { label: string; soon: boolean } | null {
  if (!deadline) return null;
  const days = daysUntil(deadline, now);
  if (days === null) return null;
  if (days < 0) return { label: "Expirée", soon: true };
  const label = days === 0 ? "Expire aujourd'hui" : days === 1 ? "Expire demain" : `Expire dans ${days} j`;
  return { label, soon: days < 7 };
}

/** Tarif journalier et horaire (« 400 €/j · 50 €/h ») ; `null` sans tarif. */
export function rateLabel(daily: string | null, hourly: string | null): string | null {
  const parts = [daily && `${daily}/j`, hourly && `${hourly}/h`].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export const MODALITY_LABEL: Record<string, string> = {
  REMOTE: "Full remote",
  ONSITE: "Présentiel",
  HYBRID: "Hybride",
};

/**
 * Repère « Nouveau » : opportunité active d'autrui parue après `lastSeenAt`. Recalculé côté
 * client à partir de la date lue au chargement, pour qu'un rafraîchissement après une action
 * (qui relit une date déjà remise à zéro) ne l'efface pas pendant la visite.
 */
export function isNewSince(pub: Publication, lastSeenAt: string): boolean {
  return tabOf(pub.kind) === "opportunites" && !pub.isOwn && pub.state === "active" && pub.createdAt > lastSeenAt;
}

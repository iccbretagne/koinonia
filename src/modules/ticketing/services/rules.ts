import type {
  TicketingAgeGroup,
  TicketingChargeStatus,
  TicketingOptionScope,
  TicketingOptionType,
} from "@/generated/prisma/client";
import { ApiError } from "@/lib/errors";
import { isMinor, type OptionSelection, type TicketingQuestion } from "../schemas";

/**
 * Règles pures de la billetterie (spec 074) : mineurs, options choisies, états de paiement,
 * annulation et soldes. Sans base de données, testées directement.
 */

export interface RuleOption {
  id: string;
  label: string;
  type: TicketingOptionType;
  scope: TicketingOptionScope;
  price: number;
  stock: number | null;
  active: boolean;
  refundable: boolean;
  refundDeadline: Date | null;
  choiceGroup?: string | null;
  variants: { id: string; label: string; stock: number | null; closed: boolean }[];
}

export interface PlannedItem {
  /** Index du participant dans la saisie, ou `null` pour la réservation. */
  holder: number | null;
  optionId: string;
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  status: TicketingChargeStatus;
}

export const chargeStatusFor = (amount: number): TicketingChargeStatus => (amount > 0 ? "DUE" : "FREE");

/**
 * Un mineur doit être accompagné d'au moins un adulte de la réservation ; si l'organisateur
 * autorise les mineurs non accompagnés, un responsable légal (nom, téléphone, autorisation) est
 * exigé à la place.
 */
export function checkMinors(
  ageGroups: TicketingAgeGroup[],
  allowUnaccompanied: boolean,
  hasGuardian: boolean
): void {
  if (!ageGroups.some(isMinor) || ageGroups.includes("ADULT")) return;
  if (!allowUnaccompanied) {
    throw new ApiError(400, "Un adulte doit faire partie de la réservation pour accompagner les mineurs.");
  }
  if (!hasGuardian) {
    throw new ApiError(400, "Un responsable légal (nom, téléphone et autorisation) est requis pour un mineur non accompagné.");
  }
}

/** Réponses : questions obligatoires renseignées, aucune clé inconnue. */
export function checkAnswers(questions: TicketingQuestion[], answers: Record<string, string>): Record<string, string> {
  const known = new Set(questions.map((q) => q.id));
  const clean: Record<string, string> = {};
  for (const [id, value] of Object.entries(answers)) {
    if (known.has(id) && value) clean[id] = value;
  }
  const missing = questions.find((q) => q.required && !clean[q.id]);
  if (missing) throw new ApiError(400, `Réponse requise : ${missing.label}`);
  return clean;
}

/** Contrôle d'un choix d'options pour un porteur (participant ou réservation). */
export function planSelections(
  holder: number | null,
  selections: OptionSelection[],
  options: Map<string, RuleOption>
): PlannedItem[] {
  const scope: TicketingOptionScope = holder === null ? "BOOKING" : "PARTICIPANT";
  const seen = new Set<string>();
  const groups = new Map<string, string>();
  return selections.map((s) => {
    const option = options.get(s.optionId);
    if (!option?.active) throw new ApiError(400, "Option indisponible");
    if (option.scope !== scope) throw new ApiError(400, `Option « ${option.label} » mal placée`);
    if (seen.has(option.id)) throw new ApiError(400, `Option « ${option.label} » choisie deux fois`);
    seen.add(option.id);
    if (option.choiceGroup) {
      const other = groups.get(option.choiceGroup);
      if (other) throw new ApiError(400, `« ${other} » et « ${option.label} » ne se cumulent pas (${option.choiceGroup} : un seul choix)`);
      groups.set(option.choiceGroup, option.label);
    }
    let variantId: string | null = null;
    let quantity = s.quantity;
    if (option.type === "CHOICE") {
      const variant = option.variants.find((v) => v.id === s.variantId);
      if (!variant || variant.closed) throw new ApiError(400, `Choix indisponible pour « ${option.label} »`);
      variantId = variant.id;
      quantity = 1;
    } else if (option.type === "CHECKBOX") {
      quantity = 1;
    }
    const amount = option.price * quantity;
    return { holder, optionId: option.id, variantId, quantity, unitPrice: option.price, status: chargeStatusFor(amount) };
  });
}

/** Stock : refuse ce qui dépasserait le stock d'une option ou d'une variante. */
export function checkStock(
  requested: { optionId: string; variantId: string | null; quantity: number }[],
  options: Map<string, RuleOption>,
  used: { options: Map<string, number>; variants: Map<string, number> }
): void {
  const perOption = new Map<string, number>();
  const perVariant = new Map<string, number>();
  for (const r of requested) {
    perOption.set(r.optionId, (perOption.get(r.optionId) ?? 0) + r.quantity);
    if (r.variantId) perVariant.set(r.variantId, (perVariant.get(r.variantId) ?? 0) + r.quantity);
  }
  for (const [optionId, qty] of perOption) {
    const option = options.get(optionId);
    if (option?.stock != null && (used.options.get(optionId) ?? 0) + qty > option.stock) {
      throw new ApiError(409, `Stock épuisé pour « ${option.label} »`);
    }
    for (const v of option?.variants ?? []) {
      const vq = perVariant.get(v.id);
      if (vq && v.stock != null && (used.variants.get(v.id) ?? 0) + vq > v.stock) {
        throw new ApiError(409, `Plus de « ${v.label} » disponible`);
      }
    }
  }
}

/** Remboursable à cette date : réglage de l'élément et date limite éventuelle. */
export function refundableNow(refundable: boolean, deadline: Date | null, now = new Date()): boolean {
  return refundable && (!deadline || now <= deadline);
}

/**
 * État d'un élément payant à son annulation :
 *   - à régler, déclaré ou gratuit : annulé ;
 *   - payé, remboursable dans le délai : à rembourser ;
 *   - payé hors délai ou non remboursable : reste payé (non remboursé, le participant a été prévenu).
 */
export function cancelledStatus(status: TicketingChargeStatus, canRefund: boolean): TicketingChargeStatus {
  if (status === "PAID") return canRefund ? "REFUND_DUE" : "PAID";
  if (status === "DUE" || status === "DECLARED" || status === "FREE") return "CANCELLED";
  return status;
}

// ── Éléments payants et soldes ───────────────────────────────────────────────

export interface Charge {
  type: "entry" | "item";
  id: string;
  label: string;
  amount: number;
  status: TicketingChargeStatus;
  /** L'élément porte une option « à retirer sur place ». */
  pickup: boolean;
}

export interface Balances {
  total: number;
  due: number;
  declared: number;
  paid: number;
  refundDue: number;
  refunded: number;
}

export function balances(charges: Charge[]): Balances {
  const sum = (s: TicketingChargeStatus) => round(charges.filter((c) => c.status === s).reduce((n, c) => n + c.amount, 0));
  const due = sum("DUE");
  const declared = sum("DECLARED");
  const paid = sum("PAID");
  return { total: round(due + declared + paid), due, declared, paid, refundDue: sum("REFUND_DUE"), refunded: sum("REFUNDED") };
}

export function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Libellé d'une référence : `PREFIX-0042`. */
export function formatReference(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

import type { PaymentMethodsConfig } from "./schemas";
import { paths } from "@/lib/paths";

export interface ReadinessCheck {
  key: string;
  label: string;
  done: boolean;
  /** Bloque l'ouverture tant qu'il n'est pas fait ; sinon simple conseil. */
  required: boolean;
  detail?: string;
  href: string;
}

/** Ce que la vérification lit d'un événement (structure de `EventDetail`, sans dépendre du service). */
export interface ReadinessEvent {
  id: string;
  tariffs: readonly { price: number }[];
  seatsOpen: number;
  paymentMethods: PaymentMethodsConfig;
  options: readonly { label: string; type: string; active: boolean; price: number; variants: readonly { closed: boolean }[] }[];
  optionPaymentDeadline: Date | string | null;
  roles: readonly unknown[];
  posterKey: string | null;
  location: string | null;
}

/**
 * Ce qu'il reste à régler avant d'ouvrir les inscriptions (spec 074) : les points bloquants
 * empêchent un formulaire inutilisable (pas de tarif, pas de place, rien pour payer, menu vide) ;
 * les autres sont des conseils.
 */
export function readinessChecks(event: ReadinessEvent): ReadinessCheck[] {
  const tab = (vue: string) => paths.billetterie.event(event.id, { vue });
  const pm = event.paymentMethods;
  const offered = event.options.filter((o) => o.active);
  const paid = event.tariffs.some((t) => t.price > 0) || offered.some((o) => o.price > 0);
  const hasMethod = !!(pm.wero || pm.revolut || pm.paypal || pm.transfer || pm.cash || pm.cheque);
  const emptyMenus = offered.filter((o) => o.type === "CHOICE" && !o.variants.some((v) => !v.closed));
  const paidOptions = offered.some((o) => o.price > 0);
  return [
    { key: "tariffs", label: "Tarifs de l'entrée", done: event.tariffs.length > 0, required: true, detail: "Au moins une tranche d'âge, même gratuite.", href: tab("parametres") },
    { key: "seats", label: "Places ouvertes à l'inscription", done: event.seatsOpen > 0, required: true, href: tab("parametres") },
    {
      key: "payment",
      label: "Moyen de paiement",
      done: !paid || hasMethod,
      required: true,
      detail: paid ? "Une entrée ou une option est payante." : "Tout est gratuit : rien à encaisser.",
      href: tab("parametres"),
    },
    {
      key: "menus",
      label: "Plats des menus",
      done: emptyMenus.length === 0,
      required: true,
      detail: emptyMenus.length ? `Sans plat ouvert : ${emptyMenus.map((o) => o.label).join(", ")}.` : undefined,
      href: tab("options"),
    },
    ...(paidOptions
      ? [{ key: "deadline", label: "Date limite de paiement des options", done: !!event.optionPaymentDeadline, required: false, detail: "Sans elle, aucune relance ni libération automatique.", href: tab("parametres") }]
      : []),
    { key: "location", label: "Lieu de l'événement", done: !!event.location, required: false, href: tab("parametres") },
    { key: "team", label: "Équipe (accueil, trésorier…)", done: event.roles.length > 0, required: false, href: tab("equipe") },
    { key: "poster", label: "Affiche", done: !!event.posterKey, required: false, href: tab("parametres") },
  ];
}

/** Points bloquants restants (l'ouverture est refusée tant qu'il en reste). */
export const blockingChecks = (event: ReadinessEvent) => readinessChecks(event).filter((c) => c.required && !c.done);

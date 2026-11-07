import { describe, it, expect } from "vitest";
import { readinessChecks } from "../readiness";

type Input = Parameters<typeof readinessChecks>[0];
const variant = (closed = false) => ({ id: "v", label: "Poulet", closed }) as unknown as Input["options"][number]["variants"][number];
const option = (o: Partial<Input["options"][number]>) =>
  ({ id: "meal", label: "Repas", type: "CHOICE", active: true, price: 12, variants: [variant()], ...o }) as Input["options"][number];
const base = (over: Partial<Input> = {}): Input =>
  ({
    id: "ev-1",
    tariffs: [{ ageGroup: "ADULT", price: 10 }],
    seatsOpen: 50,
    paymentMethods: { wero: null, revolut: null, transfer: null, cash: true, cheque: false },
    options: [],
    optionPaymentDeadline: null,
    roles: [],
    posterKey: null,
    location: "Rennes",
    ...over,
  }) as Input;
const blocking = (i: Input) => readinessChecks(i).filter((c) => c.required && !c.done).map((c) => c.key);

describe("checklist d'ouverture de la billetterie", () => {
  it("prêt : tarif, places, paiement, aucun menu vide", () => {
    expect(blocking(base())).toEqual([]);
  });

  it("bloque sans tarif ni place", () => {
    expect(blocking(base({ tariffs: [], seatsOpen: 0 }))).toEqual(["tariffs", "seats"]);
  });

  it("exige un moyen de paiement seulement si quelque chose est payant", () => {
    const none = { wero: null, revolut: null, transfer: null, cash: false, cheque: false } as Input["paymentMethods"];
    expect(blocking(base({ paymentMethods: none }))).toEqual(["payment"]);
    expect(blocking(base({ paymentMethods: none, tariffs: [{ ageGroup: "ADULT", price: 0 }] }))).toEqual([]);
    expect(blocking(base({ paymentMethods: none, tariffs: [{ ageGroup: "ADULT", price: 0 }], options: [option({})] }))).toEqual(["payment"]);
  });

  it("un menu proposé sans plat ouvert bloque ; un menu désactivé non", () => {
    const checks = readinessChecks(base({ options: [option({ variants: [variant(true)] })] }));
    expect(checks.find((c) => c.key === "menus")).toMatchObject({ done: false, detail: "Sans plat ouvert : Repas." });
    expect(blocking(base({ options: [option({ variants: [], active: false })] }))).toEqual([]);
  });

  it("conseille la date limite de paiement seulement pour des options payantes, et pointe vers le bon onglet", () => {
    expect(readinessChecks(base()).some((c) => c.key === "deadline")).toBe(false);
    const checks = readinessChecks(base({ options: [option({})] }));
    expect(checks.find((c) => c.key === "deadline")).toMatchObject({ required: false, done: false });
    expect(checks.find((c) => c.key === "menus")?.href).toBe("/billetterie/ev-1?vue=options");
  });
});

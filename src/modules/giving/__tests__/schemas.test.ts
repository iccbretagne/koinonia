import { describe, it, expect } from "vitest";
import { givingPageSchema, missingForDisplay, toPublicGivingPage, type GivingPageContent } from "../schemas";
import { defaultGivingContent } from "../services/defaults";

const base = { churchId: "church-1", ...defaultGivingContent("ICC Rennes") };

function errorsOf(input: Record<string, unknown>) {
  const result = givingPageSchema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((i) => [String(i.path[0]), i.message]));
}

describe("givingPageSchema (spec 065)", () => {
  it("accepte le contenu par défaut, sections désactivées sans exigence", () => {
    const parsed = givingPageSchema.parse({ ...base, transferEnabled: false, onlineEnabled: false, onsiteEnabled: false });
    expect(parsed.iban).toBeNull();
  });

  it("exige les champs de chaque section activée, rattachés au champ", () => {
    const errors = errorsOf({
      ...base,
      onlineEnabled: true,
      onlineUrl: "",
      transferEnabled: true,
      beneficiary: " ",
      iban: null,
      onsiteEnabled: true,
      checkPayee: "",
      taxReceiptEnabled: true,
      taxReceiptText: "",
    });
    expect(Object.keys(errors).sort()).toEqual(["beneficiary", "checkPayee", "iban", "onlineUrl", "taxReceiptText"]);
  });

  it("impose https pour le lien de don et l'adresse courte", () => {
    const errors = errorsOf({ ...base, onlineEnabled: true, onlineUrl: "http://don.fr", shortUrl: "javascript:alert(1)" });
    expect(errors.onlineUrl).toMatch(/https/);
    expect(errors.shortUrl).toMatch(/https/);
  });

  it("normalise l'IBAN et renvoie son erreur", () => {
    const ok = givingPageSchema.parse({ ...base, transferEnabled: true, iban: "fr76 3000 6000 0112 3456 7890 189" });
    expect(ok.iban).toBe("FR7630006000011234567890189");
    expect(errorsOf({ ...base, transferEnabled: true, iban: "FR7630006000011234567890188" }).iban).toMatch(/clé|contrôle/i);
  });

  it("refuse un email de contact invalide et un BIC invalide", () => {
    const errors = errorsOf({ ...base, contactEmail: "pas-un-email", bic: "AGRI" });
    expect(errors.contactEmail).toBeDefined();
    expect(errors.bic).toBeDefined();
  });
});

describe("toPublicGivingPage", () => {
  const content: GivingPageContent = {
    ...defaultGivingContent("ICC Rennes"),
    enabled: true,
    onlineEnabled: true,
    onlineUrl: "https://don.example/icc",
    onsiteEnabled: true,
    transferEnabled: false,
    iban: "FR7630006000011234567890189",
    taxReceiptEnabled: false,
    taxReceiptText: "Reçu",
  };

  it("ne projette que les sections activées", () => {
    const page = toPublicGivingPage("ICC Rennes", content);
    expect(page.online?.url).toBe("https://don.example/icc");
    expect(page.transfer).toBeNull();
    expect(page.taxReceipt).toBeNull();
    expect(page.onsite?.checkPayee).toBe("ICC Rennes");
    expect(JSON.stringify(page)).not.toContain("FR7630006000011234567890189");
  });
});

describe("nom et logo de l'église (spec 066)", () => {
  const legacy = { churchId: "church-1", ...defaultGivingContent("ICC Rennes") } as Record<string, unknown>;
  for (const key of ["pageChurchNameShown", "pageChurchNameSize", "slideChurchNameShown", "slideChurchNameSize", "pageLogoShown", "slideLogoShown"]) {
    delete legacy[key];
  }

  it("applique le rendu d'origine à un corps qui ne connaît pas les réglages", () => {
    const parsed = givingPageSchema.parse(legacy);
    expect(parsed).toMatchObject({
      pageChurchNameShown: true,
      pageChurchNameSize: "SMALL",
      slideChurchNameShown: true,
      slideChurchNameSize: "SMALL",
      pageLogoShown: true,
      slideLogoShown: true,
    });
  });

  it("refuse une taille inconnue", () => {
    expect(errorsOf({ ...base, slideChurchNameSize: "HUGE" }).slideChurchNameSize).toBeDefined();
  });

  it("ignore un logoKey envoyé par le formulaire", () => {
    const parsed = givingPageSchema.parse({ ...base, logoKey: "giving/other/logo.png" });
    expect(parsed).not.toHaveProperty("logoKey");
  });

  it("applique les réglages de la page, jamais ceux de la slide", () => {
    const content: GivingPageContent = {
      ...defaultGivingContent("ICC Rennes"),
      pageChurchNameSize: "LARGE",
      slideChurchNameShown: false,
      slideLogoShown: false,
    };
    const page = toPublicGivingPage("ICC Rennes", content, "/logo.png");
    expect(page.churchNameSize).toBe("LARGE");
    expect(page.logo).toEqual({ src: "/logo.png" });
  });

  it("masque le nom et le logo selon les réglages de la page", () => {
    const content: GivingPageContent = {
      ...defaultGivingContent("ICC Rennes"),
      pageChurchNameShown: false,
      pageLogoShown: false,
    };
    const page = toPublicGivingPage("ICC Rennes", content, "/logo.png");
    expect(page.churchNameSize).toBeNull();
    expect(page.logo).toBeNull();
    expect(toPublicGivingPage("ICC Rennes", defaultGivingContent("ICC Rennes"), null).logo).toBeNull();
  });
});

describe("missingForDisplay", () => {
  const base = { ...defaultGivingContent("ICC Rennes"), checkPayee: null, beneficiary: null };

  it("liste ce qui manque à une section activée, et rien pour une section éteinte", () => {
    const missing = missingForDisplay({ ...base, onlineEnabled: true, transferEnabled: true, onsiteEnabled: false });
    expect(missing.online).toEqual(["le lien de don en ligne"]);
    expect(missing.transfer).toEqual(["le bénéficiaire", "l'IBAN"]);
    expect(missing.onsite).toBeUndefined();
  });

  it("concorde avec toPublicGivingPage : section complète ⇔ section affichée", () => {
    const content: GivingPageContent = {
      ...base,
      onlineEnabled: true,
      onlineUrl: "https://don.example/icc",
      transferEnabled: true,
      beneficiary: "ICC",
      iban: null,
      onsiteEnabled: true,
      checkPayee: "ICC",
      taxReceiptEnabled: true,
      taxReceiptText: null,
    };
    const page = toPublicGivingPage("ICC Rennes", content);
    const missing = missingForDisplay(content);
    for (const section of ["online", "transfer", "onsite", "taxReceipt"] as const) {
      expect(page[section] === null).toBe(missing[section] !== undefined);
    }
  });
});

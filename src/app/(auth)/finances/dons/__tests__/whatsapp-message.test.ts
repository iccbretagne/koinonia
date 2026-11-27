import { describe, it, expect } from "vitest";
import { buildWhatsAppMessage, whatsAppShareUrl } from "../whatsapp-message";

const content = {
  transferEnabled: true,
  beneficiary: "Impact Centre Chrétien Rennes",
  iban: "FR7630006000011234567890189",
  bic: "CRLYFRPP",
  transferReference: "Prénom Nom, ICC RENNES Dîme",
  onlineEnabled: true,
  onlineUrl: "https://donorbox.org/dons-a-impact-centre-chretien",
  onsiteEnabled: false,
  checkPayee: "ICC Rennes",
};

describe("buildWhatsAppMessage", () => {
  it("reprend le modèle : virement, motif, lien, exemple et signature", () => {
    const message = buildWhatsAppMessage(content, { signature: "Bénédictions\nPôle coordination." });
    expect(message).toBe(
      [
        "➡ *DÎMES/OFFRANDES*",
        "Vous pouvez effectuer *un virement bancaire* avec les coordonnées suivantes :",
        "Impact Centre Chrétien Rennes\nIBAN : FR76 3000 6000 0112 3456 7890 189\nBIC : CRLYFRPP",
        'Merci de préciser dans *"Motif du virement"* :\nPrénom Nom, ICC RENNES Dîme',
        "➡ Vous pouvez également utiliser le lien suivant toujours *en précisant le même motif* :",
        "https://donorbox.org/dons-a-impact-centre-chretien",
        "*Exemple dans le motif du virement* :\nDupond Marie, ICC RENNES Dîme",
        "Bénédictions\nPôle coordination.",
      ].join("\n\n")
    );
    expect(message).toContain("IBAN : FR76 3000 6000 0112 3456 7890 189\nBIC : CRLYFRPP");
    expect(message).toContain('Merci de préciser dans *"Motif du virement"* :\nPrénom Nom, ICC RENNES Dîme');
    expect(message).toContain("toujours *en précisant le même motif* :\n\nhttps://donorbox.org/dons-a-impact-centre-chretien");
    expect(message).toContain("*Exemple dans le motif du virement* :\nDupond Marie, ICC RENNES Dîme");
    expect(message.endsWith("Bénédictions\nPôle coordination.")).toBe(true);
    expect(message).not.toContain("enveloppe");
  });

  it("n'inclut que les sections affichées", () => {
    const onlineOnly = buildWhatsAppMessage({ ...content, transferEnabled: false });
    expect(onlineOnly).not.toContain("IBAN");
    expect(onlineOnly).not.toContain("même motif");
    expect(onlineOnly).toContain("➡ Vous pouvez faire un don en ligne avec le lien suivant :");
    expect(buildWhatsAppMessage({ ...content, onlineEnabled: false })).not.toContain("donorbox");
  });

  it("mentionne l'enveloppe de l'équipe d'accueil et l'ordre des chèques", () => {
    const message = buildWhatsAppMessage({ ...content, onsiteEnabled: true });
    expect(message).toContain("*l'enveloppe remise par l'équipe d'accueil* (chèques à l'ordre de *ICC Rennes*)");
  });

  it("ajoute la page publique et la signature par défaut", () => {
    const message = buildWhatsAppMessage(content, { publicUrl: "https://k.fr/donner/icc" });
    expect(message).toContain("Toutes les façons de donner :\nhttps://k.fr/donner/icc");
    expect(message.endsWith("Bénédictions")).toBe(true);
  });

  it("sans « Prénom Nom » dans le libellé, pas d'exemple", () => {
    expect(buildWhatsAppMessage({ ...content, transferReference: "DON" })).not.toContain("Exemple");
  });

  it("encode le lien de partage", () => {
    expect(whatsAppShareUrl("a b\n*c*")).toBe("https://wa.me/?text=a%20b%0A*c*");
  });
});

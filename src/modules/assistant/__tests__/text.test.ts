import { describe, it, expect } from "vitest";
import { anonymize, lexicalSimilarity, normalize, tokens, wordSimilarity } from "../services/text";

describe("texte de l'assistant (spec 075)", () => {
  it("normalise accents, majuscules et ponctuation", () => {
    expect(normalize("Où est l'Écran « Disponibilités » ?")).toBe("ou est l ecran disponibilites");
  });

  it("garde les mots utiles, applique les synonymes et le pluriel", () => {
    expect(tokens("je suis pas dispo dimanche")).toEqual(["moi", "indisponible", "dimanche"]);
    expect(tokens("qui est indisponible dimanche")).toEqual(["qui", "indisponible", "dimanche"]);
    expect(tokens("Mes dispos")).toEqual(["moi", "disponibilite"]);
    expect(tokens("je serai pas là ce week-end")).toContain("absent");
  });

  it("tolère une faute de frappe et rapproche les mots de même racine", () => {
    expect(wordSimilarity("disponible", "disponnible")).toBeGreaterThan(0.8);
    expect(wordSimilarity("declarer", "declaration")).toBeGreaterThan(0.7);
    expect(wordSimilarity("salle", "service")).toBe(0);
  });

  it("score une question proche plus haut qu'une question éloignée", () => {
    const q = tokens("comment je declare une absense");
    expect(lexicalSimilarity(q, tokens("Déclarer une absence"))).toBeGreaterThan(
      lexicalSimilarity(q, tokens("Réserver une salle"))
    );
  });

  it("anonymise emails, téléphones, IBAN, liens et longs nombres", () => {
    const out = anonymize(
      "écrire à jean.dupont@exemple.fr ou au 06 12 34 56 78, +33 6 12 34 56 78, IBAN FR76 3000 6000 0112 3456 7890 189, voir https://exemple.fr/x et code 12345"
    );
    expect(out).not.toMatch(/@|exemple|06 12|\+33|FR76|12345/);
    expect(out).toContain("[…]");
  });

  it("tronque à 300 caractères", () => {
    expect(anonymize("a".repeat(400))).toHaveLength(300);
  });
});

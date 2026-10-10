import { describe, it, expect } from "vitest";
import { dayKey, daysUntil, formatDeadline, groupByDeadline, matchesQuery, relativeDeadline } from "../request-queue";

// Samedi 10 octobre 2026, 12:00 à Paris (UTC+2).
const NOW = new Date("2026-10-10T10:00:00Z");

const item = (id: string, deadline: string | null, submittedAt = "2026-10-01T08:00:00Z") => ({ id, deadline, submittedAt });

describe("dayKey", () => {
  it("lit une date « jour » ou une heure locale sans fuseau telle quelle", () => {
    expect(dayKey("2026-10-12")).toBe("2026-10-12");
    expect(dayKey("2026-10-12T23:30")).toBe("2026-10-12");
  });

  it("ramène un instant UTC au jour de Paris", () => {
    // 22:30 UTC le 11 = 00:30 le 12 à Paris.
    expect(dayKey("2026-10-11T22:30:00.000Z")).toBe("2026-10-12");
    expect(dayKey(new Date("2026-10-11T21:30:00Z"))).toBe("2026-10-11");
  });

  it("renvoie null pour une valeur absente ou invalide", () => {
    expect(dayKey(null)).toBeNull();
    expect(dayKey("pas une date")).toBeNull();
  });
});

describe("daysUntil / relativeDeadline", () => {
  it("compte en jours calendaires à Paris", () => {
    expect(daysUntil("2026-10-10", NOW)).toBe(0);
    expect(daysUntil("2026-10-11", NOW)).toBe(1);
    expect(daysUntil("2026-10-07", NOW)).toBe(-3);
  });

  it("une échéance juste après minuit à Paris compte pour le lendemain", () => {
    const lateEvening = new Date("2026-10-10T21:50:00Z"); // 23:50 à Paris
    expect(daysUntil("2026-10-10T22:10:00.000Z", lateEvening)).toBe(1); // 00:10 le 11
  });

  it("formule le délai", () => {
    expect(relativeDeadline("2026-10-10", NOW)).toBe("aujourd'hui");
    expect(relativeDeadline("2026-10-11", NOW)).toBe("demain");
    expect(relativeDeadline("2026-10-13", NOW)).toBe("dans 3 j");
    expect(relativeDeadline("2026-10-09", NOW)).toBe("hier");
    expect(relativeDeadline("2026-10-08", NOW)).toBe("en retard de 2 j");
  });
});

describe("formatDeadline", () => {
  it("formate le jour sans décalage", () => {
    expect(formatDeadline("2026-10-11")).toBe("dim. 11 oct.");
  });
});

describe("groupByDeadline", () => {
  it("regroupe en retard / cette semaine / plus tard / sans échéance, dans cet ordre", () => {
    const groups = groupByDeadline(
      [item("later", "2026-10-20"), item("none", null), item("week", "2026-10-16"), item("overdue", "2026-10-09")],
      NOW
    );
    expect(groups.map((g) => g.key)).toEqual(["overdue", "week", "later", "none"]);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([["overdue"], ["week"], ["later"], ["none"]]);
  });

  it("le 7e jour bascule dans « Plus tard »", () => {
    const groups = groupByDeadline([item("j6", "2026-10-16"), item("j7", "2026-10-17")], NOW);
    expect(groups.find((g) => g.key === "week")?.items.map((i) => i.id)).toEqual(["j6"]);
    expect(groups.find((g) => g.key === "later")?.items.map((i) => i.id)).toEqual(["j7"]);
  });

  it("trie par échéance puis par ancienneté", () => {
    const groups = groupByDeadline(
      [
        item("b", "2026-10-12", "2026-10-05T08:00:00Z"),
        item("c", "2026-10-11"),
        item("a", "2026-10-12", "2026-10-02T08:00:00Z"),
      ],
      NOW
    );
    expect(groups[0].items.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("n'expose aucun groupe vide", () => {
    expect(groupByDeadline([item("x", null)], NOW).map((g) => g.key)).toEqual(["none"]);
    expect(groupByDeadline([], NOW)).toEqual([]);
  });
});

describe("matchesQuery", () => {
  const req = { title: "Concert de Noël", author: "Éloïse Martin", source: "Louange", announcement: { title: "Grande soirée" } };

  it("cherche dans le titre, le demandeur, l'origine et le titre de l'annonce, sans accents ni casse", () => {
    expect(matchesQuery(req, "noel")).toBe(true);
    expect(matchesQuery(req, "ELOISE")).toBe(true);
    expect(matchesQuery(req, "louange")).toBe(true);
    expect(matchesQuery(req, "soirée")).toBe(true);
    expect(matchesQuery(req, "accueil")).toBe(false);
  });

  it("une recherche vide garde tout", () => {
    expect(matchesQuery(req, "  ")).toBe(true);
  });
});

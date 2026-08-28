import { describe, it, expect, beforeEach } from "vitest";
import {
  type AudioServiceRow,
  type QueueCriteria,
  DEFAULT_SORT,
  EMPTY_CRITERIA,
  NO_SPEAKER,
  STATUS_SORT_ORDER,
  __resetState,
  deriveSpeakers,
  deriveYears,
  filterQueue,
  hasActiveState,
  isRangeValid,
  loadState,
  saveState,
  sortQueue,
} from "./queue-filters";

function row(over: Partial<AudioServiceRow>): AudioServiceRow {
  return {
    id: Math.random().toString(36).slice(2),
    title: "Culte",
    speaker: null,
    serviceDate: "2025-06-01T08:00:00.000Z",
    status: "PUBLISHED",
    type: "CULTE",
    openCount: 0,
    segmentCount: 4,
    eventTitle: null,
    ...over,
  };
}

const crit = (over: Partial<QueueCriteria> = {}): QueueCriteria => ({ ...EMPTY_CRITERIA, ...over });

describe("deriveSpeakers", () => {
  it("dédoublonne (casse/accents ignorés), trie fr, exclut les vides", () => {
    const rows = [
      row({ speaker: "Pasteur Éric" }),
      row({ speaker: "pasteur eric" }),
      row({ speaker: "  Armelle  " }),
      row({ speaker: "" }),
      row({ speaker: null }),
      row({ speaker: "Bruno" }),
    ];
    expect(deriveSpeakers(rows)).toEqual(["Armelle", "Bruno", "Pasteur Éric"]);
  });
});

describe("deriveYears", () => {
  it("années distinctes, décroissantes", () => {
    const rows = [
      row({ serviceDate: "2024-01-07T09:00:00.000Z" }),
      row({ serviceDate: "2025-12-25T09:00:00.000Z" }),
      row({ serviceDate: "2025-01-05T09:00:00.000Z" }),
    ];
    expect(deriveYears(rows)).toEqual(["2025", "2024"]);
  });
});

describe("isRangeValid", () => {
  it("valide sauf si from > to (les deux renseignés)", () => {
    expect(isRangeValid(crit())).toBe(true);
    expect(isRangeValid(crit({ from: "2025-01-01" }))).toBe(true);
    expect(isRangeValid(crit({ to: "2025-01-01" }))).toBe(true);
    expect(isRangeValid(crit({ from: "2025-01-01", to: "2025-06-01" }))).toBe(true);
    expect(isRangeValid(crit({ from: "2025-06-02", to: "2025-06-01" }))).toBe(false);
  });
});

describe("filterQueue", () => {
  const rows = [
    row({ id: "a", status: "PENDING_REVIEW", type: "CULTE", serviceDate: "2024-03-10T09:00:00.000Z", speaker: null, title: "Culte" }),
    row({ id: "b", status: "PUBLISHED", type: "CULTE", serviceDate: "2025-02-09T09:00:00.000Z", speaker: "Pasteure Armelle", title: "Qui es-tu ?" }),
    row({ id: "c", status: "PUBLISHED", type: "AUTRE", serviceDate: "2025-02-16T09:00:00.000Z", speaker: "Bruno", title: "Cérémonie des baptêmes" }),
    row({ id: "d", status: "READY", type: "CULTE", serviceDate: "2025-11-30T09:00:00.000Z", speaker: "  ", title: null }),
  ];
  const ids = (c: QueueCriteria) => filterQueue(rows, c).map((r) => r.id).sort();

  it("aucun critère → tout", () => {
    expect(ids(crit())).toEqual(["a", "b", "c", "d"]);
  });
  it("statut", () => {
    expect(ids(crit({ status: "PUBLISHED" }))).toEqual(["b", "c"]);
  });
  it("type", () => {
    expect(ids(crit({ type: "AUTRE" }))).toEqual(["c"]);
  });
  it("année", () => {
    expect(ids(crit({ year: "2024" }))).toEqual(["a"]);
  });
  it("plage du/au, bornes incluses", () => {
    expect(ids(crit({ from: "2025-02-09", to: "2025-02-16" }))).toEqual(["b", "c"]);
  });
  it("plage from > to → aucun résultat", () => {
    expect(filterQueue(rows, crit({ from: "2025-12-01", to: "2025-01-01" }))).toEqual([]);
  });
  it("année + plage combinées", () => {
    expect(ids(crit({ year: "2025", from: "2025-11-01", to: "2025-12-31" }))).toEqual(["d"]);
  });
  it("recherche texte sur titre et orateur, insensible casse/accents", () => {
    expect(ids(crit({ text: "es-TU" }))).toEqual(["b"]); // titre « Qui es-tu ? »
    expect(ids(crit({ text: "ARMELLE" }))).toEqual(["b"]); // orateur
    expect(ids(crit({ text: "céré" }))).toEqual(["c"]); // accents ignorés
  });
  it("recherche texte robuste aux titres/orateurs nuls", () => {
    expect(() => filterQueue(rows, crit({ text: "x" }))).not.toThrow();
    expect(ids(crit({ text: "" }))).toEqual(["a", "b", "c", "d"]);
  });
  it("orateur exact", () => {
    expect(ids(crit({ speaker: "Bruno" }))).toEqual(["c"]);
  });
  it("orateur = Sans orateur → lignes sans orateur (null ou espaces)", () => {
    expect(ids(crit({ speaker: NO_SPEAKER }))).toEqual(["a", "d"]);
  });
  it("combinaison de 3+ critères = intersection", () => {
    expect(ids(crit({ status: "PUBLISHED", type: "CULTE", year: "2025", text: "es-tu" }))).toEqual(["b"]);
  });
});

describe("sortQueue", () => {
  const rows = [
    row({ id: "old", serviceDate: "2024-01-01T09:00:00.000Z", status: "PUBLISHED", segmentCount: 2, openCount: 50 }),
    row({ id: "mid", serviceDate: "2025-06-01T09:00:00.000Z", status: "PENDING_REVIEW", segmentCount: 8, openCount: 5 }),
    row({ id: "new", serviceDate: "2025-12-01T09:00:00.000Z", status: "UNPUBLISHED", segmentCount: 5, openCount: 20 }),
  ];

  it("date desc / asc", () => {
    expect(sortQueue(rows, "date", "desc").map((r) => r.id)).toEqual(["new", "mid", "old"]);
    expect(sortQueue(rows, "date", "asc").map((r) => r.id)).toEqual(["old", "mid", "new"]);
  });
  it("séquences et ouvertures", () => {
    expect(sortQueue(rows, "segments", "asc").map((r) => r.id)).toEqual(["old", "new", "mid"]);
    expect(sortQueue(rows, "opens", "desc").map((r) => r.id)).toEqual(["old", "new", "mid"]);
  });
  it("statut asc : PENDING_REVIEW en tête, UNPUBLISHED en fin", () => {
    expect(sortQueue(rows, "status", "asc").map((r) => r.id)).toEqual(["mid", "old", "new"]);
    expect(sortQueue(rows, "status", "desc").map((r) => r.id)).toEqual(["new", "old", "mid"]);
  });
  it("départage par date décroissante à valeur égale", () => {
    const tie = [
      row({ id: "t1", serviceDate: "2025-01-01T09:00:00.000Z", segmentCount: 4 }),
      row({ id: "t2", serviceDate: "2025-09-09T09:00:00.000Z", segmentCount: 4 }),
      row({ id: "t3", serviceDate: "2025-05-05T09:00:00.000Z", segmentCount: 4 }),
    ];
    expect(sortQueue(tie, "segments", "asc").map((r) => r.id)).toEqual(["t2", "t3", "t1"]);
    expect(sortQueue(tie, "segments", "desc").map((r) => r.id)).toEqual(["t2", "t3", "t1"]);
  });
  it("ne mute pas le tableau source", () => {
    const src = [...rows];
    sortQueue(src, "date", "asc");
    expect(src.map((r) => r.id)).toEqual(["old", "mid", "new"]);
  });
  it("STATUS_SORT_ORDER couvre les 5 statuts dans l'ordre voulu", () => {
    expect(STATUS_SORT_ORDER).toEqual({
      PENDING_REVIEW: 0,
      READY: 1,
      DRAFT: 2,
      PUBLISHED: 3,
      UNPUBLISHED: 4,
    });
  });
});

describe("persistance intra-session", () => {
  beforeEach(() => __resetState());

  it("loadState initial → null", () => {
    expect(loadState()).toBeNull();
  });
  it("aller-retour saveState / loadState (copie défensive)", () => {
    const criteria = crit({ status: "READY", text: "abc" });
    const sort = { key: "opens" as const, dir: "asc" as const };
    saveState({ criteria, sort });
    const loaded = loadState();
    expect(loaded).toEqual({ criteria, sort });
    criteria.status = "DRAFT";
    expect(loadState()?.criteria.status).toBe("READY");
  });
});

describe("hasActiveState", () => {
  it("faux si critères vides et tri par défaut", () => {
    expect(hasActiveState(EMPTY_CRITERIA, DEFAULT_SORT)).toBe(false);
  });
  it("vrai si un critère est posé", () => {
    expect(hasActiveState(crit({ type: "CULTE" }), DEFAULT_SORT)).toBe(true);
  });
  it("vrai si le tri diffère du défaut", () => {
    expect(hasActiveState(EMPTY_CRITERIA, { key: "opens", dir: "desc" })).toBe(true);
    expect(hasActiveState(EMPTY_CRITERIA, { key: "date", dir: "asc" })).toBe(true);
  });
});

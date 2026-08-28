import { describe, it, expect } from "vitest";
import {
  normalizeForMatch,
  parseTrack,
  canonicalTitle,
  isExcludedTrack,
  isPredicationTrack,
  orderTracks,
  parseCulteFolder,
  parsePredicationFile,
  defaultServiceTime,
  toUtcDate,
  matchPredication,
  buildManifest,
} from "./parse";
import { assertValidManifest } from "./manifest";
import type { Scan, ScanPredication } from "./types";

describe("parseCulteFolder", () => {
  it("culte simple", () => {
    expect(parseCulteFolder("Culte du 12 01 2025")).toEqual({
      date: "2025-01-12",
      slot: null,
      label: "Culte",
      type: "CULTE",
    });
  });

  it("cultes numérotés d'une même journée", () => {
    expect(parseCulteFolder("Culte 1 du 23 02 2025")).toMatchObject({ date: "2025-02-23", slot: 1, label: "Culte 1" });
    expect(parseCulteFolder("Culte 2 du 11 05 2025")).toMatchObject({ date: "2025-05-11", slot: 2, label: "Culte 2" });
  });

  it("cérémonie de baptêmes → type AUTRE", () => {
    expect(parseCulteFolder("Cérémonie des baptêmes du 16 02 2025")).toEqual({
      date: "2025-02-16",
      slot: null,
      label: "Cérémonie des baptêmes",
      type: "AUTRE",
    });
  });

  it("dossier non reconnu → null", () => {
    expect(parseCulteFolder("Notes diverses")).toBeNull();
    expect(parseCulteFolder("Culte du 99 99 2025")).toBeNull();
  });
});

describe("parsePredicationFile", () => {
  it("date, heure et titre", () => {
    expect(parsePredicationFile("2025-02-09_12h00_La_loi_de_la_semence.mp3")).toEqual({
      date: "2025-02-09",
      time: "12:00",
      rawTitle: "La loi de la semence",
    });
    expect(parsePredicationFile("2025-11-02_10h30_Le_rôle_du_Saint-esprit_dans_notre_vie.mp3")).toMatchObject({
      date: "2025-11-02",
      time: "10:30",
    });
  });

  it("nom non conforme → null", () => {
    expect(parsePredicationFile("Cover.png")).toBeNull();
    expect(parsePredicationFile("desktop.ini")).toBeNull();
  });
});

describe("parseTrack", () => {
  it("capture l'ordre avant de le retirer du titre", () => {
    expect(parseTrack("#5 - Prédication.mp3")).toEqual({ order: 5, rawTitle: "Prédication" });
    expect(parseTrack("1 - Prière des  STAR.mp3")).toEqual({ order: 1, rawTitle: "Prière des STAR" });
    expect(parseTrack("#99 - MLA.mp3")).toEqual({ order: 99, rawTitle: "MLA" });
  });

  it("underscores → espaces, pas de préfixe d'ordre", () => {
    expect(parseTrack("Sainte_cène_et_Offrandes.mp3")).toEqual({ order: null, rawTitle: "Sainte cène et Offrandes" });
    expect(parseTrack("Annonces.mp3")).toEqual({ order: null, rawTitle: "Annonces" });
  });

  it("une date en tête n'est pas un ordre", () => {
    expect(parseTrack("2025-02-16 Baptêmes - Cérémonie.mp3").order).toBeNull();
  });
});

describe("canonicalTitle", () => {
  const cases: [string, string][] = [
    ["Prière des STAR", "Prière des STAR"],
    ["Prière des Stars", "Prière des STAR"],
    ["Louange", "Louanges et adoration"],
    ["Louanges et adorations", "Louanges et adoration"],
    ["Sainte cène", "Sainte-cène"],
    ["Sainte-cène", "Sainte-cène"],
    ["Sainte cène et Offrandes", "Sainte-cène, dîmes et offrandes"],
    ["Offrandes", "Dîmes et offrandes"],
    ["Dimes et offrandes", "Dîmes et offrandes"],
    ["Prédication", "Prédication"],
    ["prédication", "Prédication"],
    ["Prédications", "Prédication"],
    ["Message", "Prédication"],
    ["Prédication & Offrandes", "Prédication"],
    ["Modération", "Annonces"],
    ["Annonces", "Annonces"],
    ["Prière finale", "Prière de fin"],
    ["Prière de fin", "Prière de fin"],
  ];
  it.each(cases)("« %s » → « %s »", (input, expected) => {
    expect(canonicalTitle(input)).toBe(expected);
  });

  it("titre inconnu rendu tel quel (nettoyé)", () => {
    expect(canonicalTitle("Actions de  grâce et témoignages")).toBe("Actions de grâce et témoignages");
    expect(canonicalTitle("Temps de prière spécial")).toBe("Temps de prière spécial");
  });
});

describe("isExcludedTrack", () => {
  it.each([
    ["MLA Balances", "#98 - MLA Balances.mp3"],
    ["MLA", "#99 - MLA.mp3"],
    ["Balance MLA", "Balance_MLA.mp3"],
    ["MLA Balances et Jam session de fin", "#98 - MLA Balances et Jam session de fin.mp3"],
    ["Cover", "Cover.png"],
    ["desktop", "desktop.ini"],
  ])("exclut « %s »", (raw, filename) => {
    expect(isExcludedTrack(raw, filename)).toBe(true);
  });

  it("garde une piste normale", () => {
    expect(isExcludedTrack("Modération", "#2 - Modération.mp3")).toBe(false);
    expect(isExcludedTrack("Prédication", "#5 - Prédication.mp3")).toBe(false);
  });
});

describe("isPredicationTrack", () => {
  it.each(["Prédication", "prédication", "Prédications", "Message", "Prédication & Offrandes"])(
    "« %s » est une prédication",
    (t) => expect(isPredicationTrack(t)).toBe(true)
  );
  it.each(["Louanges", "Annonces", "Modération"])("« %s » n'en est pas une", (t) =>
    expect(isPredicationTrack(t)).toBe(false)
  );
});

describe("orderTracks", () => {
  it("conserve l'ordre relatif malgré le strip du numéro et renumérote 1..n", () => {
    const { ordered } = orderTracks([
      { order: 3, title: "Sainte-cène" },
      { order: 6, title: "Prière de fin" },
      { order: 2, title: "Louanges et adoration" },
      { order: 5, title: "Prédication" },
    ]);
    expect(ordered.map((t) => [t.order, t.title])).toEqual([
      [1, "Louanges et adoration"],
      [2, "Sainte-cène"],
      [3, "Prédication"],
      [4, "Prière de fin"],
    ]);
  });

  it("place les pistes sans numéro après, dans l'ordre de listing", () => {
    const { ordered } = orderTracks([
      { order: null, title: "Prédication" },
      { order: 1, title: "Sainte-cène" },
      { order: null, title: "Annonces" },
    ]);
    expect(ordered.map((t) => t.title)).toEqual(["Sainte-cène", "Prédication", "Annonces"]);
  });

  it("déduplique les titres identiques et signale la collision", () => {
    const { ordered, collisions } = orderTracks([
      { order: 1, title: "Prédication" },
      { order: 2, title: "Prédication" },
    ]);
    expect(ordered.map((t) => t.title)).toEqual(["Prédication", "Prédication (2)"]);
    expect(collisions).toEqual([{ title: "Prédication" }]);
  });
});

describe("defaultServiceTime", () => {
  it("12:00 pour le 2ᵉ culte, 10:00 sinon", () => {
    expect(defaultServiceTime(1)).toBe("10:00");
    expect(defaultServiceTime(2)).toBe("12:00");
    expect(defaultServiceTime(null)).toBe("10:00");
  });
});

describe("toUtcDate (Europe/Paris → UTC)", () => {
  it("heure d'hiver (UTC+1)", () => {
    expect(toUtcDate("2025-12-07", "10:30").toISOString()).toBe("2025-12-07T09:30:00.000Z");
  });
  it("heure d'été (UTC+2)", () => {
    expect(toUtcDate("2025-06-01", "10:00").toISOString()).toBe("2025-06-01T08:00:00.000Z");
    expect(toUtcDate("2025-05-11", "12:00").toISOString()).toBe("2025-05-11T10:00:00.000Z");
  });
});

describe("matchPredication", () => {
  const pred = (time: string): ScanPredication => ({
    date: "2025-02-09",
    time,
    rawTitle: "La loi de la semence",
    path: `/p/${time}.mp3`,
    sizeBytes: 1,
    artist: "Pasteur X",
    id3Title: "La loi de la semence",
    series: "Les paraboles",
  });

  it("1 culte / 1 prédication", () => {
    expect(matchPredication({ slot: null }, [pred("10:00")])?.time).toBe("10:00");
  });
  it("2 cultes / 2 prédications → appariement horaire", () => {
    const list = [pred("12:00"), pred("10:00")];
    expect(matchPredication({ slot: 1 }, list)?.time).toBe("10:00");
    expect(matchPredication({ slot: 2 }, list)?.time).toBe("12:00");
  });
  it("aucune prédication → null", () => {
    expect(matchPredication({ slot: 1 }, [])).toBeNull();
    expect(matchPredication({ slot: null }, undefined)).toBeNull();
  });
});

describe("buildManifest", () => {
  const f = (name: string, sizeBytes = 1000) => ({ name, path: `/abs/cultes/x/${name}`, sizeBytes });

  const scan: Scan = {
    cultes: [
      {
        folder: "Culte du 12 01 2025",
        files: [
          f("#1 - Prière des STAR.mp3"),
          f("#2 - Louanges.mp3"),
          f("#3 - Modération.mp3"),
          f("#5 - Prédication.mp3"),
          f("#4 - Sainte cène.mp3"),
          f("#99 - MLA.mp3"),
          f("Cover.png"),
        ],
      },
      {
        folder: "Culte du 08 09 2024",
        files: [f("#2 - Louanges_et_adorations.mp3"), f("#3 - Modération.mp3"), f("#5 - Prière finale.mp3")],
      },
      {
        folder: "Culte 1 du 09 02 2025",
        files: [f("#1 - Louanges.mp3"), f("#2 - Prédication.mp3")],
      },
      {
        folder: "Culte 2 du 09 02 2025",
        files: [f("#1 - Louanges.mp3"), f("#2 - Prédication.mp3")],
      },
      {
        folder: "Cérémonie des baptêmes du 16 02 2025",
        files: [f("2025-02-16 Baptêmes - Cérémonie.mp3")],
      },
      { folder: "Dossier random", files: [f("truc.mp3")] },
    ],
    predications: [
      {
        date: "2025-02-09",
        time: "10:00",
        rawTitle: "Qui es tu",
        path: "/abs/predications/s/2025-02-09_10h00_Qui_es_tu.mp3",
        sizeBytes: 5000,
        artist: "Pasteure Armelle Essoualla",
        id3Title: "Qui es-tu ?",
        series: "Identité",
      },
      {
        date: "2025-02-09",
        time: "12:00",
        rawTitle: "Qui es tu",
        path: "/abs/predications/s/2025-02-09_12h00_Qui_es_tu.mp3",
        sizeBytes: 5200,
        artist: "Pasteure Armelle Essoualla",
        id3Title: "Qui es-tu ?",
        series: null,
      },
    ],
  };

  const manifest = buildManifest(scan);

  it("produit un manifeste valide (Zod)", () => {
    expect(() => assertValidManifest(manifest)).not.toThrow();
  });

  it("un culte par dossier reconnu, dossier inconnu signalé", () => {
    expect(manifest.cultes.map((c) => c.folder).sort()).toEqual([
      "Culte 1 du 09 02 2025",
      "Culte 2 du 09 02 2025",
      "Culte du 08 09 2024",
      "Culte du 12 01 2025",
      "Cérémonie des baptêmes du 16 02 2025",
    ]);
    expect(manifest.report.unrecognizedFolders).toContain("Dossier random");
  });

  it("MLA exclue, séquences ordonnées et renumérotées", () => {
    const c = manifest.cultes.find((x) => x.folder === "Culte du 12 01 2025")!;
    expect(c.sequences.map((s) => s.title)).toEqual([
      "Prière des STAR",
      "Louanges et adoration",
      "Annonces",
      "Sainte-cène",
      "Prédication",
    ]);
    expect(c.sequences.map((s) => s.order)).toEqual([1, 2, 3, 4, 5]);
    expect(manifest.report.excludedFiles.some((e) => e.name === "#99 - MLA.mp3")).toBe(true);
  });

  it("substitue la prédication et en tire orateur + titre (journée à 2 cultes)", () => {
    const c1 = manifest.cultes.find((x) => x.folder === "Culte 1 du 09 02 2025")!;
    const c2 = manifest.cultes.find((x) => x.folder === "Culte 2 du 09 02 2025")!;
    expect(c1.speaker).toBe("Pasteure Armelle Essoualla");
    expect(c1.title).toBe("Qui es-tu ?");
    expect(c1.series).toBe("Identité");
    expect(c2.series).toBeNull();
    const pred1 = c1.sequences.find((s) => s.isPredication)!;
    expect(pred1.fromPredicationsLibrary).toBe(true);
    expect(pred1.filePath).toContain("10h00");
    const pred2 = c2.sequences.find((s) => s.isPredication)!;
    expect(pred2.filePath).toContain("12h00");
  });

  it("culte 2024 sans prédication appariée : orateur vide, titre = libellé du dossier", () => {
    const c = manifest.cultes.find((x) => x.folder === "Culte du 08 09 2024")!;
    expect(c.speaker).toBeNull();
    expect(c.series).toBeNull();
    expect(c.title).toBe("Culte");
    expect(manifest.report.cultesWithoutPredication).toContain("Culte du 08 09 2024");
  });

  it("baptêmes : type AUTRE, séquence unique « Cérémonie »", () => {
    const c = manifest.cultes.find((x) => x.folder === "Cérémonie des baptêmes du 16 02 2025")!;
    expect(c.type).toBe("AUTRE");
    expect(c.sequences).toHaveLength(1);
    expect(c.sequences[0].title).toBe("Cérémonie");
  });

  it("heure : celle de la prédication appariée, défaut sinon", () => {
    const c1 = manifest.cultes.find((x) => x.folder === "Culte 1 du 09 02 2025")!;
    expect(new Date(c1.serviceDateUtc).toISOString()).toBe("2025-02-09T09:00:00.000Z"); // 10:00 Paris hiver
    const c2024 = manifest.cultes.find((x) => x.folder === "Culte du 08 09 2024")!;
    expect(new Date(c2024.serviceDateUtc).toISOString()).toBe("2024-09-08T08:00:00.000Z"); // 10:00 Paris été
  });
});

describe("buildManifest — garde-fou de collision", () => {
  it("signale un culte contenant Modération ET Annonces (le catalogue réel n'en a pas)", () => {
    const scan: Scan = {
      cultes: [
        {
          folder: "Culte du 01 01 2025",
          files: [
            { name: "#1 - Modération.mp3", path: "/a", sizeBytes: 1 },
            { name: "#2 - Annonces.mp3", path: "/b", sizeBytes: 1 },
          ],
        },
      ],
      predications: [],
    };
    const m = buildManifest(scan);
    expect(m.report.collisions).toEqual([{ folder: "Culte du 01 01 2025", title: "Annonces" }]);
    const c = m.cultes[0];
    expect(c.sequences.map((s) => s.title)).toEqual(["Annonces", "Annonces (2)"]);
    expect(() => assertValidManifest(m)).not.toThrow();
  });
});

describe("normalizeForMatch", () => {
  it("retire accents et ponctuation, minuscule", () => {
    expect(normalizeForMatch("Prédication & Offrandes")).toBe("predication offrandes");
    expect(normalizeForMatch("Sainte-cène")).toBe("sainte cene");
  });
});

import { describe, expect, it } from "vitest";
import { buildMonthDays, buildWeekDays, getWeekStart, groupByRoomAndDay, localDateStr } from "./calendar";

/**
 * Les dates de test sont construites avec le constructeur **local** (`new Date(y, m, d, h)`)
 * et les horodatages derives par `.toISOString()` : les assertions restent vraies quel que
 * soit le `TZ` de la machine ou de la CI, sans forcer un fuseau global dans vitest.config.
 */

describe("getWeekStart", () => {
  it("ramene un jeudi au lundi de la meme semaine, a minuit", () => {
    // Jeudi 10 septembre 2026, 18h30 → lundi 7 septembre 00h00
    const start = getWeekStart(new Date(2026, 8, 10, 18, 30));
    expect(localDateStr(start)).toBe("2026-09-07");
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
  });

  it("rattache le dimanche a la semaine ecoulee, pas a la suivante", () => {
    // Dimanche 13 septembre 2026 → lundi 7, et non lundi 14
    expect(localDateStr(getWeekStart(new Date(2026, 8, 13, 12, 0)))).toBe("2026-09-07");
  });

  it("est idempotent sur un lundi", () => {
    const monday = getWeekStart(new Date(2026, 8, 7, 9, 0));
    expect(localDateStr(getWeekStart(monday))).toBe("2026-09-07");
  });

  it("franchit le changement d'heure sans decaler la semaine", () => {
    // Passage a l'heure d'hiver 2026 en France : dimanche 25 octobre.
    expect(localDateStr(getWeekStart(new Date(2026, 9, 25, 12, 0)))).toBe("2026-10-19");
    expect(localDateStr(getWeekStart(new Date(2026, 9, 26, 12, 0)))).toBe("2026-10-26");
  });
});

describe("buildWeekDays", () => {
  it("produit 7 jours consecutifs de lundi a dimanche", () => {
    const days = buildWeekDays(getWeekStart(new Date(2026, 8, 10)));
    expect(days.map((d) => d.dateStr)).toEqual([
      "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13",
    ]);
    expect(days[0].weekday).toBe("Lun");
    expect(days[6].weekday).toBe("Dim");
  });

  it("enjambe un changement de mois", () => {
    const days = buildWeekDays(getWeekStart(new Date(2026, 8, 30)));
    expect(days[0].dateStr).toBe("2026-09-28");
    expect(days[6].dateStr).toBe("2026-10-04");
  });
});

describe("buildMonthDays", () => {
  it("complete la grille en semaines pleines et marque les jours hors mois", () => {
    const days = buildMonthDays(2026, 9); // septembre 2026 : mardi 1 → mercredi 30
    expect(days.length % 7).toBe(0);
    expect(days[0].dateStr).toBe("2026-08-31");
    expect(days[0].inMonth).toBe(false);
    expect(days.filter((d) => d.inMonth).length).toBe(30);
    expect(days.at(-1)!.inMonth).toBe(false);
  });

  it("gere un mois qui commence un lundi (aucun jour de debordement en tete)", () => {
    const days = buildMonthDays(2026, 6); // juin 2026 commence un lundi
    expect(days[0].dateStr).toBe("2026-06-01");
    expect(days[0].inMonth).toBe(true);
  });
});

describe("groupByRoomAndDay", () => {
  const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).toISOString();

  it("regroupe par salle ET par jour, sans melanger deux salles du meme jour", () => {
    const map = groupByRoomAndDay([
      { room: { id: "A" }, startAt: at(2026, 9, 10, 9) },
      { room: { id: "B" }, startAt: at(2026, 9, 10, 9) },
      { room: { id: "A" }, startAt: at(2026, 9, 11, 9) },
    ]);
    expect(map.get("A|2026-09-10")).toHaveLength(1);
    expect(map.get("B|2026-09-10")).toHaveLength(1);
    expect(map.get("A|2026-09-11")).toHaveLength(1);
  });

  it("trie chaque cellule par heure de debut", () => {
    const map = groupByRoomAndDay([
      { room: { id: "A" }, startAt: at(2026, 9, 10, 18) },
      { room: { id: "A" }, startAt: at(2026, 9, 10, 9) },
      { room: { id: "A" }, startAt: at(2026, 9, 10, 14) },
    ]);
    expect(map.get("A|2026-09-10")!.map((r) => new Date(r.startAt).getHours())).toEqual([9, 14, 18]);
  });

  it("classe sur le jour LOCAL : 23h et 00h30 le lendemain sont deux cellules", () => {
    // Regression visee : `startAt.split("T")[0]` (date UTC) rangeait la reservation de
    // 00h30 la veille des que le fuseau local est en avance sur UTC.
    const map = groupByRoomAndDay([
      { room: { id: "A" }, startAt: at(2026, 9, 10, 23) },
      { room: { id: "A" }, startAt: at(2026, 9, 11, 0) },
    ]);
    expect(map.get("A|2026-09-10")).toHaveLength(1);
    expect(map.get("A|2026-09-11")).toHaveLength(1);
  });

  it("rend une Map vide sur une entree vide", () => {
    expect(groupByRoomAndDay([]).size).toBe(0);
  });
});

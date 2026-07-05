import { describe, it, expect } from "vitest";
import { weekBounds, shiftWeek, currentWeekMonday, buildWeekEventsQuery } from "../week";

describe("weekBounds", () => {
  it("returns Monday 00:00:00.000 to Sunday 23:59:59.999 for a mid-week date", () => {
    // Wednesday 8 July 2026
    const { start, end } = weekBounds(new Date(2026, 6, 8, 15, 30));
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(6); // July
    expect(start.getDate()).toBe(6); // Monday 6 July 2026
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);

    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(6);
    expect(end.getDate()).toBe(12); // Sunday 12 July 2026
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });

  it("returns the same week when ref is a Monday", () => {
    const { start, end } = weekBounds(new Date(2026, 6, 6));
    expect(start.getDate()).toBe(6);
    expect(end.getDate()).toBe(12);
  });

  it("returns the same week when ref is a Sunday", () => {
    const { start, end } = weekBounds(new Date(2026, 6, 12));
    expect(start.getDate()).toBe(6);
    expect(end.getDate()).toBe(12);
  });

  it("handles a month boundary crossing", () => {
    // Wednesday 29 July 2026 → week spans July/August
    const { start, end } = weekBounds(new Date(2026, 6, 29));
    expect(start.getMonth()).toBe(6); // July
    expect(start.getDate()).toBe(27);
    expect(end.getMonth()).toBe(7); // August
    expect(end.getDate()).toBe(2);
  });

  it("handles a year boundary crossing", () => {
    // Wednesday 30 December 2026 → week spans into January 2027
    const { start, end } = weekBounds(new Date(2026, 11, 30));
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(11);
    expect(start.getDate()).toBe(28);
    expect(end.getFullYear()).toBe(2027);
    expect(end.getMonth()).toBe(0);
    expect(end.getDate()).toBe(3);
  });
});

describe("shiftWeek", () => {
  it("returns the previous Monday", () => {
    expect(shiftWeek("2026-07-06", -1)).toBe("2026-06-29");
  });

  it("returns the next Monday", () => {
    expect(shiftWeek("2026-07-06", 1)).toBe("2026-07-13");
  });

  it("handles a year change forward", () => {
    expect(shiftWeek("2026-12-28", 1)).toBe("2027-01-04");
  });

  it("handles a year change backward", () => {
    expect(shiftWeek("2027-01-04", -1)).toBe("2026-12-28");
  });
});

describe("currentWeekMonday", () => {
  it("returns the ISO date of the Monday of the reference week", () => {
    expect(currentWeekMonday(new Date(2026, 6, 8))).toBe("2026-07-06");
  });
});

describe("buildWeekEventsQuery", () => {
  it("always scopes the query to the given churchId", () => {
    const query = buildWeekEventsQuery("church-1", new Date(2026, 6, 8));
    expect(query.where.churchId).toBe("church-1");
  });

  it("never leaks another church's events (churchId is always present, not optional)", () => {
    const query = buildWeekEventsQuery("church-2", new Date(2026, 6, 8));
    expect(query.where).toHaveProperty("churchId", "church-2");
    expect(Object.keys(query.where)).toContain("churchId");
  });

  it("scopes the date range to the week of the reference date", () => {
    const ref = new Date(2026, 6, 8);
    const query = buildWeekEventsQuery("church-1", ref);
    const { start, end } = weekBounds(ref);
    expect(query.where.date.gte).toEqual(start);
    expect(query.where.date.lte).toEqual(end);
    expect(query.where.date.gte.getTime()).toBeLessThan(query.where.date.lte.getTime());
  });

  it("orders results chronologically and selects the minimal fields", () => {
    const query = buildWeekEventsQuery("church-1", new Date(2026, 6, 8));
    expect(query.orderBy).toEqual({ date: "asc" });
    expect(query.select).toEqual({ id: true, title: true, type: true, date: true });
  });
});

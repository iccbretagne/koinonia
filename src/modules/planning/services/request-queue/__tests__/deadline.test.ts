import { describe, it, expect } from "vitest";
import { requestDeadline } from "../deadline";
import { eventChangeSummary } from "../event-change-summary";

const NOW = new Date("2026-10-10T10:00:00Z");

const announcement = (targets: string[], eventDate: string | null = null) => ({
  eventDate,
  targetEvents: targets.map((date) => ({ date: new Date(date) })),
});

describe("requestDeadline", () => {
  it("annonce : premier culte ciblé encore à venir, culte passé ignoré", () => {
    const d = requestDeadline(
      {
        type: "DIFFUSION_INTERNE",
        payload: {},
        announcement: announcement(["2026-10-04T08:00:00Z", "2026-10-18T08:00:00Z", "2026-10-11T08:00:00Z"]),
        event: null,
      },
      NOW
    );
    expect(d).toEqual({ date: "2026-10-11T08:00:00.000Z", kind: "culte" });
  });

  it("annonce : un culte du jour même compte encore", () => {
    const d = requestDeadline(
      { type: "RESEAUX_SOCIAUX", payload: {}, announcement: announcement(["2026-10-10T06:00:00Z"]), event: null },
      NOW
    );
    expect(d.kind).toBe("culte");
  });

  it("annonce sans culte à venir : date d'événement, sinon aucune", () => {
    expect(
      requestDeadline(
        { type: "DIFFUSION_INTERNE", payload: {}, announcement: announcement(["2026-10-04T08:00:00Z"], "2026-11-01T00:00:00Z"), event: null },
        NOW
      )
    ).toEqual({ date: "2026-11-01T00:00:00Z", kind: "event" });
    expect(requestDeadline({ type: "DIFFUSION_INTERNE", payload: {}, announcement: announcement([]), event: null }, NOW).kind).toBe("none");
  });

  it("visuel : date limite du brief, sinon celle de l'annonce", () => {
    expect(
      requestDeadline({ type: "VISUEL", payload: { deadline: "2026-10-15" }, announcement: announcement(["2026-10-11T08:00:00Z"]), event: null }, NOW)
    ).toEqual({ date: "2026-10-15", kind: "brief" });
    expect(
      requestDeadline({ type: "VISUEL", payload: { deadline: "" }, announcement: announcement(["2026-10-11T08:00:00Z"]), event: null }, NOW).kind
    ).toBe("culte");
    expect(requestDeadline({ type: "VISUEL", payload: {}, announcement: null, event: null }, NOW).kind).toBe("none");
  });

  it("ajout d'événement : date demandée", () => {
    expect(requestDeadline({ type: "AJOUT_EVENEMENT", payload: { eventDate: "2026-10-20T19:00" }, announcement: null, event: null }, NOW)).toEqual({
      date: "2026-10-20T19:00",
      kind: "event",
    });
  });

  it("modification ou annulation : date de l'événement visé", () => {
    const event = { date: new Date("2026-10-25T09:00:00Z"), planningDeadline: new Date("2026-10-20T00:00:00Z") };
    expect(requestDeadline({ type: "MODIFICATION_EVENEMENT", payload: {}, announcement: null, event }, NOW)).toEqual({
      date: "2026-10-25T09:00:00.000Z",
      kind: "event",
    });
    expect(requestDeadline({ type: "ANNULATION_EVENEMENT", payload: {}, announcement: null, event: null }, NOW).kind).toBe("none");
  });

  it("modification de planning : date limite de planification, sinon date de l'événement", () => {
    expect(
      requestDeadline(
        { type: "MODIFICATION_PLANNING", payload: {}, announcement: null, event: { date: "2026-10-25T09:00:00Z", planningDeadline: "2026-10-20T00:00:00Z" } },
        NOW
      )
    ).toEqual({ date: "2026-10-20T00:00:00Z", kind: "planning" });
    expect(
      requestDeadline(
        { type: "MODIFICATION_PLANNING", payload: {}, announcement: null, event: { date: "2026-10-25T09:00:00Z", planningDeadline: null } },
        NOW
      )
    ).toEqual({ date: "2026-10-25T09:00:00Z", kind: "event" });
  });

  it("demande d'accès : pas d'échéance", () => {
    expect(requestDeadline({ type: "DEMANDE_ACCES", payload: {}, announcement: null, event: null }, NOW)).toEqual({ date: null, kind: "none" });
  });
});

describe("eventChangeSummary", () => {
  const event = { title: "Culte", type: "CULTE", date: new Date("2026-10-25T09:00:00Z"), planningDeadline: null };

  it("liste les champs changés avec la valeur actuelle", () => {
    expect(eventChangeSummary({ title: "Culte de louange", date: "2026-10-26T09:00" }, event)).toEqual([
      { field: "title", label: "Titre", before: "Culte", after: "Culte de louange" },
      { field: "date", label: "Date", before: "2026-10-25T09:00:00.000Z", after: "2026-10-26T09:00" },
    ]);
  });

  it("ignore les champs vides sauf le retrait de la date limite", () => {
    expect(eventChangeSummary({ title: "", planningDeadline: null }, event)).toEqual([
      { field: "planningDeadline", label: "Date limite de planification", before: null, after: null },
    ]);
  });

  it("sans changements lisibles ni événement", () => {
    expect(eventChangeSummary(undefined, event)).toEqual([]);
    expect(eventChangeSummary({ type: "CONFERENCE" }, null)).toEqual([{ field: "type", label: "Type", before: null, after: "CONFERENCE" }]);
  });
});

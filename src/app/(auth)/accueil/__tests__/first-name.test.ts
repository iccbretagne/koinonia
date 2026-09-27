import { describe, it, expect } from "vitest";
import { pickFirstName } from "../first-name";

describe("pickFirstName", () => {
  it("garde le premier mot d'un nom « Prénom Nom »", () => {
    expect(pickFirstName("Marie Kouassi")).toBe("Marie");
  });

  it("écarte un nom de famille en capitales placé en tête", () => {
    expect(pickFirstName("OUATTARA Ismaël")).toBe("Ismaël");
    expect(pickFirstName("KOUASSI Marie-Claire")).toBe("Marie-Claire");
  });

  it("garde le seul mot, même en capitales", () => {
    expect(pickFirstName("MARIE")).toBe("MARIE");
  });

  it("renvoie null pour un nom vide ou absent", () => {
    expect(pickFirstName("  ")).toBeNull();
    expect(pickFirstName(null)).toBeNull();
    expect(pickFirstName(undefined)).toBeNull();
  });
});

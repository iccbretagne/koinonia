import { describe, it, expect } from "vitest";
import { roomsModule } from "./index";

describe("roomsModule.permissions — STAR (spec 031, issue #463)", () => {
  it("n'accorde ni rooms:view ni rooms:reserve au STAR", () => {
    expect(roomsModule.permissions?.["rooms:view"]).not.toContain("STAR");
    expect(roomsModule.permissions?.["rooms:reserve"]).not.toContain("STAR");
  });

  it("conserve rooms:view et rooms:reserve pour les responsables", () => {
    for (const perm of ["rooms:view", "rooms:reserve"] as const) {
      const grantees = roomsModule.permissions?.[perm];
      expect(grantees).toContain("SUPER_ADMIN");
      expect(grantees).toContain("ADMIN");
      expect(grantees).toContain("MINISTER");
      expect(grantees).toContain("DEPARTMENT_HEAD");
    }
  });
});

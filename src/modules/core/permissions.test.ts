import { describe, it, expect } from "vitest";
import { coreModule } from "./index";

describe("coreModule.permissions — access:manage (spec 031, issue #467)", () => {
  it("accorde access:manage à Super Admin/Admin/Secrétaire/Ministre, pas au-delà", () => {
    const grantees = coreModule.permissions?.["access:manage"];
    expect(grantees).toEqual(
      expect.arrayContaining(["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER"])
    );
    expect(grantees).toHaveLength(4);
  });
});

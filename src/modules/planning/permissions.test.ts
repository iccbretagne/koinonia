import { describe, it, expect } from "vitest";
import { planningModule } from "./index";

describe("planningModule.permissions — absences:manage", () => {
  it("accorde absences:manage au Secrétaire, en plus de Super Admin/Admin/Ministre/Resp. département", () => {
    const managers = planningModule.permissions?.["absences:manage"];
    expect(managers).toContain("SECRETARY");
    expect(managers).toContain("SUPER_ADMIN");
    expect(managers).toContain("ADMIN");
    expect(managers).toContain("MINISTER");
    expect(managers).toContain("DEPARTMENT_HEAD");
  });
});

describe("planningModule.permissions — planning:department (spec 031, issue #462)", () => {
  it("n'accorde PAS planning:department au STAR", () => {
    expect(planningModule.permissions?.["planning:department"]).not.toContain("STAR");
  });

  it("accorde planning:department à Super Admin/Admin/Secrétaire/Ministre/Resp. département", () => {
    const grantees = planningModule.permissions?.["planning:department"];
    expect(grantees).toContain("SUPER_ADMIN");
    expect(grantees).toContain("ADMIN");
    expect(grantees).toContain("SECRETARY");
    expect(grantees).toContain("MINISTER");
    expect(grantees).toContain("DEPARTMENT_HEAD");
  });

  it("conserve planning:view au STAR — Mon planning, absences et agenda inchangés", () => {
    expect(planningModule.permissions?.["planning:view"]).toContain("STAR");
  });
});

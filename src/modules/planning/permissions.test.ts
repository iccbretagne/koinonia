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

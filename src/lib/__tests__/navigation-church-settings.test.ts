import { describe, it, expect } from "vitest";
import { buildSpaces } from "../navigation";
import { paths } from "../paths";

describe("navigation — paramètres de l'église (spec 092, lot 4)", () => {
  it("le lien vers /admin/eglise/<id> est rangé dans le bloc « Église »", () => {
    const href = paths.admin.church("c1");
    const spaces = buildSpaces({ departments: [], configLinks: [{ href, label: "Paramètres de l'église" }], requestLinks: [], mediaLinks: [], homeHref: "/accueil" });
    const page = spaces.flatMap((s) => s.pages).find((p) => p.href === href);
    expect(page?.sidebarBlock).toBe("Église");
  });
});

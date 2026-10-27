import { describe, it, expect } from "vitest";
import { isPublicRoute, resolveRouteOwner } from "../module-routes";

describe("page d'installation (spec 070)", () => {
  it("/installer est publique et rattachée au module core", () => {
    expect(isPublicRoute("/installer", "GET")).toBe(true);
    expect(resolveRouteOwner("/installer")).toMatchObject({ kind: "module", owner: "core" });
  });
});

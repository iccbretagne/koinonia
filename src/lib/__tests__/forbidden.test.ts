import { describe, it, expect, vi, afterEach } from "vitest";
import { errorResponse } from "@/lib/api-utils";

const forbiddenImpl = vi.fn();
vi.mock("next/navigation", () => ({ forbidden: () => forbiddenImpl() }));

const { forbiddenError, isForbiddenError } = await import("../forbidden");

describe("forbiddenError", () => {
  afterEach(() => forbiddenImpl.mockReset());

  it("porte le digest de forbidden() (403 + forbidden.tsx dans une page)", () => {
    forbiddenImpl.mockImplementation(() => {
      throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;403"), { digest: "NEXT_HTTP_ERROR_FALLBACK;403" });
    });
    const error = forbiddenError() as Error & { digest?: string };
    expect(error.message).toBe("FORBIDDEN");
    expect(error.digest).toBe("NEXT_HTTP_ERROR_FALLBACK;403");
    expect(isForbiddenError(error)).toBe(true);
  });

  it("authInterrupts coupé (forbidden() refuse) : simple FORBIDDEN", () => {
    forbiddenImpl.mockImplementation(() => {
      throw new Error("`forbidden()` is experimental");
    });
    const error = forbiddenError() as Error & { digest?: string };
    expect(error.message).toBe("FORBIDDEN");
    expect(error.digest).toBeUndefined();
  });

  it("route API : toujours un 403 JSON", async () => {
    forbiddenImpl.mockImplementation(() => {
      throw Object.assign(new Error("x"), { digest: "NEXT_HTTP_ERROR_FALLBACK;403" });
    });
    const res = errorResponse(forbiddenError());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Insufficient permissions" });
  });
});

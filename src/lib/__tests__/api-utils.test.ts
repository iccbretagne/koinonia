import { describe, it, expect, vi } from "vitest";
import { ApiError, successResponse, errorResponse } from "../api-utils";
import { z } from "zod";

describe("ApiError", () => {
  it("creates an error with statusCode and message", () => {
    const error = new ApiError(404, "Not found");
    expect(error).toBeInstanceOf(Error);
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe("Not found");
    expect(error.name).toBe("ApiError");
  });
});

describe("successResponse", () => {
  it("returns JSON with status 200 by default", async () => {
    const res = successResponse({ id: "1", name: "Test" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ id: "1", name: "Test" });
  });

  it("accepts a custom status code", async () => {
    const res = successResponse({ created: true }, 201);
    expect(res.status).toBe(201);
  });

  it("handles arrays", async () => {
    const res = successResponse([1, 2, 3]);
    const body = await res.json();
    expect(body).toEqual([1, 2, 3]);
  });
});

describe("errorResponse", () => {
  it("handles ApiError with custom status", async () => {
    const res = errorResponse(new ApiError(422, "Validation failed"));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toEqual({ error: "Validation failed" });
  });

  it("handles UNAUTHORIZED error", async () => {
    const res = errorResponse(new Error("UNAUTHORIZED"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Not authenticated" });
  });

  it("handles FORBIDDEN error", async () => {
    const res = errorResponse(new Error("FORBIDDEN"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Insufficient permissions" });
  });

  it("handles generic Error as 500", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = errorResponse(new Error("Something broke"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Server error" });
    consoleSpy.mockRestore();
  });

  it("handles non-Error values as 500", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = errorResponse("string error");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Server error" });
    consoleSpy.mockRestore();
  });
});

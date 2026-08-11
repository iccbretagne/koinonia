import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({
  default: () => ({
    auth: vi.fn(),
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

const { isDevLoginEnabled } = await import("@/lib/auth");

describe("isDevLoginEnabled — garde de la connexion développement", () => {
  it("est désactivée quand AUTH_DEV_LOGIN est absent", () => {
    expect(isDevLoginEnabled({ AUTH_DEV_LOGIN: undefined, NODE_ENV: "development" })).toBe(false);
  });

  it("est désactivée quand AUTH_DEV_LOGIN vaut \"false\"", () => {
    expect(isDevLoginEnabled({ AUTH_DEV_LOGIN: "false", NODE_ENV: "development" })).toBe(false);
  });

  it("est désactivée en production, même si AUTH_DEV_LOGIN=true", () => {
    expect(isDevLoginEnabled({ AUTH_DEV_LOGIN: "true", NODE_ENV: "production" })).toBe(false);
  });

  it("est activée uniquement quand les deux conditions dev sont réunies", () => {
    expect(isDevLoginEnabled({ AUTH_DEV_LOGIN: "true", NODE_ENV: "development" })).toBe(true);
    expect(isDevLoginEnabled({ AUTH_DEV_LOGIN: "true", NODE_ENV: "test" })).toBe(true);
    expect(isDevLoginEnabled({ AUTH_DEV_LOGIN: "true", NODE_ENV: undefined })).toBe(true);
  });
});

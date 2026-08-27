import { randomBytes } from "crypto";

export function generateToken(): string {
  return randomBytes(32).toString("hex"); // 64 chars
}

export function isTokenExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return new Date() > expiresAt;
}

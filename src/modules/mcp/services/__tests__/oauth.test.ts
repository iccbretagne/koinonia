/**
 * Tests — serveur d'autorisation OAuth des assistants IA (spec 081, ADR-0029).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/registry", () => ({ registry: { has: () => true } }));

const { isAcceptableRedirectUri, registerClient } = await import("../clients");
const { validateAuthorizationRequest, createAuthorization, UntrustedRedirectError } = await import("../authorize");
const { exchangeCode, refreshTokens, revokeByToken } = await import("../token-exchange");
const { verifyAccessToken } = await import("../verify");
const { hashToken, verifyPkce } = await import("../tokens");
const { OAuthError } = await import("../errors");

process.env.APP_URL = "https://koinonia.test";
const RESOURCE = "https://koinonia.test/api/mcp/server";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const VERIFIER = "v".repeat(43) + "erifier-0123456789";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");
const future = () => new Date(Date.now() + 60_000);
const past = () => new Date(Date.now() - 60_000);

function enabled(on = true) {
  prismaMock.mcpSettings.findUnique.mockResolvedValue({ enabled: on });
  prismaMock.mcpChurchSettings.findUnique.mockResolvedValue({ enabled: on });
}

beforeEach(() => {
  vi.clearAllMocks();
  enabled();
  prismaMock.userChurchRole.findFirst.mockResolvedValue({ id: "r" });
  prismaMock.mcpClient.findUnique.mockResolvedValue({ clientId: "kmcp_1", name: "Claude", redirectUris: [REDIRECT] });
  prismaMock.mcpToken.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.mcpToken.createMany.mockResolvedValue({ count: 2 });
});

describe("PKCE et jetons", () => {
  it("S256 : le bon vérificateur passe, un autre échoue, un vérificateur trop court est refusé", () => {
    expect(verifyPkce(VERIFIER, CHALLENGE)).toBe(true);
    expect(verifyPkce(VERIFIER + "x", CHALLENGE)).toBe(false);
    expect(verifyPkce("court", createHash("sha256").update("court").digest("base64url"))).toBe(false);
  });
});

describe("enregistrement des clients", () => {
  it("adresses de redirection : https ou boucle locale, sans fragment ni identifiants", () => {
    expect(isAcceptableRedirectUri("https://claude.ai/cb")).toBe(true);
    expect(isAcceptableRedirectUri("http://localhost:6274/cb")).toBe(true);
    expect(isAcceptableRedirectUri("http://127.0.0.1/cb")).toBe(true);
    expect(isAcceptableRedirectUri("http://evil.example/cb")).toBe(false);
    expect(isAcceptableRedirectUri("https://a.example/cb#x")).toBe(false);
    expect(isAcceptableRedirectUri("https://user:pw@a.example/cb")).toBe(false);
    expect(isAcceptableRedirectUri("javascript:alert(1)")).toBe(false);
  });

  it("refuse un client sans adresse valide, sans rien écrire", async () => {
    await expect(registerClient({ redirectUris: ["http://evil.example/cb"] })).rejects.toBeInstanceOf(OAuthError);
    await expect(registerClient({ redirectUris: [] })).rejects.toBeInstanceOf(OAuthError);
    expect(prismaMock.mcpClient.create).not.toHaveBeenCalled();
  });
});

describe("demande d'autorisation", () => {
  const base = { clientId: "kmcp_1", redirectUri: REDIRECT, responseType: "code", codeChallenge: CHALLENGE, codeChallengeMethod: "S256", resource: RESOURCE };

  it("client inconnu ou adresse non enregistrée : jamais de redirection vers le client", async () => {
    prismaMock.mcpClient.findUnique.mockResolvedValueOnce(null);
    await expect(validateAuthorizationRequest(base)).rejects.toBeInstanceOf(UntrustedRedirectError);
    await expect(validateAuthorizationRequest({ ...base, redirectUri: "https://autre.example/cb" })).rejects.toBeInstanceOf(UntrustedRedirectError);
  });

  it("PKCE S256 obligatoire, ressource et portée vérifiées", async () => {
    await expect(validateAuthorizationRequest({ ...base, codeChallengeMethod: "plain" })).rejects.toMatchObject({ error: "invalid_request" });
    await expect(validateAuthorizationRequest({ ...base, resource: "https://ailleurs.example/mcp" })).rejects.toMatchObject({ error: "invalid_target" });
    await expect(validateAuthorizationRequest({ ...base, scope: "write" })).rejects.toMatchObject({ error: "invalid_scope" });
    await expect(validateAuthorizationRequest(base)).resolves.toMatchObject({ scope: "read" });
  });

  it("autoriser : fonction coupée ou compte sans rôle dans l'église ⇒ refus, aucun code", async () => {
    const req = await validateAuthorizationRequest(base);
    enabled(false);
    await expect(createAuthorization("u1", "c1", req)).rejects.toMatchObject({ error: "access_denied" });
    enabled();
    prismaMock.userChurchRole.findFirst.mockResolvedValueOnce(null);
    await expect(createAuthorization("u1", "c2", req)).rejects.toMatchObject({ error: "access_denied" });
    expect(prismaMock.mcpToken.create).not.toHaveBeenCalled();
  });

  it("autoriser : connexion créée et code à usage unique, empreinte seule stockée", async () => {
    const req = await validateAuthorizationRequest(base);
    prismaMock.mcpClient.findUniqueOrThrow.mockResolvedValue({ id: "client-row" });
    prismaMock.mcpGrant.findFirst.mockResolvedValue(null);
    prismaMock.mcpGrant.create.mockResolvedValue({ id: "g1" });
    const code = await createAuthorization("u1", "c1", req);
    const data = prismaMock.mcpToken.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ grantId: "g1", kind: "CODE", codeChallenge: CHALLENGE, redirectUri: REDIRECT });
    expect(data.hash).toBe(hashToken(code));
    expect(JSON.stringify(data)).not.toContain(code);
  });
});

describe("échange de code", () => {
  const codeRow = (over: Record<string, unknown> = {}) => ({
    id: "t1",
    kind: "CODE",
    grantId: "g1",
    usedAt: null,
    expiresAt: future(),
    redirectUri: REDIRECT,
    codeChallenge: CHALLENGE,
    grant: { id: "g1", userId: "u1", churchId: "c1", scope: "read", revokedAt: null, client: { clientId: "kmcp_1" } },
    ...over,
  });
  const input = { code: "kmc_x", codeVerifier: VERIFIER, redirectUri: REDIRECT, clientId: "kmcp_1", resource: RESOURCE };

  it("succès : jetons d'accès et de rafraîchissement, code consommé", async () => {
    prismaMock.mcpToken.findUnique.mockResolvedValue(codeRow());
    const out = await exchangeCode(input);
    expect(out).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "read" });
    expect(out.access_token.startsWith("kma_")).toBe(true);
    expect(prismaMock.mcpToken.updateMany).toHaveBeenCalledWith({ where: { id: "t1", usedAt: null }, data: { usedAt: expect.any(Date) } });
  });

  it.each([
    ["mauvais vérificateur PKCE", {}, { codeVerifier: "w".repeat(50) }],
    ["autre adresse de retour", {}, { redirectUri: "https://claude.ai/autre" }],
    ["autre client", {}, { clientId: "kmcp_2" }],
    ["code expiré", { expiresAt: past() }, {}],
    ["connexion révoquée", { grant: { ...codeRow().grant, revokedAt: new Date() } }, {}],
  ])("refus : %s", async (_label, row, over) => {
    prismaMock.mcpToken.findUnique.mockResolvedValue(codeRow(row));
    await expect(exchangeCode({ ...input, ...over })).rejects.toMatchObject({ error: "invalid_grant" });
    expect(prismaMock.mcpToken.createMany).not.toHaveBeenCalled();
  });

  it("code rejoué : refus et révocation de toute la connexion", async () => {
    prismaMock.mcpToken.findUnique.mockResolvedValue(codeRow({ usedAt: new Date() }));
    await expect(exchangeCode(input)).rejects.toMatchObject({ error: "invalid_grant" });
    expect(prismaMock.mcpGrant.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "g1", revokedAt: null } }));
    expect(prismaMock.mcpToken.deleteMany).toHaveBeenCalledWith({ where: { grantId: "g1" } });
  });

  it("ressource étrangère : invalid_target", async () => {
    await expect(exchangeCode({ ...input, resource: "https://ailleurs.example" })).rejects.toMatchObject({ error: "invalid_target" });
  });
});

describe("rafraîchissement", () => {
  const refreshRow = (over: Record<string, unknown> = {}) => ({
    id: "r1",
    kind: "REFRESH",
    grantId: "g1",
    usedAt: null,
    expiresAt: future(),
    grant: { id: "g1", userId: "u1", churchId: "c1", scope: "read", revokedAt: null, client: { clientId: "kmcp_1" } },
    ...over,
  });

  it("rotation : nouveaux jetons, ancien consommé", async () => {
    prismaMock.mcpToken.findUnique.mockResolvedValue(refreshRow());
    const out = await refreshTokens({ refreshToken: "kmr_x", clientId: "kmcp_1" });
    expect(out.refresh_token.startsWith("kmr_")).toBe(true);
    expect(prismaMock.mcpToken.createMany).toHaveBeenCalled();
  });

  it("refresh déjà utilisé (vol probable) : révocation de la connexion", async () => {
    prismaMock.mcpToken.findUnique.mockResolvedValue(refreshRow({ usedAt: new Date() }));
    await expect(refreshTokens({ refreshToken: "kmr_x", clientId: "kmcp_1" })).rejects.toMatchObject({ error: "invalid_grant" });
    expect(prismaMock.mcpGrant.updateMany).toHaveBeenCalled();
  });

  it("fonction coupée ou compte sorti de l'église : refus", async () => {
    prismaMock.mcpToken.findUnique.mockResolvedValue(refreshRow());
    enabled(false);
    await expect(refreshTokens({ refreshToken: "kmr_x", clientId: "kmcp_1" })).rejects.toMatchObject({ error: "invalid_grant" });
    enabled();
    prismaMock.userChurchRole.findFirst.mockResolvedValueOnce(null);
    await expect(refreshTokens({ refreshToken: "kmr_x", clientId: "kmcp_1" })).rejects.toMatchObject({ error: "invalid_grant" });
  });

  it("révocation par le client : toute la connexion, réponse silencieuse si inconnu", async () => {
    prismaMock.mcpToken.findUnique.mockResolvedValueOnce(null);
    await expect(revokeByToken("kma_inconnu", "kmcp_1")).resolves.toBeUndefined();
    prismaMock.mcpToken.findUnique.mockResolvedValueOnce({ grantId: "g1", grant: { client: { clientId: "kmcp_1" } } });
    await revokeByToken("kma_x", "kmcp_1");
    expect(prismaMock.mcpToken.deleteMany).toHaveBeenCalledWith({ where: { grantId: "g1" } });
  });
});

describe("vérification d'un jeton d'accès", () => {
  const accessRow = (over: Record<string, unknown> = {}) => ({
    kind: "ACCESS",
    expiresAt: future(),
    grant: { id: "g1", userId: "u1", churchId: "c1", scope: "read", revokedAt: null, lastUsedAt: null },
    ...over,
  });

  it("valide : appelant (compte + église), dernière utilisation notée", async () => {
    prismaMock.mcpToken.findUnique.mockResolvedValue(accessRow());
    await expect(verifyAccessToken("kma_ok")).resolves.toEqual({ grantId: "g1", userId: "u1", churchId: "c1", scope: "read" });
    expect(prismaMock.mcpGrant.update).toHaveBeenCalled();
  });

  it("refus sans indice : mauvais préfixe, expiré, révoqué, fonction coupée, compte sorti", async () => {
    expect(await verifyAccessToken("kmr_refresh")).toBeNull();
    prismaMock.mcpToken.findUnique.mockResolvedValueOnce(accessRow({ expiresAt: past() }));
    expect(await verifyAccessToken("kma_a")).toBeNull();
    prismaMock.mcpToken.findUnique.mockResolvedValueOnce(accessRow({ grant: { ...accessRow().grant, revokedAt: new Date() } }));
    expect(await verifyAccessToken("kma_b")).toBeNull();
    prismaMock.mcpToken.findUnique.mockResolvedValue(accessRow());
    enabled(false);
    expect(await verifyAccessToken("kma_c")).toBeNull();
    enabled();
    prismaMock.userChurchRole.findFirst.mockResolvedValueOnce(null);
    expect(await verifyAccessToken("kma_d")).toBeNull();
  });
});

import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { fullRouteTable } from "@/lib/module-routes";
import { isRawBody, type Access, type Contract, type HttpMethod, type Operation } from "./contract";

/**
 * Assemble le document OpenAPI de Koinonia à partir des contrats des routes (ADR-0023).
 * Le module propriétaire de chaque adresse (manifestes, ADR-0012) devient son tag.
 */

export interface ContractEntry {
  /** Adresse de la route, segments dynamiques entre crochets (`/api/members/[id]`). */
  readonly path: string;
  readonly contract: Contract;
}

// Ajoute `.openapi()` au prototype de zod, requis par le générateur pour les paramètres.
extendZodWithOpenApi(z);

const METHODS: readonly HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const ACCESS_LABEL: Record<Exclude<Access, `${string}:${string}`>, string> = {
  public: "public, sans session",
  session: "toute personne connectée",
  superAdmin: "Super Admin",
  cron: "tâche planifiée (`Authorization: Bearer $CRON_SECRET`)",
  token: "jeton de partage dans l'adresse",
};

function accessLabel(access: Access): string {
  return access in ACCESS_LABEL ? ACCESS_LABEL[access as keyof typeof ACCESS_LABEL] : `permission \`${access}\``;
}

/** Nom du paramètre d'un segment dynamique (`[id]` → `id`, `[...nextauth]` → `nextauth`), sinon `null`. */
function paramName(segment: string): string | null {
  if (!segment.startsWith("[") || !segment.endsWith("]")) return null;
  const inner = segment.slice(1, -1);
  return inner.startsWith("...") ? inner.slice(3) : inner;
}

/** `/api/members/[id]` → `/api/members/{id}` ; `[...nextauth]` → `{nextauth}`. */
export function toOpenApiPath(path: string): string {
  return path
    .split("/")
    .map((segment) => {
      const name = paramName(segment);
      return name === null ? segment : `{${name}}`;
    })
    .join("/");
}

function pathParams(path: string) {
  const names = path.split("/").map(paramName).filter((name): name is string => name !== null);
  if (names.length === 0) return undefined;
  return z.object(Object.fromEntries(names.map((n) => [n, z.string()])));
}

function security(access: Access) {
  if (access === "public" || access === "token") return [];
  if (access === "cron") return [{ cron: [] }];
  return [{ session: [] }];
}

function description(op: Operation): string {
  const note = op.accessNote ? ` — ${op.accessNote}` : "";
  const lines = [`**Accès** : ${accessLabel(op.access)}${note}.`];
  if (op.description) lines.push("", op.description);
  return lines.join("\n");
}

function requestBody(op: Operation) {
  if (!op.body) return undefined;
  if (isRawBody(op.body)) {
    return {
      description: op.body.description,
      content: { [op.body.contentType]: { schema: { type: "string" as const, format: "binary" } } },
    };
  }
  return { content: { "application/json": { schema: op.body } } };
}

const NO_CONTENT_STATUSES = new Set([204, 302, 307]);

function responses(op: Operation) {
  const status = op.status ?? 200;
  const success = NO_CONTENT_STATUSES.has(status)
    ? { description: op.response }
    : { description: op.response, content: { [op.responseType ?? "application/json"]: { schema: {} } } };
  const needsSession = op.access !== "public" && op.access !== "token";
  return {
    [status]: success,
    ...(needsSession ? { 401: { description: "Session absente" }, 403: { description: "Accès refusé" } } : {}),
    ...(op.body && !isRawBody(op.body) ? { 400: { description: "Corps invalide (détail Zod dans `details`)" } } : {}),
  };
}

function registerOperation(registry: OpenAPIRegistry, path: string, owner: string, method: HttpMethod, op: Operation) {
  const params = pathParams(path);
  const body = requestBody(op);
  registry.registerPath({
    method: method.toLowerCase() as Lowercase<HttpMethod>,
    path: toOpenApiPath(path),
    tags: [owner],
    summary: op.summary,
    description: description(op),
    security: security(op.access),
    request: {
      ...(params ? { params } : {}),
      ...(op.query ? { query: op.query } : {}),
      ...(body ? { body } : {}),
    },
    responses: responses(op),
    "x-access": op.access,
  });
}

export function buildOpenApiDocument(entries: readonly ContractEntry[], version: string) {
  const registry = new OpenAPIRegistry();
  registry.registerComponent("securitySchemes", "session", {
    type: "apiKey",
    in: "cookie",
    name: "authjs.session-token",
    description: "Session NextAuth (`__Secure-authjs.session-token` en HTTPS).",
  });
  registry.registerComponent("securitySchemes", "cron", { type: "http", scheme: "bearer" });

  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  for (const { path, contract } of sorted) {
    const owner = fullRouteTable.resolve(path).owner ?? "noyau";
    for (const method of METHODS) {
      const op = contract[method];
      if (op) registerOperation(registry, path, owner, method, op);
    }
  }

  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: "3.0.3",
    info: {
      title: "API Koinonia",
      version,
      description:
        "API interne de Koinonia, appelée par l'application (session NextAuth, même origine). " +
        "Générée depuis les contrats `contract.ts` des routes — voir `docs/api.md` (conventions) et ADR-0023.",
    },
  });
}

import type { ZodType, ZodObject, ZodRawShape } from "zod";

/**
 * Contrat d'une route API (ADR-0023) : ce que la route attend et qui peut l'appeler, déclaré
 * dans un `contract.ts` à côté de son `route.ts`. Module **pur** (zod seul) : le générateur
 * OpenAPI et son test le chargent sans Prisma, NextAuth ni S3.
 *
 * Les schémas de corps déclarés ici sont ceux que la route valide (elle les importe) : la
 * documentation ne peut pas diverger de la validation. Les paramètres de requête sont décrits
 * ici même quand la route les lit à la main.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Qui peut appeler la route :
 * - `public` : sans session (déclaré aussi dans `routes.public` du manifeste) ;
 * - `session` : toute personne connectée ;
 * - `superAdmin` : administration de la plateforme ;
 * - `cron` : jeton `CRON_SECRET` ;
 * - `token` : jeton de partage dans l'adresse ;
 * - une permission (`members:manage`), vérifiée dans l'église visée.
 */
export type Access = "public" | "session" | "superAdmin" | "cron" | "token" | `${string}:${string}`;

/** Corps non JSON (téléversement, formulaire) : décrit en prose. */
export interface RawBody {
  readonly contentType: string;
  readonly description: string;
}

export interface Operation {
  /** Une ligne, à l'impératif ou au nominatif (« Liste des STAR d'une église »). */
  readonly summary: string;
  /** Règles métier : périmètre, effets de bord, notifications, erreurs notables. */
  readonly description?: string;
  readonly access: Access;
  /** Précision sur l'accès (périmètre, passe-droit d'une équipe…). */
  readonly accessNote?: string;
  readonly query?: ZodObject<ZodRawShape>;
  readonly body?: ZodType | RawBody;
  /** Réponse en cas de succès, en prose (ex. « Liste des STAR, départements inclus »). */
  readonly response: string;
  /** Statut de succès s'il n'est pas 200. */
  readonly status?: 201 | 204 | 302 | 307;
  /** Type de contenu de la réponse s'il n'est pas JSON (export, fichier). */
  readonly responseType?: string;
}

export type Contract = Partial<Record<HttpMethod, Operation>>;

export function defineContract<const C extends Contract>(contract: C): C {
  return contract;
}

export function isRawBody(body: ZodType | RawBody): body is RawBody {
  return typeof (body as RawBody).contentType === "string";
}

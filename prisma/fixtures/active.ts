import { existsSync, readFileSync } from "node:fs";
import { DEV_CHURCHES, DEV_MINISTRIES, DEV_DEPARTMENTS } from "./dev-structure";
import type { DevChurchDef, DevMinistryDef, DevDepartmentDef } from "./dev-structure";
import { DEV_USERS } from "./dev-users";
import type { DevUserDef } from "./dev-users";

/**
 * Fixture active du seed : la structure fictive de développement par défaut, ou
 * une structure réelle chargée depuis un fichier.
 *
 * `seed-dev.ts` génère le même contenu métier (membres, plannings, absences,
 * salles, comptes rendus…) quelle que soit la fixture : seuls changent le
 * squelette — églises, ministères, départements — et les comptes. Cela permet de
 * monter un environnement de FORMATION sur la structure réelle et les comptes
 * réels des participants, sans dupliquer 700 lignes de génération.
 *
 * Par défaut : les fixtures `dev-*`, entièrement fictives, versionnées.
 * Avec `SEED_FIXTURE_FILE=<chemin.json>` : le fichier indiqué, produit par
 * `prisma/scripts/build-training-fixture.ts` à partir d'un export de
 * configuration. Ce fichier contient des emails réels et n'est jamais commité.
 *
 * Le format JSON plutôt qu'un module TypeScript est délibéré : une fixture
 * générée et non versionnée ne doit pas être une dépendance de compilation, sans
 * quoi `npm run typecheck` échouerait partout où elle est absente — c'est-à-dire
 * en CI et chez tous les contributeurs.
 */

interface FixtureFile {
  _meta?: Record<string, unknown>;
  churches: DevChurchDef[];
  ministries: DevMinistryDef[];
  departments: DevDepartmentDef[];
  users: DevUserDef[];
}

function loadFixtureFile(path: string): FixtureFile {
  if (!existsSync(path)) {
    throw new Error(
      `SEED_FIXTURE_FILE pointe sur « ${path} », qui n'existe pas.\n` +
        `Générer la fixture depuis un export de configuration :\n` +
        `  npx tsx prisma/scripts/build-training-fixture.ts <export.json>`
    );
  }

  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<FixtureFile>;

  // Une fixture tronquée produirait un seed silencieusement vide : on préfère
  // échouer ici, avec le nom du fichier fautif.
  for (const key of ["churches", "ministries", "departments", "users"] as const) {
    if (!Array.isArray(parsed[key]) || parsed[key]!.length === 0) {
      throw new Error(`Fixture « ${path} » invalide : « ${key} » absent ou vide.`);
    }
  }

  return parsed as FixtureFile;
}

const fixturePath = process.env.SEED_FIXTURE_FILE;
const fixture: FixtureFile | null = fixturePath ? loadFixtureFile(fixturePath) : null;

export const IS_REAL_STRUCTURE = fixture !== null;

export const CHURCHES: DevChurchDef[] = fixture?.churches ?? DEV_CHURCHES;
export const MINISTRIES: DevMinistryDef[] = fixture?.ministries ?? DEV_MINISTRIES;
export const DEPARTMENTS: DevDepartmentDef[] = fixture?.departments ?? DEV_DEPARTMENTS;
export const USERS: DevUserDef[] = fixture?.users ?? DEV_USERS;

if (fixture) {
  console.log(
    `Fixture : ${fixturePath} — ${CHURCHES.length} église(s), ${MINISTRIES.length} ministère(s), ` +
      `${DEPARTMENTS.length} département(s), ${USERS.length} rôle(s).`
  );
}

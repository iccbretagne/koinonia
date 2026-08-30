import { readFileSync, writeFileSync } from "node:fs";

/**
 * Convertit un export de configuration Koinonia (Administration → Sauvegardes →
 * « Exporter la configuration ») en fixture consommable par le seed.
 *
 * Objectif : monter un environnement de FORMATION où les participants retrouvent
 * leur structure et leur propre compte — mais où aucune donnée métier réelle
 * n'apparaît. On ne reprend donc de l'export que :
 *
 *   - les églises (nom, slug, couleur)
 *   - les ministères et départements (nom, fonction système)
 *   - les comptes et leurs rôles, avec leur périmètre (ministère, départements)
 *
 * Ce qui est dans l'export mais **volontairement ignoré** :
 *
 *   - `members` : les fiches membres réelles (nom, prénom, email, téléphone).
 *     Le seed en fabrique à la place — c'est l'arbitrage « structure réelle,
 *     contenu fabriqué ».
 *   - `userLinks` : les liaisons membre ↔ compte, qui ne veulent plus rien dire
 *     une fois les membres fabriqués. Le seed recrée les liaisons utiles.
 *   - `secretariatEmail` / `accountingEmail` : adresses de notification réelles,
 *     qu'on ne veut surtout pas voir servir depuis un environnement de formation.
 *
 * Limite connue : l'export ne porte pas `isDeputy` (il ne donne que
 * `departmentIds`). Les binômes responsable/adjoint réels ne peuvent donc pas
 * être rejoués ; le seed fabrique des adjoints à la place.
 *
 * Usage :
 *   npx tsx prisma/scripts/build-training-fixture.ts <export.json> [sortie.json]
 */

interface ConfigExport {
  _meta: { exportedAt: string; categories: string[] };
  churches: {
    id: string;
    name: string;
    slug: string;
    primaryColor?: string | null;
    ministries: {
      id: string;
      name: string;
      isSystem: boolean;
      departments: { id: string; name: string; isSystem: boolean; function?: string | null }[];
    }[];
    userRoles: {
      userEmail: string;
      role: string;
      ministryId?: string | null;
      departmentIds?: string[];
    }[];
  }[];
}

/** Transforme un libellé en clé stable, indépendante des identifiants de production. */
function slugify(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Nom d'affichage déduit de l'adresse email, faute de mieux : l'export de
 * configuration ne porte pas le nom des comptes (il ne contient que `userEmail`).
 * Le vrai nom sera renseigné par Google à la première connexion du participant —
 * ce libellé n'est qu'un repère en attendant.
 */
function nameFromEmail(email: string): string {
  return email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

const [, , inputPath, outputPath = "prisma/fixtures/training-real.json"] = process.argv;
if (!inputPath) {
  console.error("Usage : npx tsx prisma/scripts/build-training-fixture.ts <export.json> [sortie.json]");
  process.exit(1);
}

const data: ConfigExport = JSON.parse(readFileSync(inputPath, "utf8"));

const churches: { key: string; name: string; slug: string; primaryColor: string }[] = [];
const ministries: { key: string; churchKey: string; name: string }[] = [];
const departments: { key: string; ministryKey: string; name: string; function?: string }[] = [];
const users: {
  key: string;
  email: string;
  name: string;
  displayName: string;
  role: string;
  churchKey: string;
  ministryKey?: string;
  departmentKeys?: string[];
}[] = [];

// Un compte peut porter plusieurs rôles dans la même église : chaque rôle donne
// une entrée distincte, comme dans `user_church_roles`.
const seenUserKeys = new Set<string>();

for (const church of data.churches) {
  const churchKey = slugify(church.name);
  churches.push({
    key: churchKey,
    name: church.name,
    slug: church.slug,
    primaryColor: church.primaryColor ?? "#5E17EB",
  });

  const ministryKeyById = new Map<string, string>();
  const departmentKeyById = new Map<string, string>();

  for (const ministry of church.ministries) {
    const ministryKey = `${churchKey}-${slugify(ministry.name)}`;
    ministryKeyById.set(ministry.id, ministryKey);

    // Les entrees systeme (« Systeme » / « Sans departement ») sont recreees par
    // le seed lui-meme : les reprendre ici les dupliquerait.
    if (!ministry.isSystem) {
      ministries.push({ key: ministryKey, churchKey, name: ministry.name });
    }

    for (const department of ministry.departments) {
      const departmentKey = `${ministryKey}-${slugify(department.name)}`;
      departmentKeyById.set(department.id, departmentKey);
      if (ministry.isSystem || department.isSystem) continue;
      departments.push({
        key: departmentKey,
        ministryKey,
        name: department.name,
        ...(department.function ? { function: department.function } : {}),
      });
    }
  }

  for (const userRole of church.userRoles) {
    const email = userRole.userEmail.toLowerCase();
    let key = `${slugify(email.split("@")[0])}-${userRole.role.toLowerCase()}`;
    // Deux comptes peuvent partager la meme partie locale (prenom.nom@ sur des
    // domaines differents) : on desambigue plutot que d'ecraser silencieusement.
    let suffix = 2;
    while (seenUserKeys.has(key)) key = `${key}-${suffix++}`;
    seenUserKeys.add(key);

    const departmentKeys = (userRole.departmentIds ?? [])
      .map((id) => departmentKeyById.get(id))
      .filter((k): k is string => Boolean(k));

    users.push({
      key,
      email,
      name: nameFromEmail(email),
      displayName: nameFromEmail(email),
      role: userRole.role,
      churchKey,
      ...(userRole.ministryId && ministryKeyById.get(userRole.ministryId)
        ? { ministryKey: ministryKeyById.get(userRole.ministryId) }
        : {}),
      ...(departmentKeys.length > 0 ? { departmentKeys } : {}),
    });
  }
}

const fixture = {
  _meta: {
    source: inputPath.split("/").pop(),
    exportedAt: data._meta.exportedAt,
    builtAt: new Date().toISOString(),
    note: "Structure et comptes reels. Aucune donnee metier : les membres, plannings, absences, salles et comptes rendus sont fabriques par le seed.",
  },
  churches,
  ministries,
  departments,
  users,
};

writeFileSync(outputPath, JSON.stringify(fixture, null, 2) + "\n");

const byRole = users.reduce<Record<string, number>>((acc, u) => {
  acc[u.role] = (acc[u.role] ?? 0) + 1;
  return acc;
}, {});

console.log(`Fixture ecrite : ${outputPath}`);
console.log(
  `  ${churches.length} eglise(s), ${ministries.length} ministere(s), ${departments.length} departement(s), ${users.length} role(s)`
);
console.log(
  `  roles : ${Object.entries(byRole)
    .sort((a, b) => b[1] - a[1])
    .map(([r, n]) => `${r} ${n}`)
    .join(", ")}`
);

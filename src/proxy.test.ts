import { describe, it, expect } from "vitest";
import { globSync, readFileSync } from "node:fs";
import { SESSION_COOKIE_NAMES } from "./proxy";

/**
 * Garde-fou sur le nom du cookie de session (issue #143).
 *
 * `src/proxy.ts` reconnaît une session à partir du nom de son cookie, codé en
 * dur : `defaultCookies()` de `@auth/core` n'est pas exporté publiquement, on ne
 * peut donc pas lire le nom depuis la librairie au runtime. Conséquence : si
 * Auth.js renomme ce cookie lors d'une montée de version, le middleware laisse
 * passer tout le monde comme non authentifié — panne totale, silencieuse, et
 * invisible pour les autres tests qui n'exercent jamais la poignée de main.
 *
 * Ce test lit le nom que la librairie **installée** définit réellement et le
 * compare à notre constante. Il échoue à la montée de version fautive, dans la
 * CI, plutôt qu'en production.
 *
 * Il échoue aussi si le fichier interne de `@auth/core` disparaît ou change de
 * forme : c'est voulu. Un tel changement est exactement le signal qu'il faut
 * rouvrir la question — voir l'évaluation postée sur #143.
 */

const COOKIE_MODULE_GLOB = "node_modules/**/@auth/core/lib/utils/cookie.js";

/** Extrait le nom de base du cookie de session de la source de `@auth/core`. */
function sessionCookieBaseNames(): string[] {
  const files = globSync(COOKIE_MODULE_GLOB);

  expect(
    files.length,
    `Aucun fichier ne correspond à ${COOKIE_MODULE_GLOB}. @auth/core a probablement changé ` +
      `d'arborescence : vérifier le nom du cookie de session et mettre à jour SESSION_COOKIE_NAMES ` +
      `dans src/proxy.ts (issue #143).`
  ).toBeGreaterThan(0);

  return files.map((file) => {
    const source = readFileSync(file, "utf8");
    const match = source.match(
      /sessionToken:\s*\{\s*name:\s*`\$\{cookiePrefix\}([^`]+)`/
    );

    expect(
      match,
      `Nom du cookie de session introuvable dans ${file}. La forme de defaultCookies() a changé : ` +
        `vérifier SESSION_COOKIE_NAMES dans src/proxy.ts (issue #143).`
    ).not.toBeNull();

    return match![1];
  });
}

describe("proxy — nom du cookie de session", () => {
  it("correspond à ce que @auth/core définit réellement", () => {
    for (const baseName of sessionCookieBaseNames()) {
      // Auth.js préfixe par `__Secure-` en HTTPS, sans préfixe sinon : le
      // middleware doit reconnaître les deux.
      expect(SESSION_COOKIE_NAMES).toContain(baseName);
      expect(SESSION_COOKIE_NAMES).toContain(`__Secure-${baseName}`);
    }
  });

  it("couvre exactement les deux variantes, sans nom mort", () => {
    const baseNames = sessionCookieBaseNames();
    expect(SESSION_COOKIE_NAMES).toHaveLength(2 * new Set(baseNames).size);
  });
});

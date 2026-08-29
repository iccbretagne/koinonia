import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDevLoginEnabled, SESSION_COOKIE_NAME } from "@/lib/auth";
import { DEV_USERS } from "../../../../../prisma/fixtures/dev-users";

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours — aligné sur le défaut NextAuth

/**
 * Connexion développement : crée une session directement en base pour un compte de
 * test (voir `prisma/fixtures/dev-users.ts`), sans passer par un provider NextAuth ni
 * par Google OAuth. Toujours désactivée hors développement (voir `isDevLoginEnabled`).
 *
 * Volontairement en dehors du système de providers NextAuth : un provider Credentials
 * forcerait une session JWT pour toute l'application, incompatible avec la stratégie
 * de session "database" utilisée pour Google (voir plan.md, section Décisions). Cette
 * route reproduit uniquement ce que `PrismaAdapter` ferait pour une connexion OAuth :
 * une ligne `Session` en base + le cookie de session correspondant.
 */
export async function POST(request: Request) {
  if (!isDevLoginEnabled(process.env)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const devUserKey = formData.get("devUserKey");
  const devUser =
    typeof devUserKey === "string" ? DEV_USERS.find((u) => u.key === devUserKey) : undefined;
  if (!devUser) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const dbUser = await prisma.user.findUnique({ where: { email: devUser.email } });
  if (!dbUser) {
    // Le compte n'existe pas encore en base : `npm run db:seed:dev` n'a pas été exécuté.
    return NextResponse.redirect(new URL("/", request.url));
  }

  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + SESSION_MAX_AGE_MS);
  await prisma.session.create({ data: { sessionToken, userId: dbUser.id, expires } });

  const response = NextResponse.redirect(new URL("/dashboard", request.url));
  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
  });
  return response;
}

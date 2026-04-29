import { requirePermission, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registry } from "@/lib/registry";
import { notFound } from "next/navigation";
import MrbsLinksManager from "./MrbsLinksManager";

interface MrbsUser {
  name: string;
  display_name: string | null;
  email: string | null;
  level: number;
}

async function fetchMrbsUsers(): Promise<MrbsUser[]> {
  const dbUrl = process.env.MRBS_DB_URL;
  if (!dbUrl) return [];

  try {
    const mariadb = await import("mariadb");
    const conn = await mariadb.createConnection(dbUrl);
    try {
      const rows = await conn.query(
        "SELECT name, display_name, email, level FROM mrbs_users ORDER BY display_name, name"
      );
      return rows as MrbsUser[];
    } finally {
      await conn.end();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Masquer l'URL de connexion qui peut contenir le mot de passe
    const safe = msg.replace(/\/\/[^@]*@/, "//***:***@");
    console.error("[mrbs-links] fetchMrbsUsers error:", safe);
    return [];
  }
}

export default async function MrbsLinksPage() {
  if (!registry.has("mrbs")) notFound();

  const session = await requirePermission("mrbs:manage");
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;

  const [mrbsUsers, links, koinoniaUsers] = await Promise.all([
    fetchMrbsUsers(),
    prisma.mrbsUserLink.findMany({
      where: { churchId },
      select: { mrbsUsername: true, userId: true },
    }),
    prisma.user.findMany({
      orderBy: [{ displayName: "asc" }, { name: "asc" }],
      select: { id: true, email: true, name: true, displayName: true },
    }),
  ]);

  const linkedByMrbs = new Map(links.map((l) => [l.mrbsUsername, l.userId]));
  const linkedByKoinonia = new Map(links.map((l) => [l.userId, l.mrbsUsername]));

  // Enrichir les MRBS users avec leur statut de liaison
  const enriched = mrbsUsers.map((u) => {
    const linkedUserId = linkedByMrbs.get(u.name);
    const autoMatchUser = !linkedUserId
      ? koinoniaUsers.find((k) => k.email === u.email || k.email === u.name)
      : null;

    return {
      mrbsUsername: u.name,
      mrbsDisplayName: u.display_name ?? u.name,
      mrbsEmail: u.email,
      mrbsLevel: u.level,
      linkedUserId: linkedUserId ?? null,
      autoMatchUserId: autoMatchUser?.id ?? null,
    };
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Liaison comptes MRBS ↔ Koinonia</h1>
        <p className="text-sm text-gray-500 mt-1">
          Associer les comptes MRBS existants aux comptes Koinonia pour le SSO.
          Les comptes dont l&apos;email correspond sont détectés automatiquement.
        </p>
      </div>
      <MrbsLinksManager
        mrbsUsers={enriched}
        koinoniaUsers={koinoniaUsers}
        linkedByKoinonia={Object.fromEntries(linkedByKoinonia)}
        churchId={churchId}
        hasMrbsDb={!!process.env.MRBS_DB_URL}
      />
    </div>
  );
}

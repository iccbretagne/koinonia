import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { version } from "../../../../package.json";

const startTime = Date.now();

export async function GET() {
  let dbStatus: "ok" | "error" = "ok";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "error";
  }

  const status = dbStatus === "ok" ? "ok" : "degraded";
  const httpStatus = status === "ok" ? 200 : 503;

  return NextResponse.json(
    {
      status,
      version,
      db: dbStatus,
      uptime: Math.floor((Date.now() - startTime) / 1000),
    },
    { status: httpStatus }
  );
}

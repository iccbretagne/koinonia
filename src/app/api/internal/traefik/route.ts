import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-utils";
import { requireInternalCall } from "@/lib/internal-call";
import { approvedHosts, traefikConfig } from "@/modules/ticketing";

export async function GET(request: Request) {
  try {
    requireInternalCall(request);
    return NextResponse.json(traefikConfig(Object.keys(await approvedHosts()), process.env.TRAEFIK_APP_SERVICE_URL), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

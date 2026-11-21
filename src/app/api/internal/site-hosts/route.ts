import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-utils";
import { requireInternalCall } from "@/lib/internal-call";
import { approvedHosts } from "@/modules/ticketing";

export async function GET(request: Request) {
  try {
    requireInternalCall(request);
    return NextResponse.json(await approvedHosts(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

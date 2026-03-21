import { handlers } from "@/lib/auth";
import { requireRateLimit, RATE_LIMIT_AUTH } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const { GET } = handlers;

const { POST: nextAuthPost } = handlers;

export async function POST(request: NextRequest) {
  try {
    requireRateLimit(request, RATE_LIMIT_AUTH);
    return nextAuthPost(request);
  } catch (error) {
    return errorResponse(error);
  }
}

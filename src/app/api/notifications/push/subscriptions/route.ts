import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ApiError, errorResponse, successResponse } from "@/lib/api-utils";
import { isPushConfigured } from "@/lib/push/config";
import { PUSH_DEVICE_COOKIE, subscribeDevice, unsubscribeDevice } from "@/lib/push/subscriptions";
import { subscribeSchema, unsubscribeSchema } from "./contract";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export async function POST(request: Request) {
  try {
    const input = subscribeSchema.parse(await request.json());
    const session = await requireAuth();
    if (!isPushConfigured()) throw new ApiError(503, "Les notifications natives ne sont pas disponibles sur cette instance.");
    const { id } = await subscribeDevice(session.user.id!, input, request.headers.get("user-agent"));
    const response = successResponse({ id }, 201);
    response.cookies.set(PUSH_DEVICE_COOKIE, id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const text = await request.text();
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new ApiError(400, "Corps JSON invalide");
    }
    const input = unsubscribeSchema.parse(body);
    const session = await requireAuth();
    const cookieId = (await cookies()).get(PUSH_DEVICE_COOKIE)?.value;
    if (input.endpoint) await unsubscribeDevice(session.user.id!, { endpoint: input.endpoint });
    else if (cookieId) await unsubscribeDevice(session.user.id!, { id: cookieId });
    const response = new NextResponse(null, { status: 204 });
    response.cookies.delete(PUSH_DEVICE_COOKIE);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

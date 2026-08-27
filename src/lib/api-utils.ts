import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "./errors";

// Ré-export : `ApiError` est définie dans `errors.ts` (sans dépendance Next.js) pour rester
// utilisable hors du framework — voir le commentaire de ce fichier. Les nombreux appelants
// qui font `import { ApiError } from "@/lib/api-utils"` continuent de fonctionner.
export { ApiError };

export function successResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode }
    );
  }

  if (error instanceof ZodError) {
    const fieldErrors = error.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    return NextResponse.json(
      { error: "Données invalides", details: fieldErrors },
      { status: 400 }
    );
  }

  if (error instanceof Error) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (error.message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }
  }

  console.error("Unhandled error:", error instanceof Error ? error.message : "Unknown error");
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}

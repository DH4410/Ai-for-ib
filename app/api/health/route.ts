import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "ai-for-ib",
    modelConfigured: Boolean(process.env.MODEL_NAME),
    mockMode: process.env.USE_MOCK_MODEL === "true",
  });
}

import { NextResponse } from "next/server";

import {
  buildCapabilityHealth,
} from "@/lib/health";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    buildCapabilityHealth(process.env),
  );
}

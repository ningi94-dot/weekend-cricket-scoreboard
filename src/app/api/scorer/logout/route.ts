import { NextResponse } from "next/server";
import { clearScorerSession } from "@/lib/scorer/session";

export async function POST() {
  await clearScorerSession();
  return NextResponse.json({ ok: true });
}

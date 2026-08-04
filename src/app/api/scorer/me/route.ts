import { NextResponse } from "next/server";
import { getScorerSession } from "@/lib/scorer/session";

export async function GET() {
  const session = await getScorerSession();
  return NextResponse.json({ isScorer: Boolean(session), username: session?.username ?? null });
}

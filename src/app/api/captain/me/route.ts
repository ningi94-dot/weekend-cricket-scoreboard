import { NextResponse } from "next/server";
import { getCaptainSession } from "@/lib/captain/session";

export async function GET() {
  const session = await getCaptainSession();
  return NextResponse.json({ isCaptain: Boolean(session) });
}

import { NextResponse } from "next/server";
import { createScorerSession, verifyScorerPassword } from "@/lib/scorer/session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { username?: string; password?: string } | null;
  if (!body?.username || !body.password || !verifyScorerPassword(body.username, body.password)) {
    return NextResponse.json({ message: "Invalid scorer username or password." }, { status: 401 });
  }
  await createScorerSession();
  return NextResponse.json({ ok: true });
}

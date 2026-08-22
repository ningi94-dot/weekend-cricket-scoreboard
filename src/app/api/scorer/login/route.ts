import { NextResponse } from "next/server";
import { verifyCaptainPassword } from "@/lib/captain/session";
import { createScorerSession, verifyScorerPassword } from "@/lib/scorer/session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { username?: string; password?: string } | null;
  const scorerPasswordValid = Boolean(body?.username && body.password && verifyScorerPassword(body.username, body.password));
  let captainPasswordValid = false;
  if (!scorerPasswordValid && body?.password) {
    try {
      captainPasswordValid = verifyCaptainPassword(body.password);
    } catch {
      captainPasswordValid = false;
    }
  }
  if (!scorerPasswordValid && !captainPasswordValid) {
    return NextResponse.json({ message: "Invalid scorer username or password." }, { status: 401 });
  }
  await createScorerSession();
  return NextResponse.json({ ok: true });
}

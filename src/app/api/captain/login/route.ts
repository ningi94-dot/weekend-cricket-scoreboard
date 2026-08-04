import { NextResponse } from "next/server";
import { createCaptainSession, verifyCaptainPassword } from "@/lib/captain/session";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { password?: string } | null;
    if (!body?.password || !verifyCaptainPassword(body.password)) {
      return NextResponse.json({ message: "Incorrect captain password." }, { status: 401 });
    }
    await createCaptainSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("CAPTAIN_PASSWORD_HASH")
      ? "Vercel is missing CAPTAIN_PASSWORD_SALT or CAPTAIN_PASSWORD_HASH."
      : "Unable to verify captain password.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

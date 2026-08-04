import { createHmac, pbkdf2Sync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const cookieName = "lpc_captain";
const oneDayMs = 24 * 60 * 60 * 1000;

type SessionPayload = {
  role: "captain";
  expiresAt: number;
};

function sessionSecret() {
  const secret = process.env.SCORER_SESSION_SECRET;
  if (!secret) throw new Error("SCORER_SESSION_SECRET is not configured.");
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function encode(payload: SessionPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(value: string | undefined) {
  if (!value) return null;
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
  if (payload.expiresAt < Date.now() || payload.role !== "captain") return null;
  return payload;
}

function hashPassword(password: string, salt: string) {
  return pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("base64url");
}

export function verifyCaptainPassword(password: string) {
  const salt = process.env.CAPTAIN_PASSWORD_SALT;
  const hash = process.env.CAPTAIN_PASSWORD_HASH;
  if (!salt || !hash) throw new Error("CAPTAIN_PASSWORD_HASH is not configured.");
  const candidate = hashPassword(password, salt);
  if (Buffer.byteLength(candidate) !== Buffer.byteLength(hash)) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
}

export async function createCaptainSession() {
  const cookieStore = await cookies();
  cookieStore.set(cookieName, encode({ role: "captain", expiresAt: Date.now() + oneDayMs }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: oneDayMs / 1000,
  });
}

export async function requireCaptainSession() {
  const cookieStore = await cookies();
  const session = decode(cookieStore.get(cookieName)?.value);
  if (!session) throw new Error("Captain password required.");
  return session;
}

export async function getCaptainSession() {
  const cookieStore = await cookies();
  return decode(cookieStore.get(cookieName)?.value);
}

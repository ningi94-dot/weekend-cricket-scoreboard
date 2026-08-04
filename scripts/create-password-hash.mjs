import { pbkdf2Sync, randomBytes } from "node:crypto";

const prefix = process.argv[2];
const password = process.argv[3];

if (!prefix || !password) {
  console.error("Usage: node scripts/create-password-hash.mjs <ENV_PREFIX> <password>");
  process.exit(1);
}

const salt = randomBytes(16).toString("base64url");
const hash = pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("base64url");
const normalizedPrefix = prefix.toUpperCase().replaceAll("-", "_");

console.log(`${normalizedPrefix}_PASSWORD_SALT=${salt}`);
console.log(`${normalizedPrefix}_PASSWORD_HASH=${hash}`);

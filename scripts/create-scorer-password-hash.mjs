import { pbkdf2Sync, randomBytes } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/create-scorer-password-hash.mjs <password>");
  process.exit(1);
}

const salt = randomBytes(16).toString("base64url");
const hash = pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("base64url");

console.log(`SCORER_PASSWORD_SALT=${salt}`);
console.log(`SCORER_PASSWORD_HASH=${hash}`);

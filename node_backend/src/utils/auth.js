import crypto from "crypto";

export function fullName(user) {
  const name = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  return name || user.username;
}

export function verifyDjangoPassword(rawPassword, encoded) {
  if (!encoded || !encoded.includes("$")) return false;
  const [algo, iterText, salt, hash] = encoded.split("$");
  if (algo !== "pbkdf2_sha256") return false;
  const iterations = Number(iterText);
  const derived = crypto.pbkdf2Sync(rawPassword, salt, iterations, 32, "sha256").toString("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(derived));
  } catch {
    return false;
  }
}

export function makeNodePassword(rawPassword) {
  const algo = "pbkdf2_sha256";
  const iterations = 390000;
  const salt = "nodejs";
  const hash = crypto.pbkdf2Sync(rawPassword, salt, iterations, 32, "sha256").toString("base64");
  return `${algo}$${iterations}$${salt}$${hash}`;
}
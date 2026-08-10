export const AUTH_COOKIE = "brandyaction_erp_access";

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function accessToken() {
  const password = process.env.ERP_ACCESS_PASSWORD;
  const secret = process.env.ERP_AUTH_SECRET;
  if (!password || !secret) return null;
  return sha256(`${password}:${secret}`);
}

export async function passwordMatches(input: string) {
  const expected = process.env.ERP_ACCESS_PASSWORD;
  if (!expected) return false;
  const [actualHash, expectedHash] = await Promise.all([sha256(input), sha256(expected)]);
  let difference = actualHash.length ^ expectedHash.length;
  const length = Math.max(actualHash.length, expectedHash.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (actualHash.charCodeAt(index) || 0) ^ (expectedHash.charCodeAt(index) || 0);
  }
  return difference === 0;
}

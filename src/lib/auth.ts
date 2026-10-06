import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Login do painel: uma senha única dos donos.
 * - Senha inicial: variável ADMIN_PASSWORD (ou a padrão abaixo).
 * - Depois de trocada no painel, vale a senha salva no banco (com hash).
 */
export const DEFAULT_ADMIN_PASSWORD = "midiversao2026";

const COOKIE_NAME = "mi_admin";
const SESSION_DAYS = 7;

function secret() {
  return (
    process.env.ADMIN_SECRET ||
    `${process.env.DATABASE_URL ?? "mi-diversao"}|${process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD}`
  );
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createSessionToken() {
  const expires = String(Date.now() + SESSION_DAYS * 86_400_000);
  return `${expires}.${sign(expires)}`;
}

export function isValidSessionToken(token: string | null | undefined) {
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature) return false;
  if (!safeEqual(signature, sign(expires))) return false;
  return Number(expires) > Date.now();
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}

export function isAdmin(request: Request) {
  return isValidSessionToken(readCookie(request, COOKIE_NAME));
}

function cookieFlags() {
  return `Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function sessionCookie(token: string) {
  return `${COOKIE_NAME}=${token}; Max-Age=${SESSION_DAYS * 86_400}; ${cookieFlags()}`;
}

export function clearedCookie() {
  return `${COOKIE_NAME}=; Max-Age=0; ${cookieFlags()}`;
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  return safeEqual(scryptSync(password, salt, 32).toString("hex"), hash);
}

/** `storedHash` vem do banco (vazio enquanto a senha nunca foi trocada no painel). */
export function passwordMatches(password: string, storedHash: string | undefined) {
  if (storedHash) return verifyPassword(password, storedHash);
  return safeEqual(password, process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD);
}

/**
 * Versão do login usada só na demonstração de arquivo único.
 * Não há servidor nem cookie: a sessão vale enquanto a aba estiver aberta.
 * (O site de verdade usa src/lib/auth.ts.)
 */
export const DEFAULT_ADMIN_PASSWORD = "midiversao2026";

const SESSION_KEY = "mi-diversao-demo-admin";
let signedIn = false;

function remember(value: boolean) {
  signedIn = value;
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, "1");
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* sem sessionStorage: vale só até recarregar */
  }
}

export function createSessionToken() {
  remember(true);
  return "demonstracao";
}

export function isValidSessionToken(token: string | null | undefined) {
  return token === "demonstracao";
}

export function readCookie(_request: Request, _name: string): string | null {
  return null;
}

export function isAdmin(_request: Request) {
  try {
    return signedIn || sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return signedIn;
  }
}

export function sessionCookie(token: string) {
  return `mi_admin=${token}`;
}

export function clearedCookie() {
  remember(false);
  return "mi_admin=";
}

export function hashPassword(password: string) {
  return `demo$${password}`;
}

export function verifyPassword(password: string, stored: string) {
  return stored === `demo$${password}`;
}

export function passwordMatches(password: string, storedHash: string | undefined) {
  if (storedHash) return verifyPassword(password, storedHash);
  return password === DEFAULT_ADMIN_PASSWORD;
}

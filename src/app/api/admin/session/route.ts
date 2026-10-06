import { loadSettingsMap } from "@/db/queries";
import { ensureReady } from "@/db/seed";
import {
  clearedCookie,
  createSessionToken,
  isAdmin,
  passwordMatches,
  sessionCookie,
} from "@/lib/auth";
import { UserError, handle, json, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

/** O painel pergunta aqui se já está logado. */
export async function GET(request: Request) {
  return json({ authenticated: isAdmin(request) });
}

/** Login. */
export async function POST(request: Request) {
  return handle("POST /api/admin/session", request, {}, async () => {
    await ensureReady();
    const body = await readBody<{ password: string }>(request);
    const map = await loadSettingsMap();
    if (!passwordMatches(String(body.password ?? ""), map.admin_password_hash)) {
      // pequena espera para dificultar tentativas em sequência
      await new Promise((resolve) => setTimeout(resolve, 600));
      throw new UserError("Senha incorreta.", 401);
    }
    return json({ authenticated: true }, 200, { "Set-Cookie": sessionCookie(createSessionToken()) });
  });
}

/** Logout. */
export async function DELETE() {
  return json({ authenticated: false }, 200, { "Set-Cookie": clearedCookie() });
}

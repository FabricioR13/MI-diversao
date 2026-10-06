import { isAdmin } from "@/lib/auth";

/** Erro "esperado" (validação, conflito de data...) com mensagem para mostrar ao usuário. */
export class UserError extends Error {
  status: number;
  extra: Record<string, unknown>;

  constructor(message: string, status = 400, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = "UserError";
    this.status = status;
    this.extra = extra;
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  // new Response + JSON.stringify (e não Response.json): este código também roda dentro do
  // navegador na demonstração, e celulares mais antigos (iOS 16 ou anterior) não têm Response.json.
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

export function unauthorized() {
  return json({ error: "Faça login no painel para continuar." }, 401);
}

/** Envolve um handler: trata login obrigatório e transforma erros em JSON. */
export async function handle(
  label: string,
  request: Request,
  options: { admin?: boolean },
  run: () => Promise<Response>,
): Promise<Response> {
  if (options.admin && !isAdmin(request)) return unauthorized();
  try {
    return await run();
  } catch (error) {
    if (error instanceof UserError) {
      return json({ error: error.message, ...error.extra }, error.status);
    }
    console.error(label, error);
    return json({ error: "Algo deu errado por aqui. Tente novamente em instantes." }, 500);
  }
}

export async function readBody<T>(request: Request): Promise<Partial<T>> {
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === "object") return body as Partial<T>;
  } catch {
    /* corpo vazio ou inválido */
  }
  return {};
}

export function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new UserError("Registro não encontrado.", 404);
  return id;
}

export function text(value: unknown, max = 300): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

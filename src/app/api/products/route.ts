import { createToy, type ToyInput } from "@/db/queries";
import { ensureReady } from "@/db/seed";
import { handle, json, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Cadastra um brinquedo ou combo (painel). */
export async function POST(request: Request) {
  return handle("POST /api/products", request, { admin: true }, async () => {
    await ensureReady();
    const body = await readBody<ToyInput>(request);
    return json({ toy: await createToy(body) }, 201);
  });
}

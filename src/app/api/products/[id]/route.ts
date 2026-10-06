import { deleteToy, updateToy, type ToyInput } from "@/db/queries";
import { ensureReady } from "@/db/seed";
import { handle, json, parseId, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Edita valor, estoque, foto, visibilidade... (painel). */
export async function PATCH(request: Request, { params }: Context) {
  return handle("PATCH /api/products/[id]", request, { admin: true }, async () => {
    await ensureReady();
    const { id } = await params;
    const body = await readBody<ToyInput>(request);
    return json({ toy: await updateToy(parseId(id), body) });
  });
}

export async function DELETE(request: Request, { params }: Context) {
  return handle("DELETE /api/products/[id]", request, { admin: true }, async () => {
    await ensureReady();
    const { id } = await params;
    await deleteToy(parseId(id));
    return json({ ok: true });
  });
}

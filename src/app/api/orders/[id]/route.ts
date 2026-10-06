import { deleteRental, updateRental, type RentalPatch } from "@/db/queries";
import { ensureReady } from "@/db/seed";
import { handle, json, parseId, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Atualiza status, desconto, horários ou observações de uma reserva (painel). */
export async function PATCH(request: Request, { params }: Context) {
  return handle("PATCH /api/orders/[id]", request, { admin: true }, async () => {
    await ensureReady();
    const { id } = await params;
    const body = await readBody<RentalPatch>(request);
    return json({ rental: await updateRental(parseId(id), body) });
  });
}

export async function DELETE(request: Request, { params }: Context) {
  return handle("DELETE /api/orders/[id]", request, { admin: true }, async () => {
    await ensureReady();
    const { id } = await params;
    await deleteRental(parseId(id));
    return json({ ok: true });
  });
}

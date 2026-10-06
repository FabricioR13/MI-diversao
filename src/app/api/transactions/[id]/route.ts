import { deleteTransaction } from "@/db/queries";
import { ensureReady } from "@/db/seed";
import { handle, json, parseId } from "@/lib/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Context) {
  return handle("DELETE /api/transactions/[id]", request, { admin: true }, async () => {
    await ensureReady();
    const { id } = await params;
    await deleteTransaction(parseId(id));
    return json({ ok: true });
  });
}

import { getStore } from "@/db";
import { ensureReady } from "@/db/seed";

export const dynamic = "force-dynamic";

/** Mostra se o armazenamento está respondendo e qual está em uso. */
export async function GET() {
  try {
    await ensureReady();
    const store = getStore();
    await store.read((tx) => tx.settings());
    return Response.json({ ok: true, armazenamento: store.kind });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}

import { createTransaction, listTransactions, type TransactionInput } from "@/db/queries";
import { ensureReady } from "@/db/seed";
import { handle, json, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Entradas e saídas (painel). */
export async function GET(request: Request) {
  return handle("GET /api/transactions", request, { admin: true }, async () => {
    await ensureReady();
    return json({ transactions: await listTransactions() });
  });
}

export async function POST(request: Request) {
  return handle("POST /api/transactions", request, { admin: true }, async () => {
    await ensureReady();
    const body = await readBody<TransactionInput>(request);
    return json({ transaction: await createTransaction(body) }, 201);
  });
}

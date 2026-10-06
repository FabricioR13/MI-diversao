import { createRental, listRentals, loadSettingsMap, toPublicSettings } from "@/db/queries";
import { ensureReady } from "@/db/seed";
import { isAdmin } from "@/lib/auth";
import { handle, json, readBody, unauthorized } from "@/lib/http";
import type { OrderInput } from "@/lib/types";
import { buildOrderMessage, whatsappLink } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/** Lista de reservas (painel). */
export async function GET(request: Request) {
  return handle("GET /api/orders", request, { admin: true }, async () => {
    await ensureReady();
    return json({ rentals: await listRentals() });
  });
}

/**
 * Novo pedido. Público para os clientes do site; com `manual: true` (só admin)
 * registra uma reserva feita por fora (telefone, Instagram...).
 */
export async function POST(request: Request) {
  return handle("POST /api/orders", request, {}, async () => {
    await ensureReady();
    const body = await readBody<OrderInput>(request);
    const admin = isAdmin(request);
    if (body.manual && !admin) return unauthorized();

    const rental = await createRental(body, { admin });
    const settings = toPublicSettings(await loadSettingsMap());
    const whatsappUrl = whatsappLink(settings.whatsapp, buildOrderMessage(rental, settings));
    return json({ rental, whatsappUrl }, 201);
  });
}

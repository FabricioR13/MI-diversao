import {
  loadRegions,
  loadSettingsMap,
  saveSettings,
  setAdminPasswordHash,
  toPublicSettings,
  type RegionInput,
} from "@/db/queries";
import { ensureReady } from "@/db/seed";
import { hashPassword, passwordMatches } from "@/lib/auth";
import { UserError, handle, json, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

type SettingsBody = {
  settings: Record<string, unknown>;
  regions: RegionInput[];
  currentPassword: string;
  newPassword: string;
};

async function current() {
  const [map, regions] = await Promise.all([loadSettingsMap(), loadRegions(true)]);
  return { settings: toPublicSettings(map), regions };
}

/** Configurações do negócio: WhatsApp, horários padrão, cidades e fretes (painel). */
export async function GET(request: Request) {
  return handle("GET /api/settings", request, { admin: true }, async () => {
    await ensureReady();
    return json(await current());
  });
}

export async function PUT(request: Request) {
  return handle("PUT /api/settings", request, { admin: true }, async () => {
    await ensureReady();
    const body = await readBody<SettingsBody>(request);

    if (typeof body.newPassword === "string" && body.newPassword) {
      const map = await loadSettingsMap();
      if (!passwordMatches(String(body.currentPassword ?? ""), map.admin_password_hash)) {
        throw new UserError("A senha atual não confere.");
      }
      if (body.newPassword.length < 6) {
        throw new UserError("A nova senha precisa ter pelo menos 6 caracteres.");
      }
      await setAdminPasswordHash(hashPassword(body.newPassword));
    }

    const s = body.settings;
    const settings = s
      ? {
          business_name: s.businessName,
          whatsapp: s.whatsapp,
          instagram: s.instagram,
          delivery_time: s.deliveryTime,
          return_time: s.returnTime,
          pickup_address: s.pickupAddress,
          notice: s.notice,
        }
      : undefined;
    await saveSettings(settings, body.regions);
    return json(await current());
  });
}

import { availabilityFor, loadCategories, loadRegions, loadSettingsMap, toPublicSettings } from "@/db/queries";
import { ensureReady } from "@/db/seed";
import { isAdmin } from "@/lib/auth";
import { isISODate, todayISO } from "@/lib/dates";
import { handle, json } from "@/lib/http";
import type { CatalogResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Catálogo público. Com ?start=AAAA-MM-DD&end=AAAA-MM-DD devolve também
 * quantas unidades de cada brinquedo estão livres no período.
 */
export async function GET(request: Request) {
  return handle("GET /api/catalog", request, {}, async () => {
    await ensureReady();
    const url = new URL(request.url);
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    const admin = url.searchParams.get("admin") === "1" && isAdmin(request);
    const period = isISODate(start) && isISODate(end) && end >= start ? { start, end } : null;

    const [categories, regions, settingsMap, availability] = await Promise.all([
      loadCategories(admin),
      loadRegions(admin),
      loadSettingsMap(),
      period ? availabilityFor(period.start, period.end) : Promise.resolve(null),
    ]);

    const body: CatalogResponse = {
      categories,
      regions,
      settings: toPublicSettings(settingsMap),
      availability,
      today: todayISO(),
    };
    return json(body);
  });
}

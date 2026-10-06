import { getStore } from "@/db";
import { DEFAULT_SETTINGS } from "@/db/seed";
import type { Tx } from "@/db/store";
import {
  computeAvailability,
  expandDemand,
  findConflicts,
  type Demand,
  type StockToy,
} from "@/lib/availability";
import { isISODate, isTime, rentalDays, todayISO } from "@/lib/dates";
import { onlyDigits, orderCode } from "@/lib/format";
import { UserError, text } from "@/lib/http";
import {
  PAYMENT_METHODS,
  RENTAL_STATUSES,
  type CategoryDTO,
  type OrderInput,
  type PublicSettings,
  type RegionDTO,
  type RentalDTO,
  type RentalItem,
  type RentalStatus,
  type ToyDTO,
  type TransactionDTO,
} from "@/lib/types";

/**
 * Regras do negócio. Tudo aqui usa só as operações de src/db/store.ts,
 * então funciona igual com PostgreSQL ou com o arquivo local.
 */

/* ---------- linhas guardadas ---------- */

type CategoryRow = {
  id: number;
  slug: string;
  name: string;
  emoji: string;
  description: string;
  position: number;
};

type ToyRow = {
  id: number;
  category_id: number;
  name: string;
  detail: string;
  description: string;
  bonus: string;
  price_cents: number;
  stock: number;
  image_url: string;
  component_ids: unknown;
  available: boolean;
  featured: boolean;
  position: number;
};

type RegionRow = { id: number; name: string; fee_cents: number; active: boolean; position: number };

type RentalRow = {
  id: number;
  code: string;
  customer_name: string;
  phone: string;
  start_date: string;
  end_date: string;
  days: number;
  fulfillment: string;
  region_name: string;
  address: string;
  neighborhood: string;
  reference: string;
  delivery_time: string;
  return_time: string;
  custom_times: boolean;
  payment_method: string;
  notes: string;
  subtotal_cents: number;
  delivery_fee_cents: number;
  discount_cents: number;
  total_cents: number;
  status: string;
  source: string;
  items: unknown;
  created_at: Date | string;
};

type TransactionRow = {
  id: number;
  kind: string;
  amount_cents: number;
  date: string;
  description: string;
  category: string;
  rental_id: number | null;
  created_at: Date | string;
};

/* ---------- conversões ---------- */

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toNumberArray(value: unknown): number[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0);
}

function toItems(value: unknown): RentalItem[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((raw) => {
    const item = (raw ?? {}) as Partial<RentalItem>;
    return {
      toyId: Number(item.toyId) || 0,
      name: String(item.name ?? ""),
      detail: String(item.detail ?? ""),
      bonus: String(item.bonus ?? ""),
      unitPriceCents: Number(item.unitPriceCents) || 0,
      quantity: Number(item.quantity) || 0,
      componentIds: toNumberArray(item.componentIds),
    };
  });
}

function toISOString(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function byPosition<T extends { position: number; id: number }>(a: T, b: T) {
  return a.position - b.position || a.id - b.id;
}

function toToy(row: ToyRow): ToyDTO {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    detail: row.detail,
    description: row.description,
    bonus: row.bonus,
    priceCents: row.price_cents,
    stock: row.stock,
    imageUrl: row.image_url,
    componentIds: toNumberArray(row.component_ids),
    available: row.available,
    featured: row.featured,
    position: row.position,
  };
}

function toRegion(row: RegionRow): RegionDTO {
  return { id: row.id, name: row.name, feeCents: row.fee_cents, active: row.active };
}

function toRental(row: RentalRow, paidCents: number): RentalDTO {
  const status = RENTAL_STATUSES.includes(row.status as RentalStatus)
    ? (row.status as RentalStatus)
    : "pendente";
  return {
    id: row.id,
    code: row.code,
    customerName: row.customer_name,
    phone: row.phone,
    startDate: row.start_date,
    endDate: row.end_date,
    days: row.days,
    fulfillment: row.fulfillment === "retirada" ? "retirada" : "entrega",
    regionName: row.region_name,
    address: row.address,
    neighborhood: row.neighborhood,
    reference: row.reference,
    deliveryTime: row.delivery_time,
    returnTime: row.return_time,
    customTimes: row.custom_times,
    paymentMethod: row.payment_method,
    notes: row.notes,
    subtotalCents: row.subtotal_cents,
    deliveryFeeCents: row.delivery_fee_cents,
    discountCents: row.discount_cents,
    totalCents: row.total_cents,
    paidCents,
    status,
    source: row.source === "manual" ? "manual" : "site",
    items: toItems(row.items),
    createdAt: toISOString(row.created_at),
  };
}

/* ---------- leituras de apoio (dentro de uma operação) ---------- */

async function toysIn(tx: Tx): Promise<ToyDTO[]> {
  const rows = await tx.all<ToyRow>("mi_toys");
  return rows.sort(byPosition).map(toToy);
}

async function settingsIn(tx: Tx): Promise<Record<string, string>> {
  return { ...DEFAULT_SETTINGS, ...(await tx.settings()) };
}

/** Quanto já foi recebido por reserva (soma das entradas vinculadas). */
async function paidByRental(tx: Tx): Promise<Map<number, number>> {
  const paid = new Map<number, number>();
  for (const row of await tx.all<TransactionRow>("mi_transactions")) {
    if (row.kind !== "entrada" || !row.rental_id) continue;
    paid.set(row.rental_id, (paid.get(row.rental_id) ?? 0) + row.amount_cents);
  }
  return paid;
}

async function rentalIn(tx: Tx, id: number): Promise<RentalDTO | null> {
  const row = (await tx.all<RentalRow>("mi_rentals")).find((r) => r.id === id);
  if (!row) return null;
  return toRental(row, (await paidByRental(tx)).get(id) ?? 0);
}

/** Brinquedo oculto no painel conta como "sem estoque" para os clientes (e para os combos que o usam). */
function asStock(toys: ToyDTO[], countHidden = false): StockToy[] {
  return toys.map((t) => ({
    id: t.id,
    stock: t.available || countHidden ? t.stock : 0,
    componentIds: t.componentIds,
  }));
}

/** Unidades ocupadas por brinquedo avulso em qualquer dia do período. */
async function reservedIn(
  tx: Tx,
  startDate: string,
  endDate: string,
  ignoreRentalId?: number,
): Promise<Map<number, number>> {
  const demand: Demand[] = [];
  for (const row of await tx.all<RentalRow>("mi_rentals")) {
    if (row.status === "cancelado" || row.id === ignoreRentalId) continue;
    if (row.start_date > endDate || row.end_date < startDate) continue;
    for (const item of toItems(row.items)) {
      demand.push({ toyId: item.toyId, quantity: item.quantity, componentIds: item.componentIds });
    }
  }
  return expandDemand(demand, new Map());
}

/* ---------- catálogo ---------- */

export async function loadCategories(includeHidden: boolean): Promise<CategoryDTO[]> {
  return getStore().read(async (tx) => {
    const categories = (await tx.all<CategoryRow>("mi_categories")).sort(byPosition);
    const toys = await toysIn(tx);
    return categories.map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      emoji: category.emoji,
      description: category.description,
      toys: toys.filter((t) => t.categoryId === category.id && (includeHidden || t.available)),
    }));
  });
}

export async function loadRegions(includeInactive: boolean): Promise<RegionDTO[]> {
  return getStore().read(async (tx) => {
    const rows = (await tx.all<RegionRow>("mi_regions")).sort(byPosition);
    return rows.map(toRegion).filter((r) => includeInactive || r.active);
  });
}

export async function loadSettingsMap(): Promise<Record<string, string>> {
  return getStore().read(settingsIn);
}

export function toPublicSettings(map: Record<string, string>): PublicSettings {
  return {
    businessName: map.business_name || DEFAULT_SETTINGS.business_name,
    whatsapp: onlyDigits(map.whatsapp || DEFAULT_SETTINGS.whatsapp),
    instagram: map.instagram ?? "",
    deliveryTime: isTime(map.delivery_time) ? map.delivery_time : "09:00",
    returnTime: isTime(map.return_time) ? map.return_time : "21:00",
    pickupAddress: map.pickup_address ?? "",
    notice: map.notice ?? "",
  };
}

export async function availabilityFor(
  startDate: string,
  endDate: string,
): Promise<Record<string, number>> {
  return getStore().read(async (tx) => {
    const toys = await toysIn(tx);
    const reserved = await reservedIn(tx, startDate, endDate);
    return computeAvailability(asStock(toys), reserved);
  });
}

/* ---------- reservas ---------- */

export async function listRentals(): Promise<RentalDTO[]> {
  return getStore().read(async (tx) => {
    const rows = await tx.all<RentalRow>("mi_rentals");
    const paid = await paidByRental(tx);
    return rows
      .sort((a, b) =>
        a.start_date === b.start_date ? b.id - a.id : a.start_date < b.start_date ? 1 : -1,
      )
      .slice(0, 500)
      .map((row) => toRental(row, paid.get(row.id) ?? 0));
  });
}

const MAX_DAYS = 15;

export async function createRental(
  input: Partial<OrderInput>,
  options: { admin: boolean },
): Promise<RentalDTO> {
  const manual = options.admin && input.manual === true;

  const customerName = text(input.customerName, 120);
  const phone = text(input.phone, 30);
  const startDate = input.startDate;
  const endDate = input.endDate;
  const fulfillment = input.fulfillment === "retirada" ? "retirada" : "entrega";
  const address = text(input.address, 200);
  const neighborhood = text(input.neighborhood, 80);
  const reference = text(input.reference, 160);
  const notes = text(input.notes, 500);
  const paymentMethod = [...PAYMENT_METHODS, "combinar"].includes(String(input.paymentMethod))
    ? String(input.paymentMethod)
    : "pix";
  const lines = (Array.isArray(input.items) ? input.items : [])
    .map((line) => ({
      toyId: Number(line?.toyId),
      quantity: Math.round(Number(line?.quantity)),
    }))
    .filter((line) => Number.isInteger(line.toyId) && line.quantity > 0);

  const errors: string[] = [];
  if (customerName.length < 2) errors.push("Informe o nome.");
  if (!manual && onlyDigits(phone).length < 10) errors.push("Informe um WhatsApp válido com DDD.");
  if (!isISODate(startDate) || !isISODate(endDate)) {
    throw new UserError("Escolha a data da festa antes de finalizar.");
  }
  if (endDate < startDate) errors.push("A devolução não pode ser antes da entrega.");
  if (!manual && startDate < todayISO()) errors.push("A data escolhida já passou.");
  const days = rentalDays(startDate, endDate);
  if (days > MAX_DAYS) errors.push(`O período máximo pelo site é de ${MAX_DAYS} diárias.`);
  if (lines.length === 0) errors.push("A sacolinha está vazia.");
  if (!manual && fulfillment === "entrega") {
    if (!input.regionId) errors.push("Escolha a cidade da entrega.");
    if (address.length < 5) errors.push("Informe a rua e o número para a entrega.");
    if (neighborhood.length < 2) errors.push("Informe o bairro.");
  }
  if (errors.length) throw new UserError(errors.join(" "));

  // Uma gravação por vez: impede que dois clientes reservem o mesmo brinquedo no mesmo instante.
  return getStore().write(async (tx) => {
    const toys = await toysIn(tx);
    const settings = toPublicSettings(await settingsIn(tx));
    const regions = await tx.all<RegionRow>("mi_regions");
    const toysById = new Map(toys.map((t) => [t.id, t]));

    const items: RentalItem[] = [];
    for (const line of lines) {
      const toy = toysById.get(line.toyId);
      if (!toy || (!toy.available && !manual)) continue;
      const existing = items.find((i) => i.toyId === toy.id);
      if (existing) {
        existing.quantity += line.quantity;
        continue;
      }
      items.push({
        toyId: toy.id,
        name: toy.name,
        detail: toy.detail,
        bonus: toy.bonus,
        unitPriceCents: toy.priceCents,
        quantity: line.quantity,
        componentIds: toy.componentIds,
      });
    }
    if (items.length === 0) {
      throw new UserError("Os brinquedos escolhidos não estão mais disponíveis.");
    }

    const reserved = await reservedIn(tx, startDate, endDate);
    const conflicts = findConflicts(asStock(toys, manual), reserved, items);
    if (conflicts.length > 0) {
      const names = items.filter((i) => conflicts.includes(i.toyId)).map((i) => i.name);
      throw new UserError(
        `Já existe reserva nesta data para: ${names.join(", ")}. Escolha outra data ou outro brinquedo.`,
        409,
        { conflicts },
      );
    }

    let regionName = "";
    let deliveryFeeCents = 0;
    if (fulfillment === "entrega") {
      const region = regions.find((r) => r.id === Number(input.regionId));
      if (region) {
        regionName = region.name;
        deliveryFeeCents = region.fee_cents;
      } else if (!manual) {
        throw new UserError("Escolha a cidade da entrega.");
      }
    }

    const deliveryTime = isTime(input.deliveryTime) ? input.deliveryTime : settings.deliveryTime;
    const returnTime = isTime(input.returnTime) ? input.returnTime : settings.returnTime;
    const customTimes =
      deliveryTime !== settings.deliveryTime || returnTime !== settings.returnTime;

    const subtotalCents =
      items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0) * days;
    const gross = subtotalCents + deliveryFeeCents;
    const discountCents = options.admin
      ? Math.min(gross, Math.max(0, Math.round(Number(input.discountCents) || 0)))
      : 0;

    const status: RentalStatus =
      manual && input.status && RENTAL_STATUSES.includes(input.status)
        ? input.status
        : manual
          ? "confirmado"
          : "pendente";

    const created = await tx.insert<RentalRow>("mi_rentals", {
      code: orderCode(),
      customer_name: customerName,
      phone,
      start_date: startDate,
      end_date: endDate,
      days,
      fulfillment,
      region_name: regionName,
      address,
      neighborhood,
      reference,
      delivery_time: deliveryTime,
      return_time: returnTime,
      custom_times: customTimes,
      payment_method: paymentMethod,
      notes,
      subtotal_cents: subtotalCents,
      delivery_fee_cents: deliveryFeeCents,
      discount_cents: discountCents,
      total_cents: gross - discountCents,
      status,
      source: manual ? "manual" : "site",
      items,
    });
    return toRental(created, 0);
  });
}

export type RentalPatch = {
  status?: string;
  discountCents?: number;
  notes?: string;
  deliveryTime?: string;
  returnTime?: string;
};

export async function updateRental(id: number, patch: Partial<RentalPatch>): Promise<RentalDTO> {
  return getStore().write(async (tx) => {
    const current = await rentalIn(tx, id);
    if (!current) throw new UserError("Reserva não encontrada.", 404);

    let status = current.status;
    if (typeof patch.status === "string") {
      if (!RENTAL_STATUSES.includes(patch.status as RentalStatus)) {
        throw new UserError("Status inválido.");
      }
      status = patch.status as RentalStatus;
    }

    // Reativar uma reserva cancelada só é possível se os brinquedos continuam livres.
    if (current.status === "cancelado" && status !== "cancelado") {
      const toys = await toysIn(tx);
      const reserved = await reservedIn(tx, current.startDate, current.endDate, id);
      const conflicts = findConflicts(asStock(toys, true), reserved, current.items);
      if (conflicts.length > 0) {
        throw new UserError(
          "Não dá para reativar: algum brinquedo desta reserva já foi alugado para outra pessoa nesta data.",
          409,
        );
      }
    }

    const gross = current.subtotalCents + current.deliveryFeeCents;
    const discountCents =
      typeof patch.discountCents === "number" && Number.isFinite(patch.discountCents)
        ? Math.min(gross, Math.max(0, Math.round(patch.discountCents)))
        : current.discountCents;
    const notes = typeof patch.notes === "string" ? text(patch.notes, 500) : current.notes;
    const deliveryTime = isTime(patch.deliveryTime) ? patch.deliveryTime : current.deliveryTime;
    const returnTime = isTime(patch.returnTime) ? patch.returnTime : current.returnTime;
    const timesChanged =
      deliveryTime !== current.deliveryTime || returnTime !== current.returnTime;

    await tx.update("mi_rentals", id, {
      status,
      discount_cents: discountCents,
      total_cents: gross - discountCents,
      notes,
      delivery_time: deliveryTime,
      return_time: returnTime,
      // horário ajustado pela empresa passa a ser o horário combinado
      custom_times: timesChanged ? false : current.customTimes,
    });

    const updated = await rentalIn(tx, id);
    if (!updated) throw new UserError("Reserva não encontrada.", 404);
    return updated;
  });
}

export async function deleteRental(id: number) {
  await getStore().write(async (tx) => {
    // os pagamentos já lançados continuam no financeiro, só perdem o vínculo
    for (const row of await tx.all<TransactionRow>("mi_transactions")) {
      if (row.rental_id === id) await tx.update("mi_transactions", row.id, { rental_id: null });
    }
    await tx.remove("mi_rentals", id);
  });
}

/* ---------- brinquedos (admin) ---------- */

export type ToyInput = {
  categoryId: number;
  name: string;
  detail: string;
  description: string;
  bonus: string;
  priceCents: number;
  stock: number;
  componentIds: number[];
  available: boolean;
  featured: boolean;
  /** data URL de imagem (jpeg/png/webp) ou "" para remover a foto */
  imageData: string;
};

const MAX_IMAGE_CHARS = 900_000;

function checkImage(imageData: string) {
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(imageData)) {
    throw new UserError("Envie a foto em JPG, PNG ou WebP.");
  }
  if (imageData.length > MAX_IMAGE_CHARS) {
    throw new UserError("A foto ficou grande demais. Tente uma imagem menor.");
  }
}

/** Endereço da foto enviada: na demonstração a própria imagem vai embutida. */
function imageUrlFor(id: number, imageData: string) {
  return getStore().kind === "navegador"
    ? imageData
    : `/api/products/${id}/image?v=${Date.now()}`;
}

/** Um combo só pode ser formado por brinquedos avulsos (e nunca por ele mesmo). */
function cleanComponents(componentIds: unknown, toys: ToyDTO[], selfId: number | null): number[] {
  const valid = new Set(
    toys.filter((t) => t.componentIds.length === 0 && t.id !== selfId).map((t) => t.id),
  );
  return toNumberArray(componentIds).filter((id) => valid.has(id));
}

function cleanStock(value: unknown) {
  return Math.max(1, Math.min(99, Math.round(Number(value) || 1)));
}

export async function createToy(input: Partial<ToyInput>): Promise<ToyDTO> {
  const name = text(input.name, 120);
  const categoryId = Number(input.categoryId);
  const priceCents = Math.round(Number(input.priceCents));
  if (!name) throw new UserError("Informe o nome do brinquedo.");
  if (!Number.isInteger(categoryId) || categoryId <= 0) throw new UserError("Escolha a categoria.");
  if (!Number.isFinite(priceCents) || priceCents <= 0) {
    throw new UserError("Informe o valor da diária.");
  }
  const imageData = typeof input.imageData === "string" ? input.imageData : "";
  if (imageData) checkImage(imageData);

  return getStore().write(async (tx) => {
    const toys = await toysIn(tx);
    const created = await tx.insert<ToyRow>("mi_toys", {
      category_id: categoryId,
      name,
      detail: text(input.detail, 80),
      description: text(input.description, 400),
      bonus: text(input.bonus, 80),
      price_cents: priceCents,
      stock: cleanStock(input.stock),
      image_url: "",
      component_ids: cleanComponents(input.componentIds, toys, null),
      available: true,
      featured: input.featured === true,
      position: 999,
    });
    if (imageData) {
      const imageUrl = imageUrlFor(created.id, imageData);
      await tx.setImage(created.id, imageData);
      await tx.update("mi_toys", created.id, { image_url: imageUrl });
      created.image_url = imageUrl;
    }
    return toToy(created);
  });
}

export async function updateToy(id: number, input: Partial<ToyInput>): Promise<ToyDTO> {
  return getStore().write(async (tx) => {
    const toys = await toysIn(tx);
    if (!toys.some((t) => t.id === id)) throw new UserError("Brinquedo não encontrado.", 404);

    const values: Record<string, unknown> = {};
    if (typeof input.name === "string" && input.name.trim()) values.name = text(input.name, 120);
    if (typeof input.detail === "string") values.detail = text(input.detail, 80);
    if (typeof input.description === "string") values.description = text(input.description, 400);
    if (typeof input.bonus === "string") values.bonus = text(input.bonus, 80);
    if (typeof input.available === "boolean") values.available = input.available;
    if (typeof input.featured === "boolean") values.featured = input.featured;
    if (input.categoryId !== undefined) {
      const categoryId = Number(input.categoryId);
      if (Number.isInteger(categoryId) && categoryId > 0) values.category_id = categoryId;
    }
    if (input.priceCents !== undefined) {
      const priceCents = Math.round(Number(input.priceCents));
      if (!Number.isFinite(priceCents) || priceCents <= 0) {
        throw new UserError("Informe um valor de diária válido.");
      }
      values.price_cents = priceCents;
    }
    if (input.stock !== undefined) values.stock = cleanStock(input.stock);
    if (input.componentIds !== undefined) {
      values.component_ids = cleanComponents(input.componentIds, toys, id);
    }
    if (typeof input.imageData === "string") {
      if (input.imageData === "") {
        await tx.setImage(id, null);
        values.image_url = "";
      } else {
        checkImage(input.imageData);
        await tx.setImage(id, input.imageData);
        values.image_url = imageUrlFor(id, input.imageData);
      }
    }

    await tx.update("mi_toys", id, values);
    const updated = (await toysIn(tx)).find((t) => t.id === id);
    if (!updated) throw new UserError("Brinquedo não encontrado.", 404);
    return updated;
  });
}

export async function deleteToy(id: number) {
  await getStore().write(async (tx) => {
    // tira o brinquedo dos combos que o usavam
    for (const toy of await toysIn(tx)) {
      if (!toy.componentIds.includes(id)) continue;
      await tx.update("mi_toys", toy.id, {
        component_ids: toy.componentIds.filter((componentId) => componentId !== id),
      });
    }
    await tx.remove("mi_toys", id);
  });
}

export async function loadToyImage(id: number): Promise<string | null> {
  return getStore().read((tx) => tx.getImage(id));
}

/* ---------- financeiro ---------- */

async function transactionsIn(tx: Tx): Promise<TransactionDTO[]> {
  const rows = await tx.all<TransactionRow>("mi_transactions");
  const codes = new Map(
    (await tx.all<RentalRow>("mi_rentals")).map((rental) => [rental.id, rental.code]),
  );
  return rows
    .sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1))
    .slice(0, 1000)
    .map((row) => ({
      id: row.id,
      kind: row.kind === "saida" ? "saida" : "entrada",
      amountCents: row.amount_cents,
      date: row.date,
      description: row.description,
      category: row.category,
      rentalId: row.rental_id,
      rentalCode: row.rental_id ? (codes.get(row.rental_id) ?? null) : null,
      createdAt: toISOString(row.created_at),
    }));
}

export async function listTransactions(): Promise<TransactionDTO[]> {
  return getStore().read(transactionsIn);
}

export type TransactionInput = {
  kind: string;
  amountCents: number;
  date: string;
  description: string;
  category: string;
  rentalId: number | null;
};

export async function createTransaction(
  input: Partial<TransactionInput>,
): Promise<TransactionDTO> {
  const kind = input.kind === "saida" ? "saida" : "entrada";
  const amountCents = Math.round(Number(input.amountCents));
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw new UserError("Informe o valor.");
  const date = isISODate(input.date) ? input.date : todayISO();
  const rentalId = Number(input.rentalId) > 0 ? Number(input.rentalId) : null;
  const description = text(input.description, 200);
  if (!description && !rentalId) throw new UserError("Descreva o lançamento.");

  return getStore().write(async (tx) => {
    const created = await tx.insert<TransactionRow>("mi_transactions", {
      kind,
      amount_cents: amountCents,
      date,
      description,
      category: text(input.category, 60),
      rental_id: rentalId,
    });
    const found = (await transactionsIn(tx)).find((t) => t.id === created.id);
    if (!found) throw new Error("Lançamento criado mas não encontrado");
    return found;
  });
}

export async function deleteTransaction(id: number) {
  await getStore().write((tx) => tx.remove("mi_transactions", id));
}

/* ---------- configurações ---------- */

const EDITABLE_SETTINGS = [
  "business_name",
  "whatsapp",
  "instagram",
  "delivery_time",
  "return_time",
  "pickup_address",
  "notice",
];

export type RegionInput = { id?: number; name: string; feeCents: number; active: boolean };

export async function saveSettings(
  settings: Record<string, unknown> | undefined,
  regions: RegionInput[] | undefined,
) {
  await getStore().write(async (tx) => {
    if (settings) {
      for (const key of EDITABLE_SETTINGS) {
        const raw = settings[key];
        if (typeof raw !== "string") continue;
        let value = raw.trim().slice(0, 400);
        if (key === "whatsapp") {
          value = onlyDigits(value);
          if (value.length === 10 || value.length === 11) value = `55${value}`;
          if (value.length < 12) throw new UserError("Informe o WhatsApp com DDD.");
        }
        if ((key === "delivery_time" || key === "return_time") && !isTime(value)) {
          throw new UserError("Horário inválido. Use o formato 09:00.");
        }
        if (key === "business_name" && !value) continue;
        await tx.setSetting(key, value);
      }
    }

    if (Array.isArray(regions)) {
      const existing = await tx.all<RegionRow>("mi_regions");
      const wanted: { id: number; name: string; feeCents: number; active: boolean }[] = [];
      const seen = new Set<string>();
      for (const region of regions) {
        const name = text(region?.name, 60);
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        const id = Number(region.id);
        const known =
          existing.find((r) => r.id === id) ??
          existing.find((r) => r.name.toLowerCase() === name.toLowerCase());
        wanted.push({
          id: known ? known.id : 0,
          name,
          feeCents: Math.max(0, Math.round(Number(region.feeCents) || 0)),
          active: region.active !== false,
        });
      }

      // primeiro remove as que saíram (libera o nome), depois grava as demais
      const keptIds = new Set(wanted.map((r) => r.id).filter((id) => id > 0));
      for (const row of existing) {
        if (!keptIds.has(row.id)) await tx.remove("mi_regions", row.id);
      }
      for (const [position, region] of wanted.entries()) {
        const values = {
          name: region.name,
          fee_cents: region.feeCents,
          active: region.active,
          position,
        };
        if (region.id > 0) await tx.update("mi_regions", region.id, values);
        else await tx.insert("mi_regions", values);
      }
    }
  });
}

export async function setAdminPasswordHash(hash: string) {
  await getStore().write((tx) => tx.setSetting("admin_password_hash", hash));
}

/**
 * Regras de disponibilidade por data.
 *
 * - Cada brinquedo avulso tem um estoque (quantas unidades a empresa possui).
 * - Um combo não tem estoque próprio: ele ocupa os brinquedos que o compõem.
 * - Uma reserva ocupa os brinquedos em todos os dias entre a entrega e a devolução.
 *
 * Tudo aqui é função pura, usada tanto no servidor (validação final do pedido)
 * quanto no navegador (para mostrar o que ainda cabe na sacolinha).
 */

export type StockToy = { id: number; stock: number; componentIds: number[] };

export type Demand = { toyId: number; quantity: number; componentIds?: number[] };

/** Converte itens (avulsos e combos) em unidades ocupadas por brinquedo avulso. */
export function expandDemand(
  items: Demand[],
  toysById: Map<number, StockToy>,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const item of items) {
    if (!item || !(item.quantity > 0)) continue;
    const components = item.componentIds ?? toysById.get(item.toyId)?.componentIds ?? [];
    const targets = components.length > 0 ? components : [item.toyId];
    for (const id of targets) out.set(id, (out.get(id) ?? 0) + item.quantity);
  }
  return out;
}

function countById(ids: number[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const id of ids) out.set(id, (out.get(id) ?? 0) + 1);
  return out;
}

/** Unidades livres de um brinquedo, dado o que já está ocupado. */
export function freeUnits(
  toy: StockToy,
  toysById: Map<number, StockToy>,
  occupied: Map<number, number>,
): number {
  if (toy.componentIds.length === 0) {
    return Math.max(0, toy.stock - (occupied.get(toy.id) ?? 0));
  }
  let free = Infinity;
  for (const [componentId, times] of countById(toy.componentIds)) {
    const component = toysById.get(componentId);
    if (!component) return 0;
    const left = Math.max(0, component.stock - (occupied.get(componentId) ?? 0));
    free = Math.min(free, Math.floor(left / times));
  }
  return Number.isFinite(free) ? free : 0;
}

/** Mapa id -> unidades livres para todos os brinquedos. */
export function computeAvailability(
  toys: StockToy[],
  reserved: Map<number, number>,
): Record<string, number> {
  const toysById = new Map(toys.map((t) => [t.id, t]));
  const out: Record<string, number> = {};
  for (const toy of toys) out[String(toy.id)] = freeUnits(toy, toysById, reserved);
  return out;
}

/**
 * Confere uma sacolinha inteira contra o que já está reservado.
 * Devolve os ids dos itens da sacolinha que não cabem mais.
 */
export function findConflicts(
  toys: StockToy[],
  reserved: Map<number, number>,
  cart: Demand[],
): number[] {
  const toysById = new Map(toys.map((t) => [t.id, t]));
  const wanted = expandDemand(cart, toysById);
  const overbooked = new Set<number>();
  for (const [toyId, quantity] of wanted) {
    const toy = toysById.get(toyId);
    const stock = toy ? toy.stock : 0;
    if (quantity > stock - (reserved.get(toyId) ?? 0)) overbooked.add(toyId);
  }
  if (overbooked.size === 0) return [];
  const conflicts: number[] = [];
  for (const item of cart) {
    const components = item.componentIds ?? toysById.get(item.toyId)?.componentIds ?? [];
    const targets = components.length > 0 ? components : [item.toyId];
    if (targets.some((id) => overbooked.has(id))) conflicts.push(item.toyId);
  }
  return conflicts;
}

/**
 * Quantas unidades de `toy` ainda dá para colocar na sacolinha,
 * considerando as reservas existentes e o que já está na sacolinha.
 */
export function remainingForCart(
  toy: StockToy,
  toys: StockToy[],
  reserved: Map<number, number>,
  cart: Demand[],
): number {
  const toysById = new Map(toys.map((t) => [t.id, t]));
  const occupied = new Map(reserved);
  for (const [id, quantity] of expandDemand(cart, toysById)) {
    occupied.set(id, (occupied.get(id) ?? 0) + quantity);
  }
  return freeUnits(toy, toysById, occupied);
}

/**
 * No navegador só temos o mapa de disponibilidade vindo do servidor.
 * Reconstrói "ocupado" (estoque - livre) para os brinquedos avulsos.
 */
export function reservedFromAvailability(
  toys: StockToy[],
  availability: Record<string, number>,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const toy of toys) {
    if (toy.componentIds.length > 0) continue;
    const free = availability[String(toy.id)] ?? toy.stock;
    out.set(toy.id, Math.max(0, toy.stock - free));
  }
  return out;
}

/** Datas circulam pelo sistema sempre como texto AAAA-MM-DD (sem fuso). */

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const WEEKDAYS_LONG = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];
export const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function isISODate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function toUTC(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Hoje no horário de Brasília, independente de onde o servidor roda. */
export function todayISO(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function diffDays(start: string, end: string): number {
  return Math.round((toUTC(end) - toUTC(start)) / 86_400_000);
}

/** Diárias cobradas: os dois dias contam (mesmo dia = 1 diária). */
export function rentalDays(start: string, end: string): number {
  return Math.max(1, diffDays(start, end) + 1);
}

export function addDays(iso: string, amount: number): string {
  const date = new Date(toUTC(iso) + amount * 86_400_000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function weekdayIndex(iso: string): number {
  return new Date(toUTC(iso)).getUTCDay();
}

/** "sáb, 10/10/2026" */
export function formatDateBR(iso: string): string {
  if (!isISODate(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${WEEKDAYS[weekdayIndex(iso)]}, ${d}/${m}/${y}`;
}

/** "10/10" */
export function formatDateShort(iso: string): string {
  if (!isISODate(iso)) return iso;
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** "sábado, 10 de outubro" */
export function formatDateLong(iso: string): string {
  if (!isISODate(iso)) return iso;
  const [, m, d] = iso.split("-").map(Number);
  return `${WEEKDAYS_LONG[weekdayIndex(iso)]}, ${d} de ${MONTHS[m - 1]}`;
}

export function isTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** "09:00" -> "9h", "13:30" -> "13h30" */
export function formatTime(time: string): string {
  if (!isTime(time)) return time;
  const [h, m] = time.split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

export function daysLabel(days: number): string {
  return days === 1 ? "1 diária" : `${days} diárias`;
}

/** "AAAA-MM" do mês de uma data */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
}

export function shiftMonth(key: string, amount: number): string {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

/** Dias de um mês para montar calendário: células vazias (null) antes do dia 1. */
export function monthGrid(key: string): (string | null)[] {
  const [y, m] = key.split("-").map(Number);
  const first = `${key}-01`;
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < weekdayIndex(first); i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(`${key}-${pad(d)}`);
  return cells;
}

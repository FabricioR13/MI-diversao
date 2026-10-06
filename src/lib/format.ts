export function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** "300" / "300,00" quando não há centavos quebrados — para etiquetas de preço. */
export function splitBRL(cents: number): { reais: string; centavos: string } {
  const abs = Math.abs(Math.round(cents));
  const reais = Math.floor(abs / 100).toLocaleString("pt-BR");
  const centavos = String(abs % 100).padStart(2, "0");
  return { reais, centavos };
}

export function parseBRLToCents(input: string) {
  const normalized = input
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

/** Centavos -> texto para campo de edição ("300,00"). */
export function centsToInput(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

/** "51992557812" -> "(51) 99255-7812" */
export function formatPhone(value: string) {
  let digits = onlyDigits(value);
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value;
}

/** Número pronto para o wa.me (com DDI 55). */
export function toWhatsAppNumber(value: string) {
  const digits = onlyDigits(value);
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function orderCode() {
  const time = Date.now().toString(36).toUpperCase().slice(-4);
  const random = Math.floor(Math.random() * 36 * 36)
    .toString(36)
    .toUpperCase()
    .padStart(2, "0");
  return `MI-${time}${random}`;
}

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

import { daysLabel, formatDateBR, formatTime } from "@/lib/dates";
import { formatBRL, formatPhone, toWhatsAppNumber } from "@/lib/format";
import { PAYMENT_LABEL, type PublicSettings, type RentalDTO } from "@/lib/types";

export { PAYMENT_LABEL };

/** Texto do pedido que o cliente envia para a empresa. */
export function buildOrderMessage(rental: RentalDTO, settings: PublicSettings): string {
  const lines: string[] = [];
  const isDelivery = rental.fulfillment === "entrega";

  lines.push(`🎈 *Pedido de locação — ${settings.businessName}*`);
  lines.push(`Pedido: *${rental.code}*`);
  lines.push("");
  lines.push(`*Cliente:* ${rental.customerName}`);
  lines.push(`*WhatsApp:* ${formatPhone(rental.phone)}`);
  lines.push("");
  lines.push(`📅 *Datas* (${daysLabel(rental.days)})`);
  lines.push(
    `${isDelivery ? "Entrega" : "Retirada"}: ${formatDateBR(rental.startDate)} às ${formatTime(rental.deliveryTime)}`,
  );
  lines.push(`Devolução: ${formatDateBR(rental.endDate)} às ${formatTime(rental.returnTime)}`);
  if (rental.customTimes) {
    lines.push("⚠️ _Horários escolhidos pelo cliente — precisam ser confirmados._");
  }
  lines.push("");
  lines.push("🎪 *Brinquedos*");
  for (const item of rental.items) {
    const detail = item.detail && item.componentIds.length === 0 ? ` (${item.detail})` : "";
    lines.push(
      `• ${item.quantity}x ${item.name}${detail} — ${formatBRL(item.unitPriceCents)}/diária`,
    );
    if (item.bonus) lines.push(`   🎁 Brinde: ${item.bonus}`);
  }
  lines.push("");
  if (isDelivery) {
    lines.push(`🚚 *Entrega em ${rental.regionName}*`);
    const address = [rental.address, rental.neighborhood].filter(Boolean).join(" — ");
    lines.push(`Endereço: ${address}`);
    if (rental.reference) lines.push(`Referência: ${rental.reference}`);
  } else {
    lines.push("📍 *Retirada pelo cliente*");
    lines.push(`Local: ${settings.pickupAddress || "a combinar"}`);
  }
  lines.push("");
  lines.push(`Brinquedos: ${formatBRL(rental.subtotalCents)}`);
  if (isDelivery) lines.push(`Frete: ${formatBRL(rental.deliveryFeeCents)}`);
  if (rental.discountCents > 0) lines.push(`Desconto: -${formatBRL(rental.discountCents)}`);
  lines.push(`*Total: ${formatBRL(rental.totalCents)}*`);
  lines.push(
    `Pagamento: ${PAYMENT_LABEL[rental.paymentMethod] ?? rental.paymentMethod} (finalizar aqui pelo WhatsApp)`,
  );
  if (rental.notes) {
    lines.push("");
    lines.push(`Obs.: ${rental.notes}`);
  }
  return lines.join("\n");
}

export function whatsappLink(number: string, text: string): string {
  return `https://wa.me/${toWhatsAppNumber(number)}?text=${encodeURIComponent(text)}`;
}

/** Mensagem que a empresa manda para o cliente a partir do painel. */
export function buildCustomerMessage(rental: RentalDTO, settings: PublicSettings): string {
  const isDelivery = rental.fulfillment === "entrega";
  return [
    `Olá, ${rental.customerName.split(" ")[0]}! Aqui é da ${settings.businessName} 🎈`,
    `Sobre o seu pedido *${rental.code}*:`,
    `${isDelivery ? "Entrega" : "Retirada"}: ${formatDateBR(rental.startDate)} às ${formatTime(rental.deliveryTime)}`,
    `Devolução: ${formatDateBR(rental.endDate)} às ${formatTime(rental.returnTime)}`,
    `Total: ${formatBRL(rental.totalCents)}`,
  ].join("\n");
}

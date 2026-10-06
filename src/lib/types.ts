export type ToyDTO = {
  id: number;
  categoryId: number;
  name: string;
  /** linha curta de apoio: tamanho, tema, etc. */
  detail: string;
  description: string;
  /** brinde incluso (ex.: "2 cavalinhos") */
  bonus: string;
  /** valor da diária em centavos */
  priceCents: number;
  /** quantas unidades a empresa tem deste brinquedo */
  stock: number;
  imageUrl: string;
  /** combos: ids dos brinquedos que compõem o combo (vazio = brinquedo avulso) */
  componentIds: number[];
  available: boolean;
  featured: boolean;
  position: number;
};

export type CategoryDTO = {
  id: number;
  slug: string;
  name: string;
  emoji: string;
  description: string;
  toys: ToyDTO[];
};

export type RegionDTO = {
  id: number;
  name: string;
  feeCents: number;
  active: boolean;
};

export type PublicSettings = {
  businessName: string;
  /** só dígitos, com DDI: 5551999999999 */
  whatsapp: string;
  instagram: string;
  /** HH:MM */
  deliveryTime: string;
  /** HH:MM */
  returnTime: string;
  pickupAddress: string;
  notice: string;
};

export type CatalogResponse = {
  categories: CategoryDTO[];
  regions: RegionDTO[];
  settings: PublicSettings;
  /** unidades livres por brinquedo no período pedido; null quando nenhuma data foi informada */
  availability: Record<string, number> | null;
  /** data de hoje (America/Sao_Paulo), AAAA-MM-DD */
  today: string;
};

export type Fulfillment = "entrega" | "retirada";

export type RentalStatus = "pendente" | "confirmado" | "entregue" | "devolvido" | "cancelado";

export const RENTAL_STATUSES: RentalStatus[] = [
  "pendente",
  "confirmado",
  "entregue",
  "devolvido",
  "cancelado",
];

export const STATUS_LABEL: Record<RentalStatus, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  entregue: "Entregue",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
};

export type RentalItem = {
  toyId: number;
  name: string;
  detail: string;
  bonus: string;
  unitPriceCents: number;
  quantity: number;
  /** cópia da composição do combo no momento do pedido */
  componentIds: number[];
};

export type RentalDTO = {
  id: number;
  code: string;
  customerName: string;
  phone: string;
  startDate: string;
  endDate: string;
  days: number;
  fulfillment: Fulfillment;
  regionName: string;
  address: string;
  neighborhood: string;
  reference: string;
  deliveryTime: string;
  returnTime: string;
  customTimes: boolean;
  paymentMethod: string;
  notes: string;
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  paidCents: number;
  status: RentalStatus;
  source: "site" | "manual";
  items: RentalItem[];
  createdAt: string;
};

export type TransactionKind = "entrada" | "saida";

export type TransactionDTO = {
  id: number;
  kind: TransactionKind;
  amountCents: number;
  /** AAAA-MM-DD */
  date: string;
  description: string;
  category: string;
  rentalId: number | null;
  rentalCode: string | null;
  createdAt: string;
};

export type CartLine = { toyId: number; quantity: number };

export type OrderInput = {
  customerName: string;
  phone: string;
  startDate: string;
  endDate: string;
  fulfillment: Fulfillment;
  regionId: number | null;
  address: string;
  neighborhood: string;
  reference: string;
  deliveryTime: string;
  returnTime: string;
  paymentMethod: string;
  notes: string;
  items: CartLine[];
  /** somente admin */
  manual?: boolean;
  discountCents?: number;
  status?: RentalStatus;
};

/** Formas de pagamento que o cliente pode escolher no pedido. */
export const PAYMENT_METHODS = ["pix", "dinheiro", "credito", "debito"] as const;

export const PAYMENT_LABEL: Record<string, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  credito: "Cartão de crédito",
  debito: "Cartão de débito",
  combinar: "A combinar",
};

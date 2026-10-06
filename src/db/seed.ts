import { getStore } from "@/db";
import type { Tx } from "@/db/store";

/**
 * Dados iniciais da MI Diversão.
 * Os valores dos combos vieram das postagens do Instagram; os valores avulsos
 * e os fretes são sugestões — ajuste tudo pelo painel (/admin).
 */

type SeedToy = {
  key: string;
  name: string;
  detail?: string;
  description?: string;
  bonus?: string;
  priceCents: number;
  image?: string;
  featured?: boolean;
  /** chaves dos brinquedos que formam o combo */
  components?: string[];
};

type SeedCategory = {
  slug: string;
  name: string;
  emoji: string;
  description: string;
  toys: SeedToy[];
};

/** Os avulsos vêm antes dos combos para que os combos encontrem seus componentes. */
const SEED: SeedCategory[] = [
  {
    slug: "inflaveis",
    name: "Infláveis",
    emoji: "🏰",
    description: "Castelos, tobogãs e o campeão das festas: o Futeinflável.",
    toys: [
      {
        key: "castelo",
        name: "Castelo Inflável 3 em 1",
        detail: "Pula-pula, escorregador e obstáculos",
        description: "Três brincadeiras em um só brinquedo. Cabe bem em pátios e salões.",
        priceCents: 28000,
        image: "castelo-inflavel.jpg",
        featured: true,
      },
      {
        key: "toboga",
        name: "Tobogã Inflável",
        detail: "4,4 m de altura",
        description: "O escorregador gigante que a criançada não larga.",
        priceCents: 38000,
        image: "toboga-4-4.jpg",
      },
      {
        key: "mini-toboga",
        name: "Mini Tobogã",
        detail: "Para os pequenos",
        description: "Versão compacta do tobogã, ótima para salões e espaços cobertos.",
        priceCents: 25000,
        image: "mini-toboga.jpg",
      },
      {
        key: "toboga-patrulha",
        name: "Tobogã Patrulha Canina",
        detail: "Temático",
        description: "Tobogã com o tema favorito da turminha.",
        priceCents: 33000,
        image: "toboga-patrulha.jpg",
      },
      {
        key: "toboga-aquatico",
        name: "Tobogã Aquático",
        detail: "Com piscina",
        description: "Escorregador com piscina para os dias de calor.",
        priceCents: 50000,
        image: "toboga-aquatico.jpg",
        featured: true,
      },
      {
        key: "futeinflavel",
        name: "Futeinflável",
        detail: "Futebol de sabão",
        description: "Campo inflável para todas as idades. Dá para usar até nos dias frios, sem água.",
        priceCents: 55000,
        image: "futeinflavel.jpg",
        featured: true,
      },
      {
        key: "toboga-stitch",
        name: "Tobogã Stitch",
        detail: "Novidade",
        description: "Inflável temático com escorregador.",
        priceCents: 25000,
        image: "toboga-stitch.jpg",
      },
      {
        key: "safari",
        name: "Safari Girafa",
        detail: "Novidade",
        description: "Inflável tema safári com túnel e escorregador.",
        priceCents: 38000,
        image: "safari-girafa.jpg",
      },
    ],
  },
  {
    slug: "pula-pula",
    name: "Cama elástica e bolinhas",
    emoji: "🤸",
    description: "Os clássicos que não podem faltar.",
    toys: [
      {
        key: "cama",
        name: "Cama Elástica",
        detail: "2,5 m com rede de proteção",
        description: "Pula-pula com rede e escadinha.",
        priceCents: 15000,
        image: "cama-elastica.jpg",
      },
      {
        key: "piscina",
        name: "Piscina de Bolinhas Patrulha",
        detail: "Com cobertura",
        description: "Piscina de bolinhas inflável, com rede de proteção.",
        priceCents: 20000,
        image: "piscina-bolinhas-patrulha.jpg",
      },
    ],
  },
  {
    slug: "mesas",
    name: "Mesas de jogos",
    emoji: "🎱",
    description: "Para a galera que não quer sair da festa.",
    toys: [
      {
        key: "fla-flu",
        name: "Mesa de Fla-Flu",
        detail: "Pebolim",
        description: "Mesa de pebolim profissional.",
        priceCents: 15000,
        image: "mesa-fla-flu.jpg",
      },
      {
        key: "air-hockey",
        name: "Mesa de Air Hockey",
        detail: "Elétrica",
        description: "Mesa de aero hockey com sopro de ar.",
        priceCents: 18000,
        image: "mesa-air-hockey.jpg",
      },
      {
        key: "sinuca",
        name: "Mesa de Sinuca",
        detail: "Com tacos e bolas",
        description: "Mesa de sinuca completa.",
        priceCents: 25000,
        image: "mesa-sinuca.jpg",
      },
    ],
  },
  {
    slug: "combos",
    name: "Combos promocionais",
    emoji: "🎉",
    description: "Os mais pedidos, já com desconto.",
    toys: [
      {
        key: "combo-cama-piscina",
        name: "Cama Elástica + Piscina de Bolinhas",
        detail: "Combo imperdível",
        bonus: "2 cavalinhos",
        priceCents: 30000,
        featured: true,
        components: ["cama", "piscina"],
      },
      {
        key: "combo-castelo-cama",
        name: "Castelo Inflável + Cama Elástica",
        detail: "Super promoção",
        priceCents: 40000,
        featured: true,
        components: ["castelo", "cama"],
      },
      {
        key: "combo-toboga-cama",
        name: "Tobogã 4,4 m + Cama Elástica",
        detail: "Oferta imperdível",
        priceCents: 50000,
        image: "combo-toboga-cama.jpg",
        components: ["toboga", "cama"],
      },
      {
        key: "combo-patrulha-cama",
        name: "Tobogã Patrulha + Cama Elástica",
        detail: "Temático",
        priceCents: 45000,
        components: ["toboga-patrulha", "cama"],
      },
      {
        key: "combo-stitch",
        name: "Combo Stitch",
        detail: "Novidade",
        bonus: "cavalinho gangorra",
        priceCents: 30000,
        image: "combo-stitch.jpg",
        components: ["toboga-stitch", "cama"],
      },
      {
        key: "combo-air-fla",
        name: "Air Hockey + Fla-Flu",
        detail: "A dupla das mesas",
        priceCents: 28000,
        image: "combo-air-hockey-fla-flu.jpg",
        components: ["air-hockey", "fla-flu"],
      },
      {
        key: "combo-sinuca-fla",
        name: "Sinuca + Fla-Flu",
        detail: "Diversão garantida",
        priceCents: 35000,
        image: "combo-sinuca-fla-flu.jpg",
        components: ["sinuca", "fla-flu"],
      },
      {
        key: "combo-air-mini",
        name: "Air Hockey + Mini Tobogã",
        detail: "Para todas as idades",
        priceCents: 42000,
        components: ["air-hockey", "mini-toboga"],
      },
    ],
  },
];

/** Na vitrine os combos aparecem primeiro. */
const CATEGORY_ORDER = ["combos", "inflaveis", "pula-pula", "mesas"];

/** Fretes simbólicos por cidade atendida — edite no painel. */
const REGIONS: { name: string; feeCents: number }[] = [
  { name: "Canoas", feeCents: 3000 },
  { name: "Esteio", feeCents: 4000 },
  { name: "Sapucaia do Sul", feeCents: 5000 },
  { name: "Nova Santa Rita", feeCents: 5000 },
  { name: "Cachoeirinha", feeCents: 5000 },
];

export const DEFAULT_SETTINGS: Record<string, string> = {
  business_name: "MI Diversão",
  whatsapp: "5551992557812",
  instagram: "midiversao_rs",
  delivery_time: "09:00",
  return_time: "21:00",
  pickup_address: "",
  notice:
    "Os valores são por diária. A reserva só é garantida depois da confirmação pelo WhatsApp.",
};

async function seedCatalog(tx: Tx) {
  const existing = await tx.all<{ id: number }>("mi_categories");
  if (existing.length > 0) return;

  const idByKey = new Map<string, number>();

  for (const category of SEED) {
    const created = await tx.insert<{ id: number }>("mi_categories", {
      slug: category.slug,
      name: category.name,
      emoji: category.emoji,
      description: category.description,
      position: CATEGORY_ORDER.indexOf(category.slug),
    });

    for (const [index, toy] of category.toys.entries()) {
      const componentIds = (toy.components ?? [])
        .map((key) => idByKey.get(key))
        .filter((id): id is number => typeof id === "number");

      const inserted = await tx.insert<{ id: number }>("mi_toys", {
        category_id: created.id,
        name: toy.name,
        detail: toy.detail ?? "",
        description: toy.description ?? "",
        bonus: toy.bonus ?? "",
        price_cents: toy.priceCents,
        stock: 1,
        image_url: toy.image ? `/brinquedos/${toy.image}` : "",
        component_ids: componentIds,
        available: true,
        featured: toy.featured ?? false,
        position: index,
      });
      idByKey.set(toy.key, inserted.id);
    }
  }
}

async function seedRegionsAndSettings(tx: Tx) {
  const regions = await tx.all<{ id: number }>("mi_regions");
  if (regions.length === 0) {
    for (const [index, region] of REGIONS.entries()) {
      await tx.insert("mi_regions", {
        name: region.name,
        fee_cents: region.feeCents,
        active: true,
        position: index,
      });
    }
  }
  const settings = await tx.settings();
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (settings[key] === undefined) await tx.setSetting(key, value);
  }
}

async function prepare() {
  const store = getStore();
  await store.init();
  await store.write(async (tx) => {
    await seedCatalog(tx);
    await seedRegionsAndSettings(tx);
  });
}

let ready: Promise<void> | null = null;

/** Garante estrutura e dados iniciais. Roda uma vez por processo. */
export function ensureReady() {
  if (!ready) {
    ready = prepare().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

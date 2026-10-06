import { loadToyImage } from "@/db/queries";
import { ensureReady } from "@/db/seed";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Foto enviada pelo painel (guardada no banco). */
export async function GET(_request: Request, { params }: Context) {
  try {
    await ensureReady();
    const { id } = await params;
    const data = await loadToyImage(Number(id) || 0);
    const match = data ? /^data:(image\/[a-z]+);base64,(.+)$/.exec(data) : null;
    if (!match) return new Response("Imagem não encontrada", { status: 404 });

    const bytes = Buffer.from(match[2], "base64");
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "Content-Type": match[1],
        // a URL muda (?v=...) sempre que a foto é trocada, então pode ficar em cache
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("GET /api/products/[id]/image", error);
    return new Response("Erro ao carregar imagem", { status: 500 });
  }
}

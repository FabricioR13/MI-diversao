/**
 * Endereço de uma imagem do site.
 * No site normal devolve o próprio caminho ("/logo.jpg"). Na demonstração de
 * arquivo único (Demonstracao.html) as imagens vão embutidas na página, e este
 * mapa troca o caminho pela imagem embutida.
 */
export function asset(url: string): string {
  const embedded = (globalThis as { __MI_ASSETS__?: Record<string, string> }).__MI_ASSETS__;
  return embedded?.[url] ?? url;
}

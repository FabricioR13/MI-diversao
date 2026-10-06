import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import * as session from "@/app/api/admin/session/route";
import * as catalog from "@/app/api/catalog/route";
import * as order from "@/app/api/orders/[id]/route";
import * as orders from "@/app/api/orders/route";
import * as product from "@/app/api/products/[id]/route";
import * as products from "@/app/api/products/route";
import * as settings from "@/app/api/settings/route";
import * as transaction from "@/app/api/transactions/[id]/route";
import * as transactions from "@/app/api/transactions/route";
import AdminPanel from "@/components/AdminPanel";
import CatalogApp from "@/components/CatalogApp";
import { DEMO_STORAGE_KEY } from "./db-navegador";

/**
 * Demonstração de arquivo único: as mesmas telas e as mesmas regras do site,
 * mas as "chamadas ao servidor" são atendidas aqui mesmo, no navegador.
 */

type Handler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;
type Handlers = Record<string, Handler | undefined>;

const ROUTES: { pattern: RegExp; handlers: Handlers }[] = [
  { pattern: /^\/api\/admin\/session\/?$/, handlers: session as unknown as Handlers },
  { pattern: /^\/api\/catalog\/?$/, handlers: catalog as unknown as Handlers },
  { pattern: /^\/api\/orders\/?$/, handlers: orders as unknown as Handlers },
  { pattern: /^\/api\/orders\/([^/]+)\/?$/, handlers: order as unknown as Handlers },
  { pattern: /^\/api\/products\/?$/, handlers: products as unknown as Handlers },
  { pattern: /^\/api\/products\/([^/]+)\/?$/, handlers: product as unknown as Handlers },
  { pattern: /^\/api\/settings\/?$/, handlers: settings as unknown as Handlers },
  { pattern: /^\/api\/transactions\/?$/, handlers: transactions as unknown as Handlers },
  { pattern: /^\/api\/transactions\/([^/]+)\/?$/, handlers: transaction as unknown as Handlers },
];

const networkFetch = window.fetch.bind(window);

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, "http://demonstracao.local");
  if (!url.pathname.startsWith("/api/")) return networkFetch(input, init);

  const method = (init?.method ?? "GET").toUpperCase();
  for (const route of ROUTES) {
    const match = route.pattern.exec(url.pathname);
    if (!match) continue;
    const handler = route.handlers[method];
    if (!handler) break;
    const request = new Request(url.href, {
      method,
      headers: init?.headers,
      body: method === "GET" ? undefined : init?.body,
    });
    return handler(request, { params: Promise.resolve({ id: match[1] ?? "" }) });
  }
  return new Response(JSON.stringify({ error: "Rota não disponível na demonstração." }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
};

function currentView() {
  return window.location.hash.startsWith("#/admin") ? "admin" : "catalogo";
}

function Demonstracao() {
  const [view, setView] = useState(currentView);

  useEffect(() => {
    const onHash = () => {
      setView(currentView());
      window.scrollTo(0, 0);
    };
    // os links "/" e "/admin" do site viram troca de tela dentro do arquivo
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const link = target?.closest ? target.closest("a") : null;
      const href = link?.getAttribute("href");
      if (href === "/" || href === "/admin") {
        event.preventDefault();
        window.location.hash = href === "/admin" ? "#/admin" : "#/";
      }
    };
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onClick);
    };
  }, []);

  function restart() {
    if (!window.confirm("Apagar os pedidos e cadastros de teste e recomeçar a demonstração?")) return;
    try {
      localStorage.removeItem(DEMO_STORAGE_KEY);
      localStorage.removeItem("mi-diversao-sacolinha-v1");
    } catch {
      /* nada guardado */
    }
    window.location.hash = "#/";
    window.location.reload();
  }

  return (
    <>
      <div className="mi-demo-bar">
        <span>
          <b>Demonstração.</b> Os pedidos e cadastros ficam salvos só neste navegador.
        </span>
        <span className="mi-demo-actions">
          <a href={view === "admin" ? "/" : "/admin"}>
            {view === "admin" ? "Ver catálogo" : "Abrir painel (senha midiversao2026)"}
          </a>
          <button type="button" onClick={restart}>
            Recomeçar
          </button>
        </span>
      </div>
      {view === "admin" ? <AdminPanel /> : <CatalogApp />}
    </>
  );
}

const container = document.getElementById("root");
if (container) createRoot(container).render(<Demonstracao />);

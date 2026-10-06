"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { asset } from "@/lib/assets";
import {
  daysLabel,
  formatDateBR,
  formatDateShort,
  formatTime,
  isISODate,
  monthGrid,
  monthKey,
  monthLabel,
  rentalDays,
  shiftMonth,
} from "@/lib/dates";
import { centsToInput, formatBRL, formatPhone, parseBRLToCents } from "@/lib/format";
import {
  PAYMENT_LABEL,
  PAYMENT_METHODS,
  RENTAL_STATUSES,
  STATUS_LABEL,
  type CatalogResponse,
  type CategoryDTO,
  type Fulfillment,
  type PublicSettings,
  type RegionDTO,
  type RentalDTO,
  type RentalStatus,
  type ToyDTO,
  type TransactionDTO,
  type TransactionKind,
} from "@/lib/types";
import { buildCustomerMessage, whatsappLink } from "@/lib/whatsapp";

/* ---------- comunicação com o servidor ---------- */

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: { error?: string } = {};
  try {
    data = (await response.json()) as { error?: string };
  } catch {
    /* resposta sem corpo */
  }
  if (!response.ok) throw new ApiError(data.error ?? "Não foi possível concluir.", response.status);
  return data as T;
}

type Tab = "resumo" | "reservas" | "brinquedos" | "financeiro" | "config";

type AdminData = {
  categories: CategoryDTO[];
  regions: RegionDTO[];
  settings: PublicSettings;
  today: string;
  rentals: RentalDTO[];
  transactions: TransactionDTO[];
};

type Shared = {
  data: AdminData;
  /** roda uma ação, mostra o aviso e recarrega os dados */
  run: (action: () => Promise<unknown>, done?: string) => Promise<boolean>;
};

const TABS: { id: Tab; label: string }[] = [
  { id: "resumo", label: "Resumo" },
  { id: "reservas", label: "Reservas" },
  { id: "brinquedos", label: "Brinquedos e valores" },
  { id: "financeiro", label: "Entradas e saídas" },
  { id: "config", label: "Configurações" },
];

const EXPENSE_CATEGORIES = [
  "Locação",
  "Sinal",
  "Combustível",
  "Manutenção",
  "Compra de brinquedo",
  "Ajudante",
  "Divulgação",
  "Outros",
];

function sumBy<T>(list: T[], pick: (item: T) => number) {
  return list.reduce((total, item) => total + pick(item), 0);
}

function itemsText(rental: RentalDTO) {
  return rental.items.map((i) => `${i.quantity > 1 ? `${i.quantity}x ` : ""}${i.name}`).join(", ");
}

/* ---------- painel ---------- */

export default function AdminPanel() {
  const [auth, setAuth] = useState<"checking" | "out" | "in">("checking");
  const [data, setData] = useState<AdminData | null>(null);
  const [tab, setTab] = useState<Tab>("resumo");
  const [toast, setToast] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [catalog, orders, finance] = await Promise.all([
      api<CatalogResponse>("/api/catalog?admin=1"),
      api<{ rentals: RentalDTO[] }>("/api/orders"),
      api<{ transactions: TransactionDTO[] }>("/api/transactions"),
    ]);
    setData({
      categories: catalog.categories,
      regions: catalog.regions,
      settings: catalog.settings,
      today: catalog.today,
      rentals: orders.rentals,
      transactions: finance.transactions,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await api<{ authenticated: boolean }>("/api/admin/session");
        if (cancelled) return;
        if (!session.authenticated) {
          setAuth("out");
          return;
        }
        await load();
        if (!cancelled) setAuth("in");
      } catch {
        if (!cancelled) setAuth("out");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const run = useCallback(
    async (action: () => Promise<unknown>, done?: string) => {
      try {
        await action();
        await load();
        if (done) setToast({ kind: "ok", text: done });
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setAuth("out");
          return false;
        }
        setToast({
          kind: "error",
          text: error instanceof Error ? error.message : "Não foi possível concluir.",
        });
        return false;
      }
    },
    [load],
  );

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setLoginError("");
    try {
      await api("/api/admin/session", "POST", { password });
      await load();
      setPassword("");
      setAuth("in");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await api("/api/admin/session", "DELETE");
    } catch {
      /* sai de qualquer forma */
    }
    setData(null);
    setAuth("out");
  }

  if (auth === "checking") {
    return (
      <div className="mi-app mi-adm">
        <p className="mi-empty">Carregando o painel…</p>
      </div>
    );
  }

  if (auth === "out" || !data) {
    return (
      <div className="mi-app mi-adm mi-adm-login">
        <form className="mi-adm-card mi-adm-loginbox" onSubmit={login}>
          <img src={asset("/logo.jpg")} alt="" width={84} height={84} />
          <h1 className="mi-display">Painel MI Diversão</h1>
          <p>Área dos administradores.</p>
          <label className="mi-field">
            <span>Senha</span>
            <input
              className="mi-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </label>
          {loginError ? <p className="mi-alert mi-alert-error">{loginError}</p> : null}
          <button className="mi-btn mi-btn-blue mi-btn-block" disabled={busy || !password}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
          <a className="mi-link" href="/">
            Voltar ao catálogo
          </a>
        </form>
      </div>
    );
  }

  const shared: Shared = { data, run };
  const pending = data.rentals.filter((r) => r.status === "pendente").length;

  return (
    <div className="mi-app mi-adm">
      <header className="mi-header">
        <div className="mi-wrap mi-header-in">
          <a className="mi-brand" href="/">
            <img src={asset("/logo.jpg")} alt="" width={46} height={46} />
            <span>
              <span className="mi-brand-name">{data.settings.businessName}</span>
              <span className="mi-brand-sub">Painel dos administradores</span>
            </span>
          </a>
          <div className="mi-adm-top">
            <a className="mi-btn mi-btn-small mi-btn-ghost" href="/">
              Ver catálogo
            </a>
            <button className="mi-btn mi-btn-small mi-btn-yellow" onClick={logout}>
              Sair
            </button>
          </div>
        </div>
      </header>

      <nav className="mi-catnav" aria-label="Seções do painel">
        <div className="mi-wrap mi-catnav-in">
          {TABS.map((t) => (
            <button key={t.id} className="mi-chip" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === "reservas" && pending > 0 ? ` (${pending})` : ""}
            </button>
          ))}
        </div>
      </nav>

      <main className="mi-wrap mi-adm-main">
        {tab === "resumo" ? <Dashboard {...shared} goTo={setTab} /> : null}
        {tab === "reservas" ? <Rentals {...shared} /> : null}
        {tab === "brinquedos" ? <Toys {...shared} /> : null}
        {tab === "financeiro" ? <Finance {...shared} /> : null}
        {tab === "config" ? <Settings {...shared} /> : null}
      </main>

      {toast ? (
        <div className={`mi-adm-toast mi-alert ${toast.kind === "ok" ? "mi-alert-ok" : "mi-alert-error"}`} role="status">
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className={`mi-adm-kpi${tone ? ` mi-adm-kpi-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function StatusBadge({ status }: { status: RentalStatus }) {
  return <span className={`mi-adm-badge mi-adm-badge-${status}`}>{STATUS_LABEL[status]}</span>;
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mi-adm-card">
      <div className="mi-adm-card-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ---------- resumo ---------- */

function Dashboard({ data, goTo }: Shared & { goTo: (tab: Tab) => void }) {
  const month = monthKey(data.today);
  const inMonth = data.transactions.filter((t) => monthKey(t.date) === month);
  const income = sumBy(inMonth.filter((t) => t.kind === "entrada"), (t) => t.amountCents);
  const expense = sumBy(inMonth.filter((t) => t.kind === "saida"), (t) => t.amountCents);
  const active = data.rentals.filter((r) => r.status !== "cancelado");
  const toReceive = sumBy(active, (r) => Math.max(0, r.totalCents - r.paidCents));
  const pending = data.rentals.filter((r) => r.status === "pendente");
  const upcoming = active
    .filter((r) => r.endDate >= data.today && r.status !== "devolvido")
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : a.id - b.id))
    .slice(0, 8);

  const months = [0, 1, 2, 3, 4, 5].map((back) => shiftMonth(month, -back));

  return (
    <>
      <div className="mi-adm-kpis">
        <Kpi label={`Entradas em ${monthLabel(month)}`} value={formatBRL(income)} tone="in" />
        <Kpi label={`Saídas em ${monthLabel(month)}`} value={formatBRL(expense)} tone="out" />
        <Kpi label="Saldo do mês" value={formatBRL(income - expense)} tone={income - expense >= 0 ? "in" : "out"} />
        <Kpi label="A receber" value={formatBRL(toReceive)} hint="reservas ativas ainda não pagas" />
      </div>

      {pending.length > 0 ? (
        <p className="mi-alert mi-alert-info">
          {pending.length === 1
            ? "Há 1 pedido novo aguardando confirmação."
            : `Há ${pending.length} pedidos novos aguardando confirmação.`}{" "}
          <button className="mi-link" onClick={() => goTo("reservas")}>
            Ver reservas
          </button>
        </p>
      ) : null}

      <Panel
        title="Próximas entregas e devoluções"
        action={
          <button className="mi-btn mi-btn-quiet" onClick={() => goTo("reservas")}>
            Todas as reservas
          </button>
        }
      >
        {upcoming.length === 0 ? (
          <p className="mi-empty">Nenhuma reserva futura por enquanto.</p>
        ) : (
          <div className="mi-adm-tablewrap">
            <table className="mi-adm-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Brinquedos</th>
                  <th>Modalidade</th>
                  <th>Situação</th>
                  <th className="mi-adm-num">Falta receber</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{formatDateBR(r.startDate)}</b>
                      <br />
                      {formatTime(r.deliveryTime)} → {r.endDate !== r.startDate ? `${formatDateShort(r.endDate)} ` : ""}
                      {formatTime(r.returnTime)}
                    </td>
                    <td>{r.customerName}</td>
                    <td>{itemsText(r)}</td>
                    <td>{r.fulfillment === "entrega" ? `Entrega — ${r.regionName || "a combinar"}` : "Retirada"}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="mi-adm-num">{formatBRL(Math.max(0, r.totalCents - r.paidCents))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Últimos 6 meses"
        action={
          <button className="mi-btn mi-btn-quiet" onClick={() => goTo("financeiro")}>
            Entradas e saídas
          </button>
        }
      >
        <div className="mi-adm-tablewrap">
          <table className="mi-adm-table">
            <thead>
              <tr>
                <th>Mês</th>
                <th className="mi-adm-num">Entradas</th>
                <th className="mi-adm-num">Saídas</th>
                <th className="mi-adm-num">Saldo</th>
                <th className="mi-adm-num">Reservas</th>
              </tr>
            </thead>
            <tbody>
              {months.map((key) => {
                const list = data.transactions.filter((t) => monthKey(t.date) === key);
                const entradas = sumBy(list.filter((t) => t.kind === "entrada"), (t) => t.amountCents);
                const saidas = sumBy(list.filter((t) => t.kind === "saida"), (t) => t.amountCents);
                const count = active.filter((r) => monthKey(r.startDate) === key).length;
                return (
                  <tr key={key}>
                    <td>{monthLabel(key)}</td>
                    <td className="mi-adm-num mi-adm-in">{formatBRL(entradas)}</td>
                    <td className="mi-adm-num mi-adm-out">{formatBRL(saidas)}</td>
                    <td className="mi-adm-num">
                      <b>{formatBRL(entradas - saidas)}</b>
                    </td>
                    <td className="mi-adm-num">{count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

/* ---------- reservas ---------- */

function Rentals({ data, run }: Shared) {
  const [view, setView] = useState<"lista" | "calendario">("lista");
  const [filter, setFilter] = useState<"ativas" | RentalStatus | "todas">("ativas");
  const [creating, setCreating] = useState(false);
  const [month, setMonth] = useState(monthKey(data.today));
  const [day, setDay] = useState(data.today);

  const filtered = data.rentals.filter((r) => {
    if (filter === "todas") return true;
    if (filter === "ativas") return r.status !== "cancelado" && r.status !== "devolvido";
    return r.status === filter;
  });

  const activeRentals = data.rentals.filter((r) => r.status !== "cancelado");
  const onDay = (iso: string) => activeRentals.filter((r) => r.startDate <= iso && r.endDate >= iso);

  return (
    <>
      <div className="mi-adm-toolbar">
        <div className="mi-adm-chips">
          <button className="mi-chip" aria-pressed={view === "lista"} onClick={() => setView("lista")}>
            Lista
          </button>
          <button className="mi-chip" aria-pressed={view === "calendario"} onClick={() => setView("calendario")}>
            Calendário
          </button>
        </div>
        <button className="mi-btn mi-btn-blue mi-btn-small" onClick={() => setCreating((v) => !v)}>
          {creating ? "Fechar" : "+ Nova reserva manual"}
        </button>
      </div>

      {creating ? <ManualRental data={data} run={run} onDone={() => setCreating(false)} /> : null}

      {view === "lista" ? (
        <>
          <div className="mi-adm-chips">
            {(["ativas", ...RENTAL_STATUSES, "todas"] as const).map((key) => (
              <button key={key} className="mi-chip" aria-pressed={filter === key} onClick={() => setFilter(key)}>
                {key === "ativas" ? "Em andamento" : key === "todas" ? "Todas" : STATUS_LABEL[key]}
                {key !== "todas" && key !== "ativas"
                  ? ` (${data.rentals.filter((r) => r.status === key).length})`
                  : ""}
              </button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <p className="mi-empty">Nenhuma reserva nesta lista.</p>
          ) : (
            <div className="mi-adm-list">
              {filtered.map((rental) => (
                <RentalCard key={rental.id} rental={rental} data={data} run={run} />
              ))}
            </div>
          )}
        </>
      ) : (
        <Panel
          title={monthLabel(month)}
          action={
            <div className="mi-adm-chips">
              <button className="mi-btn mi-btn-quiet" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mês anterior">
                ←
              </button>
              <button className="mi-btn mi-btn-quiet" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Próximo mês">
                →
              </button>
            </div>
          }
        >
          <div className="mi-adm-cal">
            {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((w) => (
              <span key={w} className="mi-adm-cal-week">
                {w}
              </span>
            ))}
            {monthGrid(month).map((iso, index) =>
              iso ? (
                <button
                  key={iso}
                  className={`mi-adm-cal-day${iso === day ? " mi-adm-cal-sel" : ""}${iso === data.today ? " mi-adm-cal-today" : ""}`}
                  onClick={() => setDay(iso)}
                >
                  <span>{Number(iso.slice(8))}</span>
                  {onDay(iso).length > 0 ? <b>{onDay(iso).length}</b> : null}
                </button>
              ) : (
                <span key={`vazio-${index}`} />
              ),
            )}
          </div>
          <h3 className="mi-adm-sub">{formatDateBR(day)}</h3>
          {onDay(day).length === 0 ? (
            <p className="mi-empty">Nenhum brinquedo alugado neste dia.</p>
          ) : (
            <div className="mi-adm-list">
              {onDay(day).map((rental) => (
                <RentalCard key={rental.id} rental={rental} data={data} run={run} />
              ))}
            </div>
          )}
        </Panel>
      )}
    </>
  );
}

function RentalCard({ rental, data, run }: Shared & { rental: RentalDTO }) {
  const [mode, setMode] = useState<"" | "pay" | "edit">("");
  const remaining = Math.max(0, rental.totalCents - rental.paidCents);
  const [amount, setAmount] = useState(centsToInput(remaining));
  const [payDate, setPayDate] = useState(data.today);
  const [payMethod, setPayMethod] = useState(
    PAYMENT_METHODS.some((m) => m === rental.paymentMethod) ? rental.paymentMethod : "pix",
  );
  const [discount, setDiscount] = useState(centsToInput(rental.discountCents));
  const [deliveryTime, setDeliveryTime] = useState(rental.deliveryTime);
  const [returnTime, setReturnTime] = useState(rental.returnTime);
  const [notes, setNotes] = useState(rental.notes);

  const isDelivery = rental.fulfillment === "entrega";

  async function pay(event: FormEvent) {
    event.preventDefault();
    const ok = await run(
      () =>
        api("/api/transactions", "POST", {
          kind: "entrada",
          amountCents: parseBRLToCents(amount),
          date: payDate,
          description: `Pagamento ${rental.code} — ${rental.customerName} (${PAYMENT_LABEL[payMethod] ?? payMethod})`,
          category: "Locação",
          rentalId: rental.id,
        }),
      "Pagamento registrado nas entradas.",
    );
    if (ok) setMode("");
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    const ok = await run(
      () =>
        api(`/api/orders/${rental.id}`, "PATCH", {
          discountCents: parseBRLToCents(discount),
          deliveryTime,
          returnTime,
          notes,
        }),
      "Reserva atualizada.",
    );
    if (ok) setMode("");
  }

  return (
    <article className={`mi-adm-card mi-adm-rental mi-adm-rental-${rental.status}`}>
      <div className="mi-adm-rental-head">
        <div>
          <b className="mi-adm-code">{rental.code}</b> <StatusBadge status={rental.status} />
          {rental.source === "manual" ? <span className="mi-adm-badge">manual</span> : null}
          {rental.customTimes ? <span className="mi-adm-badge mi-adm-badge-warn">horário a confirmar</span> : null}
        </div>
        <label className="mi-adm-status">
          <span>Situação</span>
          <select
            className="mi-input"
            value={rental.status}
            onChange={(e) => {
              const status = e.target.value;
              run(() => api(`/api/orders/${rental.id}`, "PATCH", { status }), "Situação atualizada.");
            }}
          >
            {RENTAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mi-adm-rental-grid">
        <div>
          <span className="mi-label">Cliente</span>
          <p>
            {rental.customerName}
            {rental.phone ? (
              <>
                <br />
                {formatPhone(rental.phone)}
              </>
            ) : null}
          </p>
        </div>
        <div>
          <span className="mi-label">Datas ({daysLabel(rental.days)})</span>
          <p>
            {isDelivery ? "Entrega" : "Retirada"}: {formatDateBR(rental.startDate)} às {formatTime(rental.deliveryTime)}
            <br />
            Devolução: {formatDateBR(rental.endDate)} às {formatTime(rental.returnTime)}
          </p>
        </div>
        <div>
          <span className="mi-label">{isDelivery ? "Entrega" : "Retirada pelo cliente"}</span>
          <p>
            {isDelivery
              ? [rental.address, rental.neighborhood, rental.regionName].filter(Boolean).join(" — ") || "Endereço a combinar"
              : "Sem frete"}
            {rental.reference ? (
              <>
                <br />
                Ref.: {rental.reference}
              </>
            ) : null}
          </p>
        </div>
        <div>
          <span className="mi-label">Brinquedos</span>
          <p>{itemsText(rental)}</p>
        </div>
      </div>

      {rental.notes ? <p className="mi-adm-notes">Obs.: {rental.notes}</p> : null}

      <dl className="mi-adm-money">
        <div>
          <dt>Brinquedos</dt>
          <dd>{formatBRL(rental.subtotalCents)}</dd>
        </div>
        <div>
          <dt>Frete</dt>
          <dd>{formatBRL(rental.deliveryFeeCents)}</dd>
        </div>
        {rental.discountCents > 0 ? (
          <div>
            <dt>Desconto</dt>
            <dd>-{formatBRL(rental.discountCents)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Total</dt>
          <dd>
            <b>{formatBRL(rental.totalCents)}</b>
          </dd>
        </div>
        <div>
          <dt>Pago</dt>
          <dd className="mi-adm-in">{formatBRL(rental.paidCents)}</dd>
        </div>
        <div>
          <dt>Falta</dt>
          <dd className={remaining > 0 ? "mi-adm-out" : "mi-adm-in"}>{formatBRL(remaining)}</dd>
        </div>
        <div>
          <dt>Pagamento</dt>
          <dd>{PAYMENT_LABEL[rental.paymentMethod] ?? rental.paymentMethod}</dd>
        </div>
      </dl>

      <div className="mi-adm-actions">
        <button
          className="mi-btn mi-btn-small mi-btn-green"
          onClick={() => {
            setAmount(centsToInput(remaining));
            setMode(mode === "pay" ? "" : "pay");
          }}
        >
          Receber pagamento
        </button>
        <button className="mi-btn mi-btn-small mi-btn-ghost" onClick={() => setMode(mode === "edit" ? "" : "edit")}>
          Desconto e horários
        </button>
        {rental.phone ? (
          <a
            className="mi-btn mi-btn-small mi-btn-ghost"
            href={whatsappLink(rental.phone, buildCustomerMessage(rental, data.settings))}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp do cliente
          </a>
        ) : null}
        <button
          className="mi-remove"
          onClick={() => {
            if (window.confirm(`Excluir a reserva ${rental.code}? Essa ação não pode ser desfeita.`)) {
              run(() => api(`/api/orders/${rental.id}`, "DELETE"), "Reserva excluída.");
            }
          }}
        >
          excluir
        </button>
      </div>

      {mode === "pay" ? (
        <form className="mi-adm-inline" onSubmit={pay}>
          <label className="mi-field">
            <span>Valor recebido (R$)</span>
            <input className="mi-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="mi-field">
            <span>Data</span>
            <input className="mi-input" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </label>
          <label className="mi-field">
            <span>Recebido em</span>
            <select className="mi-input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_LABEL[method]}
                </option>
              ))}
            </select>
          </label>
          <button className="mi-btn mi-btn-green">Lançar entrada</button>
        </form>
      ) : null}

      {mode === "edit" ? (
        <form className="mi-adm-inline" onSubmit={saveEdit}>
          <label className="mi-field">
            <span>Desconto (R$)</span>
            <input className="mi-input" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </label>
          <label className="mi-field">
            <span>{isDelivery ? "Hora da entrega" : "Hora da retirada"}</span>
            <input className="mi-input" type="time" value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} />
          </label>
          <label className="mi-field">
            <span>Hora da devolução</span>
            <input className="mi-input" type="time" value={returnTime} onChange={(e) => setReturnTime(e.target.value)} />
          </label>
          <label className="mi-field mi-adm-wide">
            <span>Observações</span>
            <input className="mi-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <button className="mi-btn mi-btn-blue">Salvar</button>
        </form>
      ) : null}
    </article>
  );
}

function ManualRental({ data, run, onDone }: Shared & { onDone: () => void }) {
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [startDate, setStartDate] = useState(data.today);
  const [endDate, setEndDate] = useState(data.today);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("entrega");
  const [regionId, setRegionId] = useState("");
  const [address, setAddress] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [discount, setDiscount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("combinar");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [availability, setAvailability] = useState<Record<string, number> | null>(null);

  const validPeriod = isISODate(startDate) && isISODate(endDate) && endDate >= startDate;

  useEffect(() => {
    if (!validPeriod) {
      setAvailability(null);
      return;
    }
    let cancelled = false;
    api<CatalogResponse>(`/api/catalog?admin=1&start=${startDate}&end=${endDate}`)
      .then((body) => {
        if (!cancelled) setAvailability(body.availability);
      })
      .catch(() => {
        if (!cancelled) setAvailability(null);
      });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, validPeriod]);

  const toys = data.categories.flatMap((c) => c.toys);
  const days = validPeriod ? rentalDays(startDate, endDate) : 1;
  const region = data.regions.find((r) => String(r.id) === regionId);
  const subtotal = sumBy(toys.filter((t) => selected.includes(t.id)), (t) => t.priceCents) * days;
  const fee = fulfillment === "entrega" && region ? region.feeCents : 0;
  const total = Math.max(0, subtotal + fee - parseBRLToCents(discount || "0"));

  function toggle(id: number) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await run(
      () =>
        api("/api/orders", "POST", {
          manual: true,
          customerName,
          phone,
          startDate,
          endDate,
          fulfillment,
          regionId: region ? region.id : null,
          address,
          neighborhood,
          reference: "",
          paymentMethod,
          notes,
          discountCents: parseBRLToCents(discount || "0"),
          items: selected.map((toyId) => ({ toyId, quantity: 1 })),
        }),
      "Reserva registrada e datas bloqueadas no catálogo.",
    );
    if (ok) onDone();
  }

  return (
    <Panel title="Nova reserva manual">
      <p className="mi-adm-hint">
        Use para reservas combinadas por telefone ou Instagram. Os brinquedos ficam bloqueados no
        catálogo nessas datas.
      </p>
      <form className="mi-adm-form" onSubmit={submit}>
        <label className="mi-field">
          <span>Cliente</span>
          <input className="mi-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
        </label>
        <label className="mi-field">
          <span>WhatsApp (opcional)</span>
          <input className="mi-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="mi-field">
          <span>Entrega ou retirada</span>
          <input
            className="mi-input"
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (endDate < e.target.value) setEndDate(e.target.value);
            }}
          />
        </label>
        <label className="mi-field">
          <span>Devolução</span>
          <input className="mi-input" type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <label className="mi-field">
          <span>Modalidade</span>
          <select className="mi-input" value={fulfillment} onChange={(e) => setFulfillment(e.target.value === "retirada" ? "retirada" : "entrega")}>
            <option value="entrega">Entrega</option>
            <option value="retirada">Retirada pelo cliente</option>
          </select>
        </label>
        {fulfillment === "entrega" ? (
          <>
            <label className="mi-field">
              <span>Cidade (frete)</span>
              <select className="mi-input" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
                <option value="">Sem frete / a combinar</option>
                {data.regions.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.name} — {formatBRL(r.feeCents)}
                  </option>
                ))}
              </select>
            </label>
            <label className="mi-field">
              <span>Rua e número</span>
              <input className="mi-input" value={address} onChange={(e) => setAddress(e.target.value)} />
            </label>
            <label className="mi-field">
              <span>Bairro</span>
              <input className="mi-input" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
            </label>
          </>
        ) : null}
        <label className="mi-field">
          <span>Desconto (R$)</span>
          <input className="mi-input" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0,00" />
        </label>
        <label className="mi-field">
          <span>Forma de pagamento</span>
          <select className="mi-input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option value="combinar">{PAYMENT_LABEL.combinar}</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {PAYMENT_LABEL[method]}
              </option>
            ))}
          </select>
        </label>
        <label className="mi-field mi-adm-wide">
          <span>Observações</span>
          <input className="mi-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        <fieldset className="mi-adm-wide mi-adm-picks">
          <legend className="mi-label">Brinquedos ({daysLabel(days)})</legend>
          {toys.map((toy) => {
            const free = availability ? (availability[String(toy.id)] ?? 0) : 1;
            const checked = selected.includes(toy.id);
            return (
              <label key={toy.id} className={`mi-adm-pick${free <= 0 && !checked ? " mi-adm-pick-off" : ""}`}>
                <input type="checkbox" checked={checked} disabled={free <= 0 && !checked} onChange={() => toggle(toy.id)} />
                <span>
                  {toy.name}
                  <small>{free <= 0 ? "reservado nesta data" : formatBRL(toy.priceCents)}</small>
                </span>
              </label>
            );
          })}
        </fieldset>

        <div className="mi-adm-wide mi-adm-formfoot">
          <span>
            Total: <b>{formatBRL(total)}</b>
          </span>
          <button className="mi-btn mi-btn-blue" disabled={!customerName.trim() || selected.length === 0 || !validPeriod}>
            Registrar reserva
          </button>
        </div>
      </form>
    </Panel>
  );
}

/* ---------- brinquedos ---------- */

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a foto."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Arquivo de imagem inválido."));
      image.onload = () => {
        const scale = Math.min(1, 900 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Não foi possível preparar a foto."));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

type ToyDraft = {
  categoryId: string;
  name: string;
  detail: string;
  description: string;
  bonus: string;
  price: string;
  stock: string;
  componentIds: number[];
  imageData: string | null;
};

function draftFrom(toy: ToyDTO | null, firstCategory: number): ToyDraft {
  return {
    categoryId: String(toy ? toy.categoryId : firstCategory),
    name: toy?.name ?? "",
    detail: toy?.detail ?? "",
    description: toy?.description ?? "",
    bonus: toy?.bonus ?? "",
    price: toy ? centsToInput(toy.priceCents) : "",
    stock: String(toy?.stock ?? 1),
    componentIds: toy?.componentIds ?? [],
    imageData: null,
  };
}

function ToyForm({
  toy,
  data,
  run,
  onDone,
}: Shared & { toy: ToyDTO | null; onDone: () => void }) {
  const [draft, setDraft] = useState<ToyDraft>(() => draftFrom(toy, data.categories[0]?.id ?? 0));
  const [photoError, setPhotoError] = useState("");
  const baseToys = data.categories
    .flatMap((c) => c.toys)
    .filter((t) => t.componentIds.length === 0 && t.id !== toy?.id);
  const isCombo = draft.componentIds.length > 0;

  function patch(value: Partial<ToyDraft>) {
    setDraft((prev) => ({ ...prev, ...value }));
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoError("");
    try {
      patch({ imageData: await resizeImage(file) });
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Não foi possível usar a foto.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body: Record<string, unknown> = {
      categoryId: Number(draft.categoryId),
      name: draft.name,
      detail: draft.detail,
      description: draft.description,
      bonus: draft.bonus,
      priceCents: parseBRLToCents(draft.price),
      stock: Number(draft.stock) || 1,
      componentIds: draft.componentIds,
    };
    if (draft.imageData !== null) body.imageData = draft.imageData;
    const ok = await run(
      () => (toy ? api(`/api/products/${toy.id}`, "PATCH", body) : api("/api/products", "POST", body)),
      toy ? "Brinquedo atualizado." : "Brinquedo cadastrado.",
    );
    if (ok) onDone();
  }

  const preview = draft.imageData ?? toy?.imageUrl ?? "";

  return (
    <form className="mi-adm-form" onSubmit={submit}>
      <label className="mi-field">
        <span>Nome</span>
        <input className="mi-input" value={draft.name} onChange={(e) => patch({ name: e.target.value })} required />
      </label>
      <label className="mi-field">
        <span>Categoria</span>
        <select className="mi-input" value={draft.categoryId} onChange={(e) => patch({ categoryId: e.target.value })}>
          {data.categories.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="mi-field">
        <span>Valor da diária (R$)</span>
        <input className="mi-input" inputMode="decimal" value={draft.price} onChange={(e) => patch({ price: e.target.value })} placeholder="300,00" required />
      </label>
      <label className="mi-field">
        <span>Quantidade que a empresa tem</span>
        <input className="mi-input" type="number" min={1} max={99} value={draft.stock} disabled={isCombo} onChange={(e) => patch({ stock: e.target.value })} />
        {isCombo ? <small>Combo usa a quantidade dos brinquedos que o compõem.</small> : null}
      </label>
      <label className="mi-field">
        <span>Linha de apoio</span>
        <input className="mi-input" value={draft.detail} onChange={(e) => patch({ detail: e.target.value })} placeholder="2,5 m com rede de proteção" />
      </label>
      <label className="mi-field">
        <span>Brinde (opcional)</span>
        <input className="mi-input" value={draft.bonus} onChange={(e) => patch({ bonus: e.target.value })} placeholder="2 cavalinhos" />
      </label>
      <label className="mi-field mi-adm-wide">
        <span>Descrição</span>
        <input className="mi-input" value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
      </label>

      <fieldset className="mi-adm-wide mi-adm-picks">
        <legend className="mi-label">É um combo? Marque os brinquedos que fazem parte</legend>
        {baseToys.map((base) => (
          <label key={base.id} className="mi-adm-pick">
            <input
              type="checkbox"
              checked={draft.componentIds.includes(base.id)}
              onChange={() =>
                patch({
                  componentIds: draft.componentIds.includes(base.id)
                    ? draft.componentIds.filter((id) => id !== base.id)
                    : [...draft.componentIds, base.id],
                })
              }
            />
            <span>{base.name}</span>
          </label>
        ))}
      </fieldset>

      <div className="mi-adm-wide mi-adm-photo">
        {preview ? <img src={asset(preview)} alt="" /> : <div className="mi-adm-nophoto">sem foto</div>}
        <label className="mi-field">
          <span>Foto do brinquedo</span>
          <input type="file" accept="image/*" onChange={(e) => pickPhoto(e.target.files?.[0])} />
          <small>Fotos na vertical ficam melhores no catálogo. Combos sem foto mostram as fotos dos brinquedos.</small>
          {photoError ? <small className="mi-line-bad">{photoError}</small> : null}
        </label>
        {toy && (toy.imageUrl || draft.imageData) ? (
          <button type="button" className="mi-remove" onClick={() => patch({ imageData: "" })}>
            remover foto
          </button>
        ) : null}
      </div>

      <div className="mi-adm-wide mi-adm-formfoot">
        <button type="button" className="mi-btn mi-btn-quiet" onClick={onDone}>
          Cancelar
        </button>
        <button className="mi-btn mi-btn-blue">{toy ? "Salvar alterações" : "Cadastrar"}</button>
      </div>
    </form>
  );
}

function ToyRow({ toy, data, run }: Shared & { toy: ToyDTO }) {
  const [price, setPrice] = useState(centsToInput(toy.priceCents));
  const [editing, setEditing] = useState(false);
  const toysById = useMemo(
    () => new Map(data.categories.flatMap((c) => c.toys).map((t) => [t.id, t])),
    [data.categories],
  );
  const isCombo = toy.componentIds.length > 0;
  const thumb = toy.imageUrl || toysById.get(toy.componentIds[0] ?? 0)?.imageUrl || "";

  useEffect(() => {
    setPrice(centsToInput(toy.priceCents));
  }, [toy.priceCents]);

  function savePrice() {
    const cents = parseBRLToCents(price);
    if (cents === toy.priceCents) return;
    if (cents <= 0) {
      setPrice(centsToInput(toy.priceCents));
      return;
    }
    run(() => api(`/api/products/${toy.id}`, "PATCH", { priceCents: cents }), `Valor de ${toy.name} atualizado.`);
  }

  return (
    <div className={`mi-adm-toy${toy.available ? "" : " mi-adm-toy-off"}`}>
      <div className="mi-adm-toy-row">
        <div className="mi-line-thumb">{thumb ? <img src={asset(thumb)} alt="" /> : <span aria-hidden="true">🎈</span>}</div>
        <div className="mi-adm-toy-name">
          <b>{toy.name}</b>
          <small>
            {isCombo
              ? `Combo: ${toy.componentIds.map((id) => toysById.get(id)?.name ?? "?").join(" + ")}`
              : `${toy.stock} ${toy.stock === 1 ? "unidade" : "unidades"}${toy.detail ? ` · ${toy.detail}` : ""}`}
            {toy.bonus ? ` · brinde: ${toy.bonus}` : ""}
          </small>
        </div>
        <label className="mi-field mi-adm-price">
          <span>Diária (R$)</span>
          <input
            className="mi-input"
            inputMode="decimal"
            value={price}
            aria-label={`Diária de ${toy.name}`}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={savePrice}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </label>
        <label className="mi-adm-check">
          <input
            type="checkbox"
            checked={toy.available}
            onChange={(e) => {
              const available = e.target.checked;
              run(
                () => api(`/api/products/${toy.id}`, "PATCH", { available }),
                available ? "Brinquedo visível no catálogo." : "Brinquedo oculto do catálogo.",
              );
            }}
          />
          <span>No catálogo</span>
        </label>
        <label className="mi-adm-check">
          <input
            type="checkbox"
            checked={toy.featured}
            onChange={(e) => {
              const featured = e.target.checked;
              run(() => api(`/api/products/${toy.id}`, "PATCH", { featured }));
            }}
          />
          <span>Mais pedido</span>
        </label>
        <div className="mi-adm-actions">
          <button className="mi-btn mi-btn-quiet" onClick={() => setEditing((v) => !v)}>
            {editing ? "Fechar" : "Editar"}
          </button>
          <button
            className="mi-remove"
            onClick={() => {
              if (window.confirm(`Excluir "${toy.name}" do catálogo?`)) {
                run(() => api(`/api/products/${toy.id}`, "DELETE"), "Brinquedo excluído.");
              }
            }}
          >
            excluir
          </button>
        </div>
      </div>
      {editing ? <ToyForm toy={toy} data={data} run={run} onDone={() => setEditing(false)} /> : null}
    </div>
  );
}

function Toys({ data, run }: Shared) {
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className="mi-adm-toolbar">
        <p className="mi-adm-hint">
          Altere o valor da diária direto no campo: salva ao sair dele. Os valores valem para os
          próximos pedidos.
        </p>
        <button className="mi-btn mi-btn-blue mi-btn-small" onClick={() => setCreating((v) => !v)}>
          {creating ? "Fechar" : "+ Novo brinquedo ou combo"}
        </button>
      </div>
      {creating ? (
        <Panel title="Novo brinquedo ou combo">
          <ToyForm toy={null} data={data} run={run} onDone={() => setCreating(false)} />
        </Panel>
      ) : null}
      {data.categories.map((category) => (
        <Panel key={category.id} title={`${category.emoji} ${category.name}`}>
          {category.toys.length === 0 ? (
            <p className="mi-empty">Nenhum brinquedo nesta categoria.</p>
          ) : (
            category.toys.map((toy) => <ToyRow key={toy.id} toy={toy} data={data} run={run} />)
          )}
        </Panel>
      ))}
    </>
  );
}

/* ---------- financeiro ---------- */

function Finance({ data, run }: Shared) {
  const [month, setMonth] = useState(monthKey(data.today));
  const [kind, setKind] = useState<TransactionKind>("saida");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(data.today);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");

  const list = data.transactions.filter((t) => monthKey(t.date) === month);
  const income = sumBy(list.filter((t) => t.kind === "entrada"), (t) => t.amountCents);
  const expense = sumBy(list.filter((t) => t.kind === "saida"), (t) => t.amountCents);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await run(
      () =>
        api("/api/transactions", "POST", {
          kind,
          amountCents: parseBRLToCents(amount),
          date,
          description,
          category,
        }),
      kind === "entrada" ? "Entrada lançada." : "Saída lançada.",
    );
    if (ok) {
      setAmount("");
      setDescription("");
      if (isISODate(date)) setMonth(monthKey(date));
    }
  }

  return (
    <>
      <div className="mi-adm-toolbar">
        <div className="mi-adm-chips">
          <button className="mi-btn mi-btn-quiet" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mês anterior">
            ←
          </button>
          <b className="mi-adm-month">{monthLabel(month)}</b>
          <button className="mi-btn mi-btn-quiet" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Próximo mês">
            →
          </button>
        </div>
      </div>

      <div className="mi-adm-kpis">
        <Kpi label="Entradas" value={formatBRL(income)} tone="in" />
        <Kpi label="Saídas" value={formatBRL(expense)} tone="out" />
        <Kpi label="Saldo" value={formatBRL(income - expense)} tone={income - expense >= 0 ? "in" : "out"} />
      </div>

      <Panel title="Novo lançamento">
        <form className="mi-adm-form" onSubmit={submit}>
          <div className="mi-field">
            <span>Tipo</span>
            <div className="mi-seg">
              <button type="button" aria-pressed={kind === "entrada"} onClick={() => setKind("entrada")}>
                Entrada
              </button>
              <button type="button" aria-pressed={kind === "saida"} onClick={() => setKind("saida")}>
                Saída
              </button>
            </div>
          </div>
          <label className="mi-field">
            <span>Valor (R$)</span>
            <input className="mi-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" required />
          </label>
          <label className="mi-field">
            <span>Data</span>
            <input className="mi-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="mi-field">
            <span>Categoria</span>
            <input className="mi-input" list="mi-categorias" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Combustível, manutenção…" />
            <datalist id="mi-categorias">
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="mi-field mi-adm-wide">
            <span>Descrição</span>
            <input className="mi-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: gasolina para entrega em Esteio" required />
          </label>
          <div className="mi-adm-wide mi-adm-formfoot">
            <span className="mi-adm-hint">Pagamentos de reservas podem ser lançados direto na reserva.</span>
            <button className="mi-btn mi-btn-blue">Lançar {kind === "entrada" ? "entrada" : "saída"}</button>
          </div>
        </form>
      </Panel>

      <Panel title={`Lançamentos de ${monthLabel(month)}`}>
        {list.length === 0 ? (
          <p className="mi-empty">Nenhum lançamento neste mês.</p>
        ) : (
          <div className="mi-adm-tablewrap">
            <table className="mi-adm-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th className="mi-adm-num">Valor</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.id}>
                    <td>{formatDateBR(t.date)}</td>
                    <td>
                      {t.description || "—"}
                      {t.rentalCode ? <small className="mi-adm-code"> · {t.rentalCode}</small> : null}
                    </td>
                    <td>{t.category || "—"}</td>
                    <td className={`mi-adm-num ${t.kind === "entrada" ? "mi-adm-in" : "mi-adm-out"}`}>
                      {t.kind === "entrada" ? "+" : "−"}
                      {formatBRL(t.amountCents)}
                    </td>
                    <td className="mi-adm-num">
                      <button
                        className="mi-remove"
                        onClick={() => {
                          if (window.confirm("Excluir este lançamento?")) {
                            run(() => api(`/api/transactions/${t.id}`, "DELETE"), "Lançamento excluído.");
                          }
                        }}
                      >
                        excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

/* ---------- configurações ---------- */

type RegionDraft = { id?: number; name: string; fee: string; active: boolean };

function Settings({ data, run }: Shared) {
  const [settings, setSettings] = useState<PublicSettings>(data.settings);
  const [regions, setRegions] = useState<RegionDraft[]>(() =>
    data.regions.map((r) => ({ id: r.id, name: r.name, fee: centsToInput(r.feeCents), active: r.active })),
  );
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  function patch(value: Partial<PublicSettings>) {
    setSettings((prev) => ({ ...prev, ...value }));
  }

  function patchRegion(index: number, value: Partial<RegionDraft>) {
    setRegions((prev) => prev.map((r, i) => (i === index ? { ...r, ...value } : r)));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    await run(
      () =>
        api("/api/settings", "PUT", {
          settings,
          regions: regions.map((r) => ({
            id: r.id,
            name: r.name,
            feeCents: parseBRLToCents(r.fee || "0"),
            active: r.active,
          })),
        }),
      "Configurações salvas.",
    );
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    const ok = await run(
      () => api("/api/settings", "PUT", { currentPassword, newPassword }),
      "Senha alterada.",
    );
    if (ok) {
      setCurrentPassword("");
      setNewPassword("");
    }
  }

  return (
    <>
      <form onSubmit={save} className="mi-adm-stack">
        <Panel title="Dados do negócio">
          <div className="mi-adm-form">
            <label className="mi-field">
              <span>Nome da empresa</span>
              <input className="mi-input" value={settings.businessName} onChange={(e) => patch({ businessName: e.target.value })} />
            </label>
            <label className="mi-field">
              <span>WhatsApp que recebe os pedidos</span>
              <input className="mi-input" type="tel" value={settings.whatsapp} onChange={(e) => patch({ whatsapp: e.target.value })} />
              <small>Com DDD. Ex.: (51) 99255-7812</small>
            </label>
            <label className="mi-field">
              <span>Instagram (sem @)</span>
              <input className="mi-input" value={settings.instagram} onChange={(e) => patch({ instagram: e.target.value })} />
            </label>
            <label className="mi-field">
              <span>Endereço para retirada</span>
              <input className="mi-input" value={settings.pickupAddress} onChange={(e) => patch({ pickupAddress: e.target.value })} placeholder="Deixe vazio para combinar pelo WhatsApp" />
            </label>
            <label className="mi-field">
              <span>Horário padrão de entrega</span>
              <input className="mi-input" type="time" value={settings.deliveryTime} onChange={(e) => patch({ deliveryTime: e.target.value })} />
            </label>
            <label className="mi-field">
              <span>Horário padrão de devolução</span>
              <input className="mi-input" type="time" value={settings.returnTime} onChange={(e) => patch({ returnTime: e.target.value })} />
            </label>
            <label className="mi-field mi-adm-wide">
              <span>Aviso no topo do catálogo</span>
              <input className="mi-input" value={settings.notice} onChange={(e) => patch({ notice: e.target.value })} />
            </label>
          </div>
        </Panel>

        <Panel
          title="Cidades atendidas e frete"
          action={
            <button
              type="button"
              className="mi-btn mi-btn-quiet"
              onClick={() => setRegions((prev) => [...prev, { name: "", fee: "", active: true }])}
            >
              + Cidade
            </button>
          }
        >
          <div className="mi-adm-regions">
            {regions.map((region, index) => (
              <div className="mi-adm-region" key={region.id ?? `nova-${index}`}>
                <label className="mi-field">
                  <span>Cidade</span>
                  <input className="mi-input" value={region.name} onChange={(e) => patchRegion(index, { name: e.target.value })} />
                </label>
                <label className="mi-field">
                  <span>Frete (R$)</span>
                  <input className="mi-input" inputMode="decimal" value={region.fee} onChange={(e) => patchRegion(index, { fee: e.target.value })} />
                </label>
                <label className="mi-adm-check">
                  <input type="checkbox" checked={region.active} onChange={(e) => patchRegion(index, { active: e.target.checked })} />
                  <span>Atendendo</span>
                </label>
                <button type="button" className="mi-remove" onClick={() => setRegions((prev) => prev.filter((_, i) => i !== index))}>
                  remover
                </button>
              </div>
            ))}
          </div>
        </Panel>

        <div className="mi-adm-formfoot">
          <span className="mi-adm-hint">As mudanças aparecem no catálogo assim que você salva.</span>
          <button className="mi-btn mi-btn-blue">Salvar configurações</button>
        </div>
      </form>

      <Panel title="Senha do painel">
        <form className="mi-adm-form" onSubmit={changePassword}>
          <label className="mi-field">
            <span>Senha atual</span>
            <input className="mi-input" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </label>
          <label className="mi-field">
            <span>Nova senha (mínimo 6 caracteres)</span>
            <input className="mi-input" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </label>
          <div className="mi-adm-wide mi-adm-formfoot">
            <span />
            <button className="mi-btn mi-btn-ghost" disabled={!currentPassword || newPassword.length < 6}>
              Trocar senha
            </button>
          </div>
        </form>
      </Panel>
    </>
  );
}

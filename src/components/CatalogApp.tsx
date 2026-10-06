"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { asset } from "@/lib/assets";
import {
  findConflicts,
  remainingForCart,
  reservedFromAvailability,
  type Demand,
  type StockToy,
} from "@/lib/availability";
import {
  daysLabel,
  formatDateBR,
  formatDateLong,
  formatDateShort,
  formatTime,
  isISODate,
  isTime,
  rentalDays,
} from "@/lib/dates";
import { formatBRL, formatPhone, onlyDigits, splitBRL } from "@/lib/format";
import {
  PAYMENT_LABEL,
  PAYMENT_METHODS,
  type CatalogResponse,
  type CategoryDTO,
  type Fulfillment,
  type RentalDTO,
  type ToyDTO,
} from "@/lib/types";

type Period = { start: string; end: string };
type CartMap = Record<string, number>;
type Step = "cart" | "details" | "done";

type FormState = {
  customerName: string;
  phone: string;
  fulfillment: Fulfillment;
  regionId: string;
  address: string;
  neighborhood: string;
  reference: string;
  paymentMethod: string;
  notes: string;
  customTimes: boolean;
  deliveryTime: string;
  returnTime: string;
};

const EMPTY_FORM: FormState = {
  customerName: "",
  phone: "",
  fulfillment: "entrega",
  regionId: "",
  address: "",
  neighborhood: "",
  reference: "",
  paymentMethod: "pix",
  notes: "",
  customTimes: false,
  deliveryTime: "",
  returnTime: "",
};

const STORAGE_KEY = "mi-diversao-sacolinha-v1";

function saveLocal(value: { period: Period | null; cart: CartMap; form: FormState }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* navegador sem armazenamento: segue sem lembrar */
  }
}

/* ---------- pedaços visuais ---------- */

function PriceTag({ cents }: { cents: number }) {
  const { reais, centavos } = splitBRL(cents);
  return (
    <span className="mi-price" aria-label={`${formatBRL(cents)} por diária`}>
      <i>R$</i>
      <b>{reais}</b>
      <sup>,{centavos}</sup>
      <small>/diária</small>
    </span>
  );
}

function ToyPhoto({
  toy,
  toysById,
  emoji,
}: {
  toy: ToyDTO;
  toysById: Map<number, ToyDTO>;
  emoji: string;
}) {
  if (toy.imageUrl) return <img src={asset(toy.imageUrl)} alt={toy.name} loading="lazy" />;
  const parts = toy.componentIds
    .map((id) => toysById.get(id))
    .filter((part): part is ToyDTO => Boolean(part && part.imageUrl))
    .slice(0, 2);
  if (parts.length === 2) {
    return (
      <>
        <div className="mi-photo-duo">
          <img src={asset(parts[0].imageUrl)} alt={parts[0].name} loading="lazy" />
          <img src={asset(parts[1].imageUrl)} alt={parts[1].name} loading="lazy" />
        </div>
        <span className="mi-photo-plus" aria-hidden="true">
          +
        </span>
      </>
    );
  }
  if (parts.length === 1) return <img src={asset(parts[0].imageUrl)} alt={toy.name} loading="lazy" />;
  return (
    <div className="mi-photo-empty" aria-hidden="true">
      {emoji}
    </div>
  );
}

function thumbUrl(toy: ToyDTO, toysById: Map<number, ToyDTO>) {
  if (toy.imageUrl) return toy.imageUrl;
  for (const id of toy.componentIds) {
    const part = toysById.get(id);
    if (part?.imageUrl) return part.imageUrl;
  }
  return "";
}

/* ---------- catálogo ---------- */

export default function CatalogApp() {
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [period, setPeriod] = useState<Period | null>(null);
  const [draft, setDraft] = useState<Period>({ start: "", end: "" });
  const [editingDates, setEditingDates] = useState(true);
  const [dateError, setDateError] = useState("");
  const [checking, setChecking] = useState(false);
  const [cart, setCart] = useState<CartMap>({});
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [restored, setRestored] = useState(false);
  const [activeCat, setActiveCat] = useState("todos");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("cart");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState<{ rental: RentalDTO; whatsappUrl: string } | null>(null);

  const dateCardRef = useRef<HTMLDivElement | null>(null);
  const startInputRef = useRef<HTMLInputElement | null>(null);
  const catalogRef = useRef<HTMLDivElement | null>(null);

  const loadCatalog = useCallback(async (target: Period | null) => {
    const qs = target ? `?start=${target.start}&end=${target.end}` : "";
    const response = await fetch(`/api/catalog${qs}`, { cache: "no-store" });
    const body = (await response.json()) as CatalogResponse & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Falha ao carregar o catálogo");
    return body;
  }, []);

  // Primeira carga: recupera o que o cliente já tinha escolhido neste aparelho.
  useEffect(() => {
    let cancelled = false;
    let savedPeriod: Period | null = null;
    let savedCart: CartMap = {};
    let savedForm: FormState = EMPTY_FORM;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          period?: Period | null;
          cart?: CartMap;
          form?: Partial<FormState>;
        };
        if (saved.period && isISODate(saved.period.start) && isISODate(saved.period.end)) {
          savedPeriod = saved.period;
        }
        if (saved.cart && typeof saved.cart === "object") savedCart = saved.cart;
        if (saved.form) savedForm = { ...EMPTY_FORM, ...saved.form };
      }
    } catch {
      /* ignora dados antigos inválidos */
    }

    (async () => {
      try {
        let body = await loadCatalog(savedPeriod);
        if (cancelled) return;
        // datas que já passaram deixam de valer
        if (savedPeriod && savedPeriod.start < body.today) {
          savedPeriod = null;
          savedCart = {};
          body = { ...body, availability: null };
        }
        setData(body);
        setForm(savedForm);
        if (savedPeriod) {
          setPeriod(savedPeriod);
          setDraft(savedPeriod);
          setEditingDates(false);
          setCart(savedCart);
        }
      } catch {
        if (!cancelled) setLoadError("Não conseguimos carregar o catálogo. Atualize a página.");
      } finally {
        if (!cancelled) setRestored(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadCatalog]);

  useEffect(() => {
    if (restored) saveLocal({ period, cart, form });
  }, [restored, period, cart, form]);

  useEffect(() => {
    document.documentElement.classList.toggle("mi-locked", open);
    return () => document.documentElement.classList.remove("mi-locked");
  }, [open]);

  /* ----- dados derivados ----- */

  const categories: CategoryDTO[] = useMemo(() => data?.categories ?? [], [data]);
  const allToys = useMemo(() => categories.flatMap((c) => c.toys), [categories]);
  const toysById = useMemo(() => new Map(allToys.map((t) => [t.id, t])), [allToys]);
  const emojiByCategory = useMemo(
    () => new Map(categories.map((c) => [c.id, c.emoji])),
    [categories],
  );
  const stockToys: StockToy[] = useMemo(
    () => allToys.map((t) => ({ id: t.id, stock: t.stock, componentIds: t.componentIds })),
    [allToys],
  );

  const availability = period ? (data?.availability ?? null) : null;
  const reserved = useMemo(
    () => (availability ? reservedFromAvailability(stockToys, availability) : null),
    [availability, stockToys],
  );

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, quantity]) => ({ toy: toysById.get(Number(id)), quantity }))
        .filter((line): line is { toy: ToyDTO; quantity: number } =>
          Boolean(line.toy && line.quantity > 0),
        ),
    [cart, toysById],
  );
  const cartDemand: Demand[] = useMemo(
    () => cartLines.map((l) => ({ toyId: l.toy.id, quantity: l.quantity })),
    [cartLines],
  );
  const conflicts = useMemo(
    () => (reserved ? findConflicts(stockToys, reserved, cartDemand) : []),
    [reserved, stockToys, cartDemand],
  );

  const settings = data?.settings;
  const regions = data?.regions ?? [];
  const days = period ? rentalDays(period.start, period.end) : 1;
  const itemCount = cartLines.reduce((sum, l) => sum + l.quantity, 0);
  const subtotal = cartLines.reduce((sum, l) => sum + l.toy.priceCents * l.quantity, 0) * days;
  const region = regions.find((r) => String(r.id) === form.regionId) ?? null;
  const isDelivery = form.fulfillment === "entrega";
  const fee = isDelivery && region ? region.feeCents : 0;
  const total = subtotal + fee;

  const defaultDelivery = settings?.deliveryTime ?? "09:00";
  const defaultReturn = settings?.returnTime ?? "21:00";
  const deliveryTime =
    form.customTimes && isTime(form.deliveryTime) ? form.deliveryTime : defaultDelivery;
  const returnTime = form.customTimes && isTime(form.returnTime) ? form.returnTime : defaultReturn;
  const timesChanged = deliveryTime !== defaultDelivery || returnTime !== defaultReturn;

  const visibleCategories = categories
    .filter((c) => activeCat === "todos" || c.slug === activeCat)
    .filter((c) => c.toys.length > 0);

  /* ----- ações ----- */

  function goToDates() {
    setOpen(false);
    setEditingDates(true);
    window.setTimeout(() => {
      dateCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      startInputRef.current?.focus({ preventScroll: true });
    }, 60);
  }

  function changeStart(value: string) {
    setDateError("");
    setDraft((prev) => ({
      start: value,
      end: !prev.end || prev.end < value || prev.end === prev.start ? value : prev.end,
    }));
  }

  async function confirmDates(event: FormEvent) {
    event.preventDefault();
    const today = data?.today ?? "";
    if (!isISODate(draft.start) || !isISODate(draft.end)) {
      setDateError("Escolha a data da entrega (ou retirada) e a data da devolução.");
      return;
    }
    if (draft.start < today) {
      setDateError("Essa data já passou. Escolha a partir de hoje.");
      return;
    }
    if (draft.end < draft.start) {
      setDateError("A devolução não pode ser antes da entrega.");
      return;
    }
    if (rentalDays(draft.start, draft.end) > 15) {
      setDateError("Para períodos acima de 15 diárias, fale com a gente pelo WhatsApp.");
      return;
    }
    setChecking(true);
    setDateError("");
    try {
      const next = { start: draft.start, end: draft.end };
      const body = await loadCatalog(next);
      setData(body);
      setPeriod(next);
      setEditingDates(false);
      window.setTimeout(() => {
        catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    } catch {
      setDateError("Não conseguimos consultar a agenda agora. Tente de novo.");
    } finally {
      setChecking(false);
    }
  }

  function changeQuantity(toy: ToyDTO, delta: number) {
    setCart((prev) => {
      const next = { ...prev };
      const value = (next[String(toy.id)] ?? 0) + delta;
      if (value <= 0) delete next[String(toy.id)];
      else next[String(toy.id)] = value;
      return next;
    });
  }

  async function openCart() {
    setStep("cart");
    setError("");
    setPlaced(null);
    setOpen(true);
    // confere a agenda de novo: outro cliente pode ter reservado nesse meio-tempo
    if (period) {
      try {
        setData(await loadCatalog(period));
      } catch {
        /* mantém o que já está na tela; o servidor valida de novo ao finalizar */
      }
    }
  }

  function updateForm(patch: Partial<FormState>) {
    setError("");
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function toggleCustomTimes(enabled: boolean) {
    updateForm({
      customTimes: enabled,
      deliveryTime: enabled ? form.deliveryTime || defaultDelivery : "",
      returnTime: enabled ? form.returnTime || defaultReturn : "",
    });
  }

  function continueToDetails() {
    if (!period) {
      setError("Escolha a data da festa antes de continuar.");
      return;
    }
    if (cartLines.length === 0) {
      setError("Sua sacolinha está vazia.");
      return;
    }
    if (conflicts.length > 0) {
      setError("Remova os brinquedos que já estão reservados nesta data para continuar.");
      return;
    }
    if (isDelivery && !region) {
      setError("Escolha a cidade da entrega para calcular o frete.");
      return;
    }
    setError("");
    setStep("details");
  }

  async function submitOrder(event: FormEvent) {
    event.preventDefault();
    if (!period) return;
    const problems: string[] = [];
    if (form.customerName.trim().length < 2) problems.push("Informe seu nome.");
    if (onlyDigits(form.phone).length < 10) problems.push("Informe seu WhatsApp com DDD.");
    if (isDelivery) {
      if (form.address.trim().length < 5) problems.push("Informe a rua e o número.");
      if (form.neighborhood.trim().length < 2) problems.push("Informe o bairro.");
    }
    if (problems.length) {
      setError(problems.join(" "));
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: form.customerName,
          phone: form.phone,
          startDate: period.start,
          endDate: period.end,
          fulfillment: form.fulfillment,
          regionId: region ? region.id : null,
          address: isDelivery ? form.address : "",
          neighborhood: isDelivery ? form.neighborhood : "",
          reference: isDelivery ? form.reference : "",
          deliveryTime,
          returnTime,
          paymentMethod: form.paymentMethod,
          notes: form.notes,
          items: cartLines.map((l) => ({ toyId: l.toy.id, quantity: l.quantity })),
        }),
      });
      const body = (await response.json()) as {
        rental?: RentalDTO;
        whatsappUrl?: string;
        error?: string;
      };
      if (!response.ok || !body.rental || !body.whatsappUrl) {
        setError(body.error ?? "Não foi possível registrar o pedido. Tente novamente.");
        if (response.status === 409) {
          setStep("cart");
          try {
            setData(await loadCatalog(period));
          } catch {
            /* segue com os dados atuais */
          }
        }
        return;
      }

      const keptForm = { ...form, notes: "", customTimes: false, deliveryTime: "", returnTime: "" };
      saveLocal({ period, cart: {}, form: keptForm });
      setPlaced({ rental: body.rental, whatsappUrl: body.whatsappUrl });
      setCart({});
      setForm(keptForm);
      setStep("done");
      const url = body.whatsappUrl;
      window.setTimeout(() => window.location.assign(url), 1200);
      loadCatalog(period)
        .then(setData)
        .catch(() => undefined);
    } catch {
      setError("Sem conexão. Confira a internet e tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ----- cartão de brinquedo ----- */

  function renderToy(toy: ToyDTO) {
    const inCart = cart[String(toy.id)] ?? 0;
    const missingPart = toy.componentIds.some((id) => !toysById.has(id));
    const free = availability ? (availability[String(toy.id)] ?? 0) : null;
    const isReserved = !missingPart && free !== null && free <= 0;
    const room = reserved ? remainingForCart(toy, stockToys, reserved, cartDemand) : 0;
    const parts = toy.componentIds
      .map((id) => toysById.get(id))
      .filter((part): part is ToyDTO => Boolean(part));
    const partsTotal = parts.reduce((sum, part) => sum + part.priceCents, 0);
    const saving =
      parts.length === toy.componentIds.length && partsTotal > toy.priceCents
        ? partsTotal - toy.priceCents
        : 0;

    let action;
    if (missingPart) {
      action = (
        <button className="mi-btn mi-btn-block" disabled>
          Indisponível no momento
        </button>
      );
    } else if (!period) {
      action = (
        <button className="mi-btn mi-btn-ghost mi-btn-block" onClick={goToDates}>
          Escolher a data
        </button>
      );
    } else if (inCart > 0) {
      action = (
        <div className="mi-qty">
          <button aria-label={`Tirar ${toy.name} da sacolinha`} onClick={() => changeQuantity(toy, -1)}>
            −
          </button>
          <span>{inCart > 1 ? `${inCart} na sacolinha` : "✓ Na sacolinha"}</span>
          <button
            aria-label={`Adicionar mais um ${toy.name}`}
            disabled={room < 1}
            onClick={() => changeQuantity(toy, 1)}
          >
            +
          </button>
        </div>
      );
    } else if (isReserved) {
      action = (
        <>
          <button className="mi-btn mi-btn-block" disabled>
            Reservado nesta data
          </button>
          <p className="mi-card-note">
            Diária de {formatBRL(toy.priceCents)} ·{" "}
            <button className="mi-link" onClick={goToDates}>
              ver outra data
            </button>
          </p>
        </>
      );
    } else if (room < 1) {
      action = (
        <>
          <button className="mi-btn mi-btn-block" disabled>
            Já incluído
          </button>
          <p className="mi-card-note">Faz parte de um item da sua sacolinha.</p>
        </>
      );
    } else {
      action = (
        <button className="mi-btn mi-btn-green mi-btn-block" onClick={() => changeQuantity(toy, 1)}>
          Adicionar
        </button>
      );
    }

    const classes = ["mi-card"];
    if (isReserved && inCart === 0) classes.push("mi-card-reserved");
    if (inCart > 0) classes.push("mi-card-in-cart");

    return (
      <li key={toy.id} className={classes.join(" ")}>
        <div className="mi-photo">
          <ToyPhoto toy={toy} toysById={toysById} emoji={emojiByCategory.get(toy.categoryId) ?? "🎈"} />
          {toy.featured && !isReserved ? <span className="mi-ribbon">Mais pedido</span> : null}
          {isReserved && inCart === 0 ? (
            <div className="mi-stamp">
              <span>Reservado</span>
            </div>
          ) : null}
          <PriceTag cents={toy.priceCents} />
        </div>
        <div className="mi-card-body">
          <h3>{toy.name}</h3>
          {toy.detail ? <p className="mi-detail">{toy.detail}</p> : null}
          {parts.length > 0 ? (
            <p className="mi-includes">Inclui: {parts.map((part) => part.name).join(" + ")}</p>
          ) : toy.description ? (
            <p className="mi-desc">{toy.description}</p>
          ) : null}
          {toy.bonus || saving > 0 || (period && days > 1) ? (
            <div className="mi-tags">
              {toy.bonus ? <span className="mi-tag mi-tag-gift">🎁 Brinde: {toy.bonus}</span> : null}
              {saving > 0 ? (
                <span className="mi-tag mi-tag-save">Economize {formatBRL(saving)}</span>
              ) : null}
              {period && days > 1 ? (
                <span className="mi-tag mi-tag-days">
                  {daysLabel(days)}: {formatBRL(toy.priceCents * days)}
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="mi-card-foot">{action}</div>
        </div>
      </li>
    );
  }

  /* ----- sacolinha ----- */

  function renderSchedule() {
    if (!period) return null;
    return (
      <ul className="mi-sched">
        <li>
          <span className="mi-sched-ico" aria-hidden="true">
            {isDelivery ? "🚚" : "📍"}
          </span>
          <span>
            <b>{isDelivery ? "Entrega prevista" : "Retirada prevista"}</b>
            <span>
              {formatDateBR(period.start)} às {formatTime(deliveryTime)}
            </span>
          </span>
        </li>
        <li>
          <span className="mi-sched-ico" aria-hidden="true">
            🔁
          </span>
          <span>
            <b>Devolução prevista</b>
            <span>
              {formatDateBR(period.end)} às {formatTime(returnTime)}
            </span>
          </span>
        </li>
      </ul>
    );
  }

  function renderTotals() {
    return (
      <dl className="mi-totals">
        <div>
          <dt>
            Brinquedos ({daysLabel(days)})
          </dt>
          <dd>{formatBRL(subtotal)}</dd>
        </div>
        <div>
          <dt>{isDelivery ? `Frete${region ? ` — ${region.name}` : ""}` : "Retirada pelo cliente"}</dt>
          <dd>{isDelivery ? (region ? formatBRL(fee) : "escolha a cidade") : "sem frete"}</dd>
        </div>
        <div className="mi-total">
          <dt>Total</dt>
          <dd>{formatBRL(total)}</dd>
        </div>
      </dl>
    );
  }

  function renderCartStep() {
    if (cartLines.length === 0) {
      return (
        <div className="mi-sheet-body">
          <div className="mi-done">
            <div className="mi-done-ico" aria-hidden="true">
              🛍️
            </div>
            <h3>Sua sacolinha está vazia</h3>
            <p>
              {period
                ? "Escolha os brinquedos da festa e eles aparecem aqui."
                : "Comece escolhendo a data da festa para ver o que está livre."}
            </p>
            <button
              className="mi-btn mi-btn-yellow"
              onClick={() => (period ? setOpen(false) : goToDates())}
            >
              {period ? "Ver brinquedos" : "Escolher a data"}
            </button>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className="mi-sheet-body">
          <section className="mi-block">
            <div className="mi-block-title">
              <span>📅 {period ? daysLabel(days) : "Datas"}</span>
              <button className="mi-btn mi-btn-quiet" onClick={goToDates}>
                Alterar datas
              </button>
            </div>
            {renderSchedule()}
            {!form.customTimes ? (
              <button className="mi-btn mi-btn-ghost mi-btn-small" onClick={() => toggleCustomTimes(true)}>
                🕘 Selecionar horários
              </button>
            ) : (
              <>
                <div className="mi-grid-2">
                  <label className="mi-field">
                    <span>{isDelivery ? "Horário da entrega" : "Horário da retirada"}</span>
                    <input
                      className="mi-input"
                      type="time"
                      value={form.deliveryTime}
                      onChange={(e) => updateForm({ deliveryTime: e.target.value })}
                    />
                  </label>
                  <label className="mi-field">
                    <span>Horário da devolução</span>
                    <input
                      className="mi-input"
                      type="time"
                      value={form.returnTime}
                      onChange={(e) => updateForm({ returnTime: e.target.value })}
                    />
                  </label>
                </div>
                {timesChanged ? (
                  <p className="mi-alert mi-alert-info">
                    Horários diferentes do padrão precisam ser confirmados com a empresa pelo
                    WhatsApp.
                  </p>
                ) : null}
                <button className="mi-link" onClick={() => toggleCustomTimes(false)}>
                  Usar os horários padrão ({formatTime(defaultDelivery)} e {formatTime(defaultReturn)})
                </button>
              </>
            )}
          </section>

          <section className="mi-block">
            <div className="mi-block-title">
              <span>🎪 Brinquedos</span>
            </div>
            {cartLines.map(({ toy, quantity }) => {
              const bad = conflicts.includes(toy.id);
              const thumb = thumbUrl(toy, toysById);
              return (
                <div className="mi-line" key={toy.id}>
                  <div className="mi-line-thumb">
                    {thumb ? <img src={asset(thumb)} alt="" /> : <span aria-hidden="true">🎈</span>}
                  </div>
                  <div>
                    <p className="mi-line-name">
                      {quantity > 1 ? `${quantity}x ` : ""}
                      {toy.name}
                    </p>
                    {bad ? (
                      <p className="mi-line-sub mi-line-bad">Já reservado nesta data. Remova para continuar.</p>
                    ) : (
                      <p className="mi-line-sub">
                        {formatBRL(toy.priceCents)}/diária
                        {days > 1 ? ` × ${days}` : ""}
                        {toy.bonus ? ` · 🎁 ${toy.bonus}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="mi-line-side">
                    <span>{formatBRL(toy.priceCents * quantity * days)}</span>
                    <button className="mi-remove" onClick={() => changeQuantity(toy, -quantity)}>
                      remover
                    </button>
                  </div>
                </div>
              );
            })}
            <button className="mi-link" onClick={() => setOpen(false)}>
              + Adicionar mais brinquedos
            </button>
          </section>

          <section className="mi-block">
            <div className="mi-block-title">
              <span>Como você quer receber?</span>
            </div>
            <div className="mi-seg">
              <button
                aria-pressed={isDelivery}
                onClick={() => updateForm({ fulfillment: "entrega" })}
              >
                🚚 Entrega
                <small>levamos e buscamos</small>
              </button>
              <button
                aria-pressed={!isDelivery}
                onClick={() => updateForm({ fulfillment: "retirada" })}
              >
                📍 Retirada
                <small>você busca, sem frete</small>
              </button>
            </div>
            {isDelivery ? (
              <label className="mi-field">
                <span>Cidade da entrega</span>
                <select
                  className="mi-input"
                  value={form.regionId}
                  onChange={(e) => updateForm({ regionId: e.target.value })}
                >
                  <option value="">Escolha a cidade…</option>
                  {regions.map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      {r.name} — frete {formatBRL(r.feeCents)}
                    </option>
                  ))}
                </select>
                <small>O frete já inclui levar e buscar os brinquedos.</small>
              </label>
            ) : (
              <p className="mi-alert mi-alert-info">
                {settings?.pickupAddress
                  ? `Retirada em: ${settings.pickupAddress}`
                  : "O endereço de retirada é combinado pelo WhatsApp."}
              </p>
            )}
          </section>

          <section className="mi-block">{renderTotals()}</section>
        </div>

        <div className="mi-sheet-foot">
          {error ? <p className="mi-alert mi-alert-error">{error}</p> : null}
          <button className="mi-btn mi-btn-yellow mi-btn-block" onClick={continueToDetails}>
            Continuar · {formatBRL(total)}
          </button>
        </div>
      </>
    );
  }

  function renderDetailsStep() {
    if (!period) return null;
    return (
      <form onSubmit={submitOrder} style={{ display: "contents" }}>
        <div className="mi-sheet-body">
          <section className="mi-block">
            <div className="mi-block-title">
              <span>Seus dados</span>
            </div>
            <label className="mi-field">
              <span>Nome completo</span>
              <input
                className="mi-input"
                autoComplete="name"
                value={form.customerName}
                onChange={(e) => updateForm({ customerName: e.target.value })}
                placeholder="Quem está alugando"
              />
            </label>
            <label className="mi-field">
              <span>WhatsApp com DDD</span>
              <input
                className="mi-input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => updateForm({ phone: e.target.value })}
                onBlur={() => updateForm({ phone: formatPhone(form.phone) })}
                placeholder="(51) 99999-9999"
              />
            </label>
          </section>

          {isDelivery ? (
            <section className="mi-block">
              <div className="mi-block-title">
                <span>🚚 Endereço da festa</span>
              </div>
              <label className="mi-field">
                <span>Rua e número</span>
                <input
                  className="mi-input"
                  autoComplete="street-address"
                  value={form.address}
                  onChange={(e) => updateForm({ address: e.target.value })}
                  placeholder="Rua das Flores, 123"
                />
              </label>
              <div className="mi-grid-2">
                <label className="mi-field">
                  <span>Bairro</span>
                  <input
                    className="mi-input"
                    value={form.neighborhood}
                    onChange={(e) => updateForm({ neighborhood: e.target.value })}
                  />
                </label>
                <label className="mi-field">
                  <span>Cidade</span>
                  <input className="mi-input" value={region?.name ?? ""} readOnly />
                </label>
              </div>
              <label className="mi-field">
                <span>Ponto de referência (opcional)</span>
                <input
                  className="mi-input"
                  value={form.reference}
                  onChange={(e) => updateForm({ reference: e.target.value })}
                  placeholder="Salão de festas, casa de esquina…"
                />
              </label>
            </section>
          ) : null}

          <section className="mi-block">
            <div className="mi-block-title">
              <span>Pagamento</span>
            </div>
            <div className="mi-seg" role="group" aria-label="Forma de pagamento">
              {PAYMENT_METHODS.map((method) => (
                <button
                  key={method}
                  type="button"
                  aria-pressed={form.paymentMethod === method}
                  onClick={() => updateForm({ paymentMethod: method })}
                >
                  {PAYMENT_LABEL[method]}
                </button>
              ))}
            </div>
            <p className="mi-line-sub">
              Você não paga nada agora e não informa dados do cartão aqui: o pagamento é combinado
              e finalizado pelo WhatsApp.
            </p>
            <label className="mi-field">
              <span>Observações (opcional)</span>
              <textarea
                className="mi-input"
                value={form.notes}
                onChange={(e) => updateForm({ notes: e.target.value })}
                placeholder="Tipo de piso, espaço disponível, ponto de luz…"
              />
            </label>
          </section>

          <section className="mi-block">
            <div className="mi-block-title">
              <span>Resumo do pedido</span>
              <button type="button" className="mi-btn mi-btn-quiet" onClick={() => setStep("cart")}>
                Editar
              </button>
            </div>
            {renderSchedule()}
            {timesChanged ? (
              <p className="mi-alert mi-alert-info">
                Horários escolhidos por você: aguarde a confirmação pelo WhatsApp.
              </p>
            ) : null}
            <dl className="mi-summary">
              <div>
                <dt>Brinquedos</dt>
                <dd>
                  {cartLines
                    .map((l) => `${l.quantity > 1 ? `${l.quantity}x ` : ""}${l.toy.name}`)
                    .join(", ")}
                </dd>
              </div>
              <div>
                <dt>{isDelivery ? "Entrega" : "Retirada"}</dt>
                <dd>
                  {isDelivery
                    ? (region?.name ?? "")
                    : settings?.pickupAddress || "endereço combinado pelo WhatsApp"}
                </dd>
              </div>
              <div>
                <dt>Pagamento</dt>
                <dd>{PAYMENT_LABEL[form.paymentMethod] ?? form.paymentMethod}</dd>
              </div>
            </dl>
            {renderTotals()}
          </section>
        </div>

        <div className="mi-sheet-foot">
          {error ? <p className="mi-alert mi-alert-error">{error}</p> : null}
          <button type="submit" className="mi-btn mi-btn-green mi-btn-block" disabled={submitting}>
            {submitting ? "Enviando…" : `Finalizar pelo WhatsApp · ${formatBRL(total)}`}
          </button>
          <p className="mi-foot-note">
            Ao finalizar, abrimos o WhatsApp com o pedido pronto para você enviar.
          </p>
        </div>
      </form>
    );
  }

  function renderDoneStep() {
    if (!placed) return null;
    return (
      <div className="mi-sheet-body">
        <div className="mi-done">
          <div className="mi-done-ico" aria-hidden="true">
            🎉
          </div>
          <h3>Pedido registrado!</h3>
          <span className="mi-code">{placed.rental.code}</span>
          <p>
            Estamos abrindo o WhatsApp com o seu pedido. É só enviar a mensagem para combinarmos o
            pagamento e confirmar a reserva.
          </p>
          <a className="mi-btn mi-btn-green" href={placed.whatsappUrl}>
            Abrir o WhatsApp
          </a>
          <button className="mi-link" onClick={() => setOpen(false)}>
            Voltar ao catálogo
          </button>
        </div>
      </div>
    );
  }

  /* ----- página ----- */

  const businessName = settings?.businessName ?? "MI Diversão";

  return (
    <div className="mi-app">
      <header className="mi-header">
        <div className="mi-wrap mi-header-in">
          <a className="mi-brand" href="#topo">
            <img src={asset("/logo.jpg")} alt="" width={46} height={46} />
            <span>
              <span className="mi-brand-name">{businessName}</span>
              <span className="mi-brand-sub">Locação de brinquedos</span>
            </span>
          </a>
          <button className="mi-bag" onClick={openCart} aria-label={`Abrir sacolinha, ${itemCount} itens`}>
            <span aria-hidden="true">🛍️</span>
            <span className="mi-bag-text">Sacolinha</span>
            <span className="mi-bag-count">{itemCount}</span>
          </button>
        </div>
      </header>

      <section className="mi-hero" id="topo">
        <div className="mi-wrap mi-hero-in">
          <div>
            <div className="mi-hero-top">
              <img className="mi-hero-logo" src={asset("/logo.jpg")} alt={`Logo ${businessName}`} width={104} height={104} />
              <h1 className="mi-display">
                Diversão garantida <em>na sua festa!</em>
              </h1>
            </div>
            <p className="mi-hero-lead">
              Infláveis, cama elástica, piscina de bolinhas e mesas de jogos. Escolha a data, monte a
              sacolinha e finalize pelo WhatsApp.
            </p>
            <ul className="mi-cities" aria-label="Cidades atendidas">
              <li>Atendemos</li>
              {regions.map((r) => (
                <li key={r.id}>{r.name}</li>
              ))}
            </ul>
          </div>

          <div className="mi-datecard" ref={dateCardRef} id="datas">
            <span className="mi-step-tag">1º passo</span>
            {period && !editingDates ? (
              <>
                <h2 className="mi-display">Datas da sua festa</h2>
                <dl className="mi-period">
                  <div>
                    <dt>Entrega ou retirada</dt>
                    <dd>
                      {formatDateShort(period.start)}
                      <small>{formatDateLong(period.start)}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Devolução</dt>
                    <dd>
                      {formatDateShort(period.end)}
                      <small>{formatDateLong(period.end)}</small>
                    </dd>
                  </div>
                </dl>
                <p className="mi-times-note">
                  <span aria-hidden="true">🕘</span>
                  <span>
                    {daysLabel(days)} · entrega prevista às {formatTime(defaultDelivery)} e devolução
                    às {formatTime(defaultReturn)}.
                  </span>
                </p>
                <button className="mi-btn mi-btn-ghost mi-btn-block" onClick={() => setEditingDates(true)}>
                  Alterar datas
                </button>
              </>
            ) : (
              <form onSubmit={confirmDates}>
                <h2 className="mi-display">Quando é a festa?</h2>
                <p className="mi-datecard-hint">
                  Assim mostramos só os brinquedos livres no dia.
                </p>
                <div className="mi-grid-2">
                  <label className="mi-field">
                    <span>Entrega ou retirada</span>
                    <span className="mi-datefield">
                      <input
                        ref={startInputRef}
                        className={`mi-input${draft.start ? "" : " mi-input-empty"}`}
                        type="date"
                        min={data?.today}
                        value={draft.start}
                        onChange={(e) => changeStart(e.target.value)}
                      />
                      {draft.start ? null : (
                        <span className="mi-datefield-hint" aria-hidden="true">
                          Escolher
                        </span>
                      )}
                    </span>
                  </label>
                  <label className="mi-field">
                    <span>Devolução</span>
                    <span className="mi-datefield">
                      <input
                        className={`mi-input${draft.end ? "" : " mi-input-empty"}`}
                        type="date"
                        min={draft.start || data?.today}
                        value={draft.end}
                        onChange={(e) => {
                          setDateError("");
                          setDraft((prev) => ({ ...prev, end: e.target.value }));
                        }}
                      />
                      {draft.end ? null : (
                        <span className="mi-datefield-hint" aria-hidden="true">
                          Escolher
                        </span>
                      )}
                    </span>
                  </label>
                </div>
                <p className="mi-times-note">
                  <span aria-hidden="true">🕘</span>
                  <span>
                    Entrega prevista às {formatTime(defaultDelivery)} e devolução às{" "}
                    {formatTime(defaultReturn)}. Precisa de outro horário? Você ajusta na sacolinha.
                  </span>
                </p>
                {dateError ? <p className="mi-alert mi-alert-error" style={{ marginTop: 12 }}>{dateError}</p> : null}
                <button type="submit" className="mi-btn mi-btn-yellow mi-btn-block" disabled={checking || !data}>
                  {checking ? "Consultando a agenda…" : "Ver brinquedos disponíveis"}
                </button>
              </form>
            )}
          </div>
        </div>

        <ol className="mi-wrap mi-how">
          <li>
            <b>1</b> Escolha a data da festa
          </li>
          <li>
            <b>2</b> Coloque os brinquedos na sacolinha
          </li>
          <li>
            <b>3</b> Finalize e pague pelo WhatsApp
          </li>
        </ol>
      </section>

      <nav className="mi-catnav" aria-label="Categorias">
        <div className="mi-wrap mi-catnav-in">
          <button
            className={`mi-chip mi-chip-date${period ? "" : " mi-chip-empty"}`}
            onClick={goToDates}
          >
            📅{" "}
            {period
              ? `${formatDateShort(period.start)}${period.end !== period.start ? ` a ${formatDateShort(period.end)}` : ""} · ${daysLabel(days)}`
              : "Escolha a data"}
          </button>
          <button className="mi-chip" aria-pressed={activeCat === "todos"} onClick={() => setActiveCat("todos")}>
            Todos
          </button>
          {categories
            .filter((c) => c.toys.length > 0)
            .map((c) => (
              <button
                key={c.id}
                className="mi-chip"
                aria-pressed={activeCat === c.slug}
                onClick={() => setActiveCat(c.slug)}
              >
                {c.emoji} {c.name}
              </button>
            ))}
        </div>
      </nav>

      <main className="mi-wrap mi-main" ref={catalogRef}>
        {loadError ? <p className="mi-alert mi-alert-error" style={{ marginTop: 20 }}>{loadError}</p> : null}

        {!data && !loadError ? (
          <div className="mi-section">
            <div className="mi-toys">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="mi-skeleton" />
              ))}
            </div>
          </div>
        ) : null}

        {period && conflicts.length > 0 ? (
          <p className="mi-alert mi-alert-error" style={{ marginTop: 20 }}>
            Alguns brinquedos da sua sacolinha já estão reservados nessa data. Abra a sacolinha para
            ajustar.
          </p>
        ) : null}

        {settings?.notice && data ? (
          <p className="mi-alert mi-alert-info" style={{ marginTop: 20 }}>
            {settings.notice}
          </p>
        ) : null}

        {visibleCategories.map((category) => (
          <section className="mi-section" key={category.id} id={category.slug}>
            <div className="mi-section-head">
              <h2 className="mi-display">
                <span>
                  {category.emoji} {category.name}
                </span>
              </h2>
              {category.description ? <p>{category.description}</p> : null}
            </div>
            <ul className="mi-toys">{category.toys.map(renderToy)}</ul>
          </section>
        ))}

        {data && visibleCategories.length === 0 ? (
          <p className="mi-empty">Nenhum brinquedo cadastrado nesta categoria ainda.</p>
        ) : null}
      </main>

      <footer className="mi-footer">
        <div className="mi-wrap mi-footer-in">
          <div>
            <h3>{businessName} — Locação de Brinquedos</h3>
            <p>Valores por diária. A reserva é confirmada pelo WhatsApp, onde também combinamos o pagamento (Pix, dinheiro, cartão de crédito ou débito).</p>
            {settings?.whatsapp ? (
              <p>
                WhatsApp:{" "}
                <a href={`https://wa.me/${settings.whatsapp}`}>{formatPhone(settings.whatsapp)}</a>
              </p>
            ) : null}
            {settings?.instagram ? (
              <p>
                Instagram:{" "}
                <a href={`https://www.instagram.com/${settings.instagram}`}>@{settings.instagram}</a>
              </p>
            ) : null}
          </div>
          <div>
            <h3>Frete por cidade</h3>
            <ul>
              {regions.map((r) => (
                <li key={r.id}>
                  <span>{r.name}</span>
                  <span>{formatBRL(r.feeCents)}</span>
                </li>
              ))}
              <li>
                <span>Retirada pelo cliente</span>
                <span>sem frete</span>
              </li>
            </ul>
          </div>
          <div>
            <h3>Horários</h3>
            <p>
              Entrega prevista às {formatTime(defaultDelivery)} e devolução às{" "}
              {formatTime(defaultReturn)}.
            </p>
            <p>Outros horários podem ser pedidos na sacolinha e são confirmados pelo WhatsApp.</p>
            <p className="mi-footer-admin">
              <a href="/admin">Área dos administradores</a>
            </p>
          </div>
        </div>
      </footer>

      {itemCount > 0 && !open ? (
        <button className="mi-floatbar" onClick={openCart}>
          <span>
            🛍️ Ver sacolinha ({itemCount})
          </span>
          <span>{formatBRL(total)}</span>
        </button>
      ) : null}

      {open ? (
        <div
          className="mi-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="mi-sheet" role="dialog" aria-modal="true" aria-label="Sacolinha">
            <div className="mi-sheet-head">
              <div>
                <p>
                  {step === "cart" ? "Passo 2 de 3" : step === "details" ? "Passo 3 de 3" : "Tudo certo"}
                </p>
                <h2 className="mi-display">
                  {step === "cart" ? "Sua sacolinha" : step === "details" ? "Finalizar pedido" : "Pedido enviado"}
                </h2>
              </div>
              <button className="mi-close" onClick={() => setOpen(false)} aria-label="Fechar sacolinha">
                ✕
              </button>
            </div>
            {step === "cart" ? renderCartStep() : null}
            {step === "details" ? renderDetailsStep() : null}
            {step === "done" ? renderDoneStep() : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

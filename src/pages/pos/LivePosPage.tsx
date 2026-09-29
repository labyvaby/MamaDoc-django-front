import React from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  IconButton,
  Chip,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import SearchOffOutlined from "@mui/icons-material/SearchOffOutlined";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import PrintRounded from "@mui/icons-material/PrintRounded";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import QrCode2Rounded from "@mui/icons-material/QrCode2Rounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import { apiRequest } from "../../api/client";
import { getDiscountKinds, type DiscountKind } from "../../api/promotions";
import {
  checkoutPosCart,
  getPosBootstrap,
  getPosProducts,
  posRequest,
  quotePosCart,
  type PosCart,
  type PosProduct,
  type PosQuote,
  type PosSavedReceipt,
  type PosTender,
} from "../../api/pos";
import { usePermissions } from "../../hooks/usePermissions";
import { ActiveContextSwitcher } from "../../components/sidebar/ActiveContextSwitcher";
import { PosClientFooter } from "./ClientFooter";
import { PosHoldReceiptDialog } from "./HoldReceiptDialog";
import { PosConfirmDialog, type PosConfirmRequest } from "./ConfirmDialog";
import { PosProductResults, type PosProductResultsHandle } from "./ProductCards";
import { PosReceipt } from "./Receipt";
import { PosTopBar } from "./TopBar";
import { CheckoutDialog } from "./CheckoutDialog";
import {
  LivePaymentPanel,
  emptyBenefits,
  inlineQuoteErrorField,
  type Benefits,
} from "./LivePaymentPanel";
import { posColors } from "./layout";
import type { PosCatalogItem, PosClient, PosReceiptLine } from "./types";
import { PosAmount } from "./ui";

type CartRow = {
  product: PosProduct;
  quantity: number;
  discountAmount?: number;
  /** Скидка процентом: сумма пересчитывается при смене количества. */
  discountPercent?: number;
  removed?: boolean;
};
type PosDraft = {
  rows: CartRow[];
  client: PosClient | null;
  benefits: Benefits;
  held: PosSavedReceipt | null;
  warehouseChoice: number | null;
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Не удалось выполнить действие.";
const colorHex = (label: string) =>
  ({
    чёрный: "#202127",
    черный: "#202127",
    белый: "#f5f4ef",
    бежевый: "#d0ba98",
    синий: "#314866",
    красный: "#af4141",
    серый: "#8a8c92",
  }[label.toLowerCase()] ?? "#887bb3");

const canStartProductSearch = (value: string) => {
  const term = value.trim();
  return Boolean(term) && (!/^\d+$/.test(term) || term.length >= 3);
};

const brandOf = (attributes: PosProduct["attributes"]) =>
  attributes.find((attribute) => attribute.role === "generic" && /^(бренд|brand)$/i.test(attribute.name.trim()))?.value;

/** Скидка на позицию в сомах: процент — от текущей суммы, сумма — не больше позиции. */
const lineDiscount = (row: CartRow) => {
  const subtotal = Number(row.product.price) * row.quantity;
  const raw = row.discountPercent
    ? (subtotal * row.discountPercent) / 100
    : row.discountAmount ?? 0;
  return Math.round(Math.min(Math.max(raw, 0), subtotal) * 100) / 100;
};

function toLine(row: CartRow, variants: PosProduct[]): PosReceiptLine {
  const p = row.product;
  const color = p.attributes.find((a) => a.role === "color");
  const size = p.attributes.find((a) => a.role === "size");
  const family = p.modelId
    ? variants.filter((item) => item.modelId === p.modelId)
    : [p];
  const all = family.length ? family : [p];
  const colors = [
    ...new Map(
      all
        .flatMap((item) => item.attributes.filter((a) => a.role === "color"))
        .map((a) => [a.id, a])
    ).values(),
  ];
  const sizes = [
    ...new Map(
      all
        .filter(
          (item) =>
            item.attributes.find((a) => a.role === "color")?.id === color?.id
        )
        .flatMap((item) => item.attributes.filter((a) => a.role === "size"))
        .map((a) => [a.id, a])
    ).values(),
  ];
  return {
    id: String(p.id),
    name: p.name,
    brand: brandOf(p.attributes),
    sku: p.sku,
    barcode: p.barcode,
    quantity: row.quantity,
    price: Number(p.price),
    discountAmount: lineDiscount(row),
    discountPercent: row.discountPercent,
    colors: colors.map((a) => ({
      id: String(a.id),
      label: a.value,
      hex: colorHex(a.value),
    })),
    selectedColorId: String(color?.id ?? ""),
    sizes: sizes.map((a) => ({
      id: String(a.id),
      label: a.value,
      available: all.some(
        (item) =>
          item.attributes.some((v) => v.id === a.id) && Number(item.stock) > 0
      ),
    })),
    selectedSizeId: String(size?.id ?? ""),
    removed: row.removed,
  };
}

function toCatalogItem(product: PosProduct, family: PosProduct[]): PosCatalogItem {
  const names = family.map((item) => item.name.trim()).filter(Boolean);
  const colors = [
    ...new Map(
      family
        .flatMap((item) => item.attributes.filter((attribute) => attribute.role === "color"))
        .map((attribute) => [attribute.id, attribute])
    ).values(),
  ];
  const sizes = [
    ...new Map(
      family
        .flatMap((item) => item.attributes.filter((attribute) => attribute.role === "size"))
        .map((attribute) => [attribute.id, attribute])
    ).values(),
  ];
  let commonName = names.reduce((prefix, name) => {
    let length = 0;
    while (length < prefix.length && length < name.length && prefix[length] === name[length]) length += 1;
    return prefix.slice(0, length);
  }, names[0] ?? product.name).replace(/[\s,;:/\\-]+$/, "");
  const variantLabels = [...colors, ...sizes]
    .map((attribute) => attribute.value.trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  for (const label of variantLabels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    commonName = commonName.replace(new RegExp(`[\\s,;:/\\-]+${escaped}$`, "i"), "").trim();
  }
  return {
    id: String(product.id),
    name: commonName || product.name,
    brand: brandOf(product.attributes),
    price: Number(product.price),
    stock: family.reduce((total, item) => total + Number(item.stock), 0),
    colors: colors.map((attribute) => ({
      id: String(attribute.id),
      label: attribute.value,
      hex: colorHex(attribute.value),
    })),
    sizes: sizes.map((attribute) => ({
      id: String(attribute.id),
      label: attribute.value,
      available: family.some(
        (item) => item.attributes.some((value) => value.id === attribute.id) && Number(item.stock) > 0
      ),
    })),
    variants: family,
  };
}

export default function LivePosPage() {
  const auth = usePermissions();
  const theme = useTheme();
  const c = posColors(theme);
  const cache = useQueryClient();
  const scope = {
    organizationId: auth.activeOrganization?.id ?? 0,
    branchId: auth.activeBranch?.id ?? 0,
  };
  const ready = Boolean(
    scope.organizationId && scope.branchId && auth.hasModule("pos")
  );
  const prefix = ["pos-workspace", scope.organizationId, scope.branchId];
  const bootstrap = useQuery({
    queryKey: [...prefix, "bootstrap"],
    queryFn: ({ signal }) => getPosBootstrap(scope, signal),
    enabled: ready,
    staleTime: 0,
    refetchInterval: 30000,
  });
  const data = bootstrap.data;
  const actions = Object.fromEntries(
    Object.entries(data?.actions ?? {}).map(([key, allowed]) => [
      key,
      allowed && Boolean(auth.canAccess?.(`pos.${key}`)),
    ])
  );
  const [warehouseChoice, setWarehouseChoice] = React.useState<number | null>(
    null
  );
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const warehouseId = warehouseChoice ?? data?.warehouses[0]?.id ?? 0;
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<number | null>(null);
  const [resultsOpen, setResultsOpen] = React.useState(true);
  const [activeResult, setActiveResult] = React.useState(-1);
  const resultsRef = React.useRef<PosProductResultsHandle>(null);
  const [rows, setRows] = React.useState<CartRow[]>([]);
  const [variants, setVariants] = React.useState<PosProduct[]>([]);
  const [client, setClient] = React.useState<PosClient | null>(null);
  const [clientQuery, setClientQuery] = React.useState("");
  const [clientSearch, setClientSearch] = React.useState("");
  const [benefits, setBenefits] = React.useState<Benefits>(emptyBenefits);
  const [held, setHeld] = React.useState<PosSavedReceipt | null>(null);
  const [holdOpen, setHoldOpen] = React.useState(false);
  const [list, setList] = React.useState<"held" | "history" | null>(null);
  const [historyClient, setHistoryClient] = React.useState<number | null>(null);
  const [listOffset, setListOffset] = React.useState(0);
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const sending = React.useRef(false);
  const attempt = React.useRef({ fingerprint: "", key: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<PosSavedReceipt | null>(null);
  const [confirmRequest, setConfirmRequest] =
    React.useState<PosConfirmRequest | null>(null);
  const [returnTarget, setReturnTarget] =
    React.useState<PosSavedReceipt | null>(null);
  const [reason, setReason] = React.useState("");
  const draftKey = ready
    ? `mamadoc:pos:draft:${scope.organizationId}:${scope.branchId}`
    : null;
  const hydratedDraftKey = React.useRef<string | null>(null);
  const skipDraftPersistKey = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!draftKey) return;
    let draft: PosDraft | null = null;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) draft = JSON.parse(raw) as PosDraft;
    } catch {
      draft = null;
    }
    if (draft) {
      if (Array.isArray(draft.rows)) setRows(draft.rows);
      if (draft.client) setClient(draft.client);
      if (draft.benefits) setBenefits({ ...emptyBenefits, ...draft.benefits });
      if (draft.held) setHeld(draft.held);
      if (draft.warehouseChoice != null) setWarehouseChoice(draft.warehouseChoice);
    }
    hydratedDraftKey.current = draftKey;
    skipDraftPersistKey.current = draftKey;
  }, [draftKey]);

  React.useEffect(() => {
    if (!draftKey || hydratedDraftKey.current !== draftKey) return;
    if (skipDraftPersistKey.current === draftKey) {
      skipDraftPersistKey.current = null;
      return;
    }
    try {
      if (!rows.length && !held) {
        window.localStorage.removeItem(draftKey);
        return;
      }
      const draft: PosDraft = { rows, client, benefits, held, warehouseChoice };
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // localStorage can be unavailable in private mode or when the quota is full.
    }
  }, [draftKey, rows, client, benefits, held, warehouseChoice]);

  React.useEffect(() => {
    const id = window.setTimeout(() => {
      setDebounced(search);
    }, 250);
    return () => window.clearTimeout(id);
  }, [search]);

  // Новый запрос или категория — список снова раскрыт, подсветка сброшена.
  React.useEffect(() => {
    setResultsOpen(true);
    setActiveResult(-1);
  }, [search, selectedCategoryId]);

  // Поиск клиента запускается после короткой паузы в наборе: отдельная кнопка
  // «Найти» в кассе не нужна, а запрос на каждый символ создавал бы лишнюю
  // нагрузку на API.
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      setClientSearch(clientQuery.trim());
    }, 250);
    return () => window.clearTimeout(id);
  }, [clientQuery]);
  const typedSearch = search.trim();
  const debouncedSearch = debounced.trim();
  const isSearchPending = typedSearch !== debouncedSearch;
  const normalizedSearch = debouncedSearch.toLocaleLowerCase();
  const hasTypedSearch = canStartProductSearch(typedSearch);
  const hasSearch = canStartProductSearch(debouncedSearch);
  const matchedCategory =
    normalizedSearch.length >= 2
      ? data?.categories.find((item) => {
          const categoryName = item.name.trim().toLocaleLowerCase();
          return (
            categoryName === normalizedSearch ||
            (normalizedSearch.length >= 3 &&
              categoryName.startsWith(normalizedSearch))
          );
        })
      : undefined;
  const activeMatchedCategory = isSearchPending ? undefined : matchedCategory;
  const categoryId = selectedCategoryId ?? activeMatchedCategory?.id;
  const productSearch =
    !hasSearch || (activeMatchedCategory && selectedCategoryId == null)
      ? ""
      : debounced;
  const canShowProducts = hasTypedSearch || categoryId != null;
  const canFetchProducts =
    !isSearchPending && (hasSearch || categoryId != null);
  const products = useQuery({
    queryKey: [
      ...prefix,
      "products",
      warehouseId,
      productSearch,
      categoryId,
    ],
    queryFn: ({ signal }) =>
      getPosProducts(
        scope,
        {
          warehouseId,
          search: productSearch,
          limit: 200,
          ...(categoryId ? { categoryId } : {}),
        },
        signal
      ),
    enabled: ready && !!warehouseId && canFetchProducts,
  });
  const groupedProducts = React.useMemo(() => {
    const groups = new Map<string, PosProduct[]>();
    for (const product of products.data?.results ?? []) {
      const key = product.modelId == null ? `product:${product.id}` : `model:${product.modelId}`;
      const family = groups.get(key) ?? [];
      family.push(product);
      groups.set(key, family);
    }
    return [...groups.values()].map((family) => toCatalogItem(family[0], family));
  }, [products.data?.results]);
  const clients = useQuery({
    queryKey: [...prefix, "clients", clientSearch],
    queryFn: ({ signal }) =>
      posRequest<PosClient[]>(
        scope,
        `clients/?search=${encodeURIComponent(clientSearch)}`,
        { signal }
      ),
    enabled: ready && !!actions.clients && !held && Boolean(clientSearch),
  });
  const receipts = useQuery({
    queryKey: [...prefix, list, listOffset, historyClient],
    queryFn: ({ signal }) =>
      posRequest<PosSavedReceipt[]>(
        scope,
        `${list}/?offset=${listOffset}${
          list === "history" && historyClient
            ? `&clientId=${historyClient}`
            : ""
        }`,
        { signal }
      ),
    enabled:
      ready &&
      list !== null &&
      Boolean(actions[list === "held" ? "hold" : "history"]),
  });
  const cart: PosCart = {
    branchId: scope.branchId,
    warehouseId,
    clientId: client ? Number(client.id) : undefined,
    lines: rows
      .filter((row) => !row.removed)
      .map((row) => ({
        productId: row.product.id,
        quantity: String(row.quantity),
        discountAmount: lineDiscount(row).toFixed(2),
      })),
    discountAmount: benefits.discount || "0",
    discountKindId: benefits.discountKindId ?? undefined,
    clientDiscount: benefits.clientDiscount,
    promotions: benefits.promotions,
    promoCode: benefits.promoCode.trim(),
    useBonuses: benefits.bonuses,
    certificateCode: benefits.certificateCode.trim(),
  };
  const quoteQuery = useQuery({
    queryKey: [...prefix, "quote", cart],
    queryFn: ({ signal }) => quotePosCart(scope, cart, signal),
    enabled: ready && !!warehouseId && cart.lines.length > 0 && !held,
    staleTime: 0,
    retry: false,
    // Пока сервер пересчитывает, панель не мигает «—»: показываем оценку ниже.
    placeholderData: keepPreviousData,
  });
  const discountKindsQuery = useQuery({
    queryKey: ["django", "promotions", "discount-kinds", scope.branchId],
    queryFn: ({ signal }) => getDiscountKinds({ branchId: scope.branchId }, signal),
    enabled: ready && actions.discount,
  });
  const discountKinds: DiscountKind[] = discountKindsQuery.data ?? [];
  const configuredDiscountMode = data?.rules.discount_mode;
  const discountMode =
    configuredDiscountMode === "manual" ||
    configuredDiscountMode === "kinds" ||
    configuredDiscountMode === "both"
      ? configuredDiscountMode
      : "both";
  const heldQuote: PosQuote | undefined = held
    ? {
        subtotal: held.subtotal,
        discount: held.discountTotal,
        total: held.totalAmount,
        bonuses: "0",
        certificateAmount: "0",
        due: (
          Number(held.totalAmount) -
          held.payments.reduce(
            (total, payment) => total + Number(payment.amount),
            0
          )
        ).toFixed(2),
        lines: [],
      }
    : undefined;
  const serverQuote =
    heldQuote ??
    (quoteQuery.isError || !cart.lines.length ? undefined : quoteQuery.data);
  const activeRows = rows.filter((row) => !row.removed);
  const localSubtotal = activeRows.reduce(
    (total, row) => total + Number(row.product.price) * row.quantity,
    0
  );
  const localLineDiscount = activeRows.reduce(
    (total, row) => total + lineDiscount(row),
    0
  );
  // Ответ сервера для текущей корзины ещё не пришёл — считаем итог сами, чтобы
  // скидка на товар и количество отражались в панели сразу, а не после запроса.
  const quoteStale =
    !held &&
    cart.lines.length > 0 &&
    !quoteQuery.isError &&
    (quoteQuery.isPlaceholderData || (!quoteQuery.data && quoteQuery.isFetching));
  const estimateQuote = (previous: PosQuote | undefined): PosQuote => {
    const afterLines = localSubtotal - localLineDiscount;
    const kind = discountKinds.find((item) => item.id === benefits.discountKindId);
    const cartDiscount = kind
      ? (afterLines * Number(kind.percent)) / 100
      : Math.min(Number(benefits.discount) || 0, afterLines);
    let discount = localLineDiscount + cartDiscount;
    // Без ручных скидок держим прошлую (акция) — иначе итог мигнёт на полную сумму.
    if (!discount && previous)
      discount = Math.min(Number(previous.discount), localSubtotal);
    if (benefits.clientDiscount && client)
      discount = Math.max(discount, (localSubtotal * client.discountPercent) / 100);
    const total = Math.max(0, localSubtotal - discount);
    const bonusesUsed =
      benefits.bonuses && previous ? Math.min(Number(previous.bonuses), total) : 0;
    const certificate = previous
      ? Math.min(Number(previous.certificateAmount), total - bonusesUsed)
      : 0;
    return {
      subtotal: localSubtotal.toFixed(2),
      discount: discount.toFixed(2),
      total: total.toFixed(2),
      bonuses: bonusesUsed.toFixed(2),
      certificateAmount: certificate.toFixed(2),
      due: (total - bonusesUsed - certificate).toFixed(2),
      promotionApplied: previous?.promotionApplied,
      lines: [],
    };
  };
  const quote = quoteStale ? estimateQuote(serverQuote) : serverQuote;
  // Сервер без поддержки скидки на позицию молча её отбрасывает — не прячем это.
  const lineDiscountIgnored =
    !held &&
    !quoteStale &&
    !!quote &&
    localLineDiscount > 0 &&
    Number(quote.discount) + 0.01 < localLineDiscount;
  const panelLineDiscounts = held
    ? held.lines
        .filter((line) => Number(line.discountAmount ?? 0) > 0)
        .map((line) => ({
          id: String(line.id),
          name: line.productName,
          label: "",
          amount: Number(line.discountAmount),
        }))
    : activeRows
        .filter((row) => lineDiscount(row) > 0)
        .map((row) => ({
          id: String(row.product.id),
          name: row.product.name,
          label: row.discountPercent ? `${row.discountPercent}%` : "",
          amount: lineDiscount(row),
        }));
  const busy = pending || (!held && quoteQuery.isFetching);
  const reset = () => {
    setRows([]);
    setHeld(null);
    setClient(null);
    setBenefits(emptyBenefits);
    setSearch("");
    setSelectedCategoryId(null);
    setError(null);
    attempt.current = { fingerprint: "", key: "" };
  };
  const newReceipt = () => {
    if (sending.current) return;
    if (!rows.length) {
      reset();
      return;
    }
    setConfirmRequest({
      title: "Начать новый чек?",
      message: held
        ? "Отложенный чек закроется и останется в списке отложенных."
        : "Несохранённая корзина будет очищена.",
      confirmLabel: "Новый чек",
      onConfirm: reset,
    });
  };
  const invalidate = () => {
    void cache.invalidateQueries({ queryKey: prefix });
  };
  const act = async (callback: () => Promise<void>) => {
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    setError(null);
    try {
      await callback();
    } catch (e) {
      setError(message(e));
    } finally {
      sending.current = false;
      setPending(false);
    }
  };
  const add = async (product: PosProduct) => {
    if (!actions.sell || held || pending) return;
    if (Number(product.stock) <= 0) {
      setError("На выбранном складе нет свободного остатка.");
      return;
    }
    setRows((previous) => {
      const existing = previous.find((row) => row.product.id === product.id);
      if (
        existing &&
        !existing.removed &&
        existing.quantity >= Number(product.stock)
      ) {
        setError("Достигнут доступный остаток.");
        return previous;
      }
      return existing
        ? previous.map((row) =>
            row.product.id === product.id
              ? {
                  ...row,
                  quantity: row.removed ? 1 : row.quantity + 1,
                  removed: false,
                }
              : row
          )
        : [...previous, { product, quantity: 1 }];
    });
    setSearch("");
    searchInputRef.current?.focus();
    if (product.modelId) {
      try {
        const result = await getPosProducts(scope, {
          warehouseId,
          modelId: product.modelId,
          limit: 100,
        });
        setVariants((previous) => [
          ...previous.filter((item) => item.modelId !== product.modelId),
          ...result.results,
        ]);
      } catch (e) {
        setError(message(e));
      }
    }
  };
  const scanProduct = async (rawCode: string) => {
    const code = rawCode.trim();
    searchInputRef.current?.focus();
    if (code) setSearch(code);
    if (
      !canStartProductSearch(code) ||
      !actions.sell ||
      pending ||
      held
    )
      return;
    try {
      const result = await getPosProducts(scope, {
        warehouseId,
        search: code,
        limit: 100,
      });
      const exact = result.results.find(
        (item) =>
          item.barcode === code ||
          item.barcodes.includes(code) ||
          item.sku === code
      );
      if (exact) void add(exact);
      else if (result.count === 1) void add(result.results[0]);
      else
        setError(
          "Уточните штрихкод или выберите товар в результатах поиска."
        );
    } catch (e) {
      setError(message(e));
    }
  };
  const update = (id: string, change: Partial<CartRow>) => {
    if (!actions.sell || held || pending) return;
    setRows((previous) =>
      previous.map((row) =>
        String(row.product.id) === id ? { ...row, ...change } : row
      )
    );
  };
  const variant = (id: string, role: string, valueId: string) => {
    const row = rows.find((item) => String(item.product.id) === id);
    if (!row || held || pending) return;
    const otherRole = role === "color" ? "size" : "color";
    const other = row.product.attributes.find((a) => a.role === otherRole)?.id;
    const replacement = variants.find(
      (p) =>
        p.modelId === row.product.modelId &&
        p.attributes.some((a) => String(a.id) === valueId) &&
        p.attributes.find((a) => a.role === otherRole)?.id === other
    );
    if (!replacement || Number(replacement.stock) < row.quantity) {
      setError("Этот вариант недоступен на выбранном складе.");
      return;
    }
    if (
      rows.some((item) => item !== row && item.product.id === replacement.id)
    ) {
      setError(
        "Этот вариант уже есть в чеке. Измените количество в его строке."
      );
      return;
    }
    update(id, { product: replacement });
  };
  const save = (payments: PosTender[], status = "completed", comment = "") =>
    act(async () => {
      if (!quote) return;
      const fingerprint = JSON.stringify({ cart, payments, status, comment });
      if (fingerprint !== attempt.current.fingerprint)
        attempt.current = { fingerprint, key: crypto.randomUUID() };
      const receipt = held
        ? await posRequest<PosSavedReceipt>(
            scope,
            `receipts/${held.id}/complete/`,
            { method: "POST", body: { payments } }
          )
        : await checkoutPosCart(scope, cart, {
            payments,
            status,
            comment,
            expectedTotal: quote.due,
            idempotencyKey: attempt.current.key,
          });
      reset();
      setCheckoutOpen(false);
      setHoldOpen(false);
      setSaved(receipt);
      invalidate();
    });
  const restore = (receipt: PosSavedReceipt) => {
    if (!rows.length) {
      void openHeld(receipt);
      return;
    }
    setConfirmRequest({
      title: "Открыть отложенный чек?",
      message: "Текущая корзина будет очищена.",
      confirmLabel: "Открыть",
      onConfirm: () => void openHeld(receipt),
    });
  };
  const openHeld = (receipt: PosSavedReceipt) =>
    act(async () => {
      setHeld(receipt);
      setWarehouseChoice(receipt.warehouseId);
      setBenefits(emptyBenefits);
      setRows(
        receipt.lines.map((line) => ({
          quantity: Number(line.quantity),
          product: {
            id: line.productId,
            name: line.productName,
            sku: "",
            barcode: "",
            barcodes: [],
            attributes: [],
            modelId: null,
            categoryId: null,
            price: line.unitPrice,
            stock: line.quantity,
            imageUrl: null,
          },
        }))
      );
      if (receipt.clientId && actions.clients) {
        const result = await posRequest<PosClient[]>(
          scope,
          `clients/?clientId=${receipt.clientId}`
        );
        setClient(result[0] ?? null);
      } else setClient(null);
      setList(null);
    });
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (event.key === "F5") {
        event.preventDefault();
        if (actions.sell && quote && !busy && !list && !lineDiscountIgnored)
          setCheckoutOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [actions.sell, quote, busy, list, lineDiscountIgnored]);

  React.useEffect(() => {
    let buffer = "";
    let lastDigitAt = 0;
    let resetTimer: number | undefined;

    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select, [contenteditable='true']")
      )
        return;

      if (event.key === "Enter") {
        if (buffer.length >= 3 && /^\d+$/.test(buffer)) {
          event.preventDefault();
          const code = buffer;
          buffer = "";
          window.clearTimeout(resetTimer);
          void scanProduct(code);
        }
        return;
      }
      if (event.key.length !== 1 || !/^\d$/.test(event.key)) return;

      const now = Date.now();
      if (now - lastDigitAt > 120) buffer = "";
      buffer += event.key;
      lastDigitAt = now;
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        buffer = "";
      }, 180);
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.clearTimeout(resetTimer);
    };
  }, [actions.sell, held, pending, scope.branchId, scope.organizationId, warehouseId]);

  if (!ready)
    return (
      <Stack p={3} gap={2}>
        <Typography variant="h5">Касса магазина</Typography>
        <Alert severity="info">
          Выберите организацию и конкретный филиал для работы с кассой.
        </Alert>
        <ActiveContextSwitcher />
      </Stack>
    );
  if (bootstrap.isError)
    return (
      <Stack p={3} gap={2}>
        <Alert severity="error">{message(bootstrap.error)}</Alert>
        <Button onClick={() => bootstrap.refetch()}>Повторить</Button>
      </Stack>
    );
  if (!data) return <LinearProgress />;
  const quoteError =
    quoteQuery.isError && !held ? message(quoteQuery.error) : null;
  const visibleError =
    error ??
    (quoteError && !inlineQuoteErrorField(quoteError)
      ? quoteError
      : products.isError
      ? message(products.error)
      : clients.isError
      ? message(clients.error)
      : null);
  const checkoutLines = quote
    ? quote.lines.map((line) => ({
        name: line.name,
        quantity: line.quantity,
        discountAmount: Number(line.discountAmount),
        total: Number(line.subtotal) - Number(line.discountAmount),
      }))
    : [];
  const checkoutBenefits = [
    { label: "Бонусы", value: Number(quote?.bonuses ?? 0), tone: "bonus" as const },
    { label: "Сертификат", value: Number(quote?.certificateAmount ?? 0), tone: "certificate" as const },
  ].filter((item) => item.value > 0);

  const dropdownVisible = !held && resultsOpen && canShowProducts;
  const dropdownLoading = isSearchPending || products.isFetching;
  const dropdownItems =
    dropdownVisible && !dropdownLoading && groupedProducts.length > 0
      ? groupedProducts
      : null;
  const dropdown = !dropdownVisible ? null : dropdownLoading ? (
    <Box sx={{ py: 1.5, px: 1.5 }}>
      <LinearProgress sx={{ borderRadius: 1 }} />
      <Typography color="text.secondary" fontSize={12} textAlign="center" sx={{ mt: 1 }}>
        Ищем товары…
      </Typography>
    </Box>
  ) : products.isError ? null : dropdownItems ? (
    <>
      <Typography
        sx={{
          px: 1.5,
          pt: 1,
          pb: 0.25,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: c.textDim,
        }}
      >
        Найдено: {dropdownItems.length}
        {products.data && products.data.count > products.data.results.length
          ? ` · показаны первые, уточните запрос`
          : ""}
      </Typography>
      <PosProductResults
        ref={resultsRef}
        items={dropdownItems}
        activeIndex={activeResult}
        onActiveIndexChange={setActiveResult}
        onAdd={(item, selectedVariant) => {
          const product =
            selectedVariant ??
            products.data?.results.find((candidate) => String(candidate.id) === item.id);
          if (product) void add(product);
        }}
        disabled={!actions.sell || pending}
      />
    </>
  ) : (
    <Stack direction="row" alignItems="center" justifyContent="center" gap={1} sx={{ px: 2, py: 2.5 }}>
      <SearchOffOutlined sx={{ color: c.textDim, fontSize: 20 }} />
      <Typography color="text.secondary" fontSize={13}>
        {categoryId != null
          ? "В выбранной категории товары не найдены."
          : "Товары не найдены. Попробуйте другое название."}
      </Typography>
    </Stack>
  );

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: c.page,
        color: c.text,
        overflow: "auto",
      }}
    >
      <style>{`@media print { body * { visibility:hidden !important; } #pos-print, #pos-print * { visibility:visible !important; } #pos-print { position:fixed; left:0; top:0; width:80mm; background:white; color:black; padding:8mm; } }`}</style>
      <PosTopBar
        inputRef={searchInputRef}
        search={search}
        onSearchChange={setSearch}
        onSearchFocus={() => setResultsOpen(true)}
        onSearchKeyDown={(event) => {
          if (!dropdownItems) {
            if (event.key === "Escape" && (search || selectedCategoryId != null)) {
              setResultsOpen(false);
              return true;
            }
            return false;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActiveResult((index) =>
              Math.min(Math.max(index + step, 0), dropdownItems.length - 1)
            );
            return true;
          }
          if (event.key === "Enter" && activeResult >= 0) {
            event.preventDefault();
            resultsRef.current?.pick(activeResult);
            return true;
          }
          if (event.key === "Escape") {
            setResultsOpen(false);
            return true;
          }
          return false;
        }}
        dropdown={dropdown}
        onDropdownClose={() => setResultsOpen(false)}
        categories={data.categories}
        categoryId={selectedCategoryId}
        onCategoryChange={setSelectedCategoryId}
        onNewReceipt={newReceipt}
        onOpenHeldReceipts={() => {
          setListOffset(0);
          setList("held");
        }}
        canSell={actions.sell && !pending}
        canHold={actions.hold}
        onScan={() => void scanProduct(search)}
      />
      {visibleError && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: 0 }}>
          {visibleError}
        </Alert>
      )}
      {!warehouseId && (
        <Alert severity="warning" sx={{ borderRadius: 0 }}>
          В этом филиале пока нет склада и товаров для продажи. Добавьте склад в
          разделе «Склады», затем загрузите каталог и оформите приход.
        </Alert>
      )}
      {held && (
        <Alert severity="info" sx={{ borderRadius: 0 }}>
          Отложенный чек №{held.number.slice(0, 8)}. Состав и цены сохранены;
          оплатите его или начните новый чек.
        </Alert>
      )}
      <Box
        sx={{
          flex: 1,
          minHeight: { xs: "auto", lg: 0 },
          display: "flex",
          flexDirection: { xs: "column", lg: "row" },
        }}
      >
        <Stack
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: { xs: "auto", lg: 0 },
            p: { xs: 1.25, md: 1.5 },
          }}
          gap={{ xs: 1.25, md: 1.5 }}
        >
          <Box sx={{ flex: 1, minHeight: { xs: 200, lg: 0 }, display: "flex" }}>
            <PosReceipt
              number={held?.number.slice(0, 8) ?? "новый"}
              lines={rows.map((row) => {
                const quoted = quoteStale
                  ? undefined
                  : serverQuote?.lines.find(
                      (line) => line.productId === row.product.id
                    );
                const heldLine = held?.lines.find(
                  (line) => line.productId === row.product.id
                );
                return {
                  ...toLine(row, variants),
                  ...(heldLine
                    ? { discountAmount: Number(heldLine.discountAmount ?? 0) }
                    : {}),
                  total: held
                    ? Number(heldLine?.total ?? row.product.price)
                    : quoted
                    ? Number(quoted.subtotal) - Number(quoted.discountAmount)
                    : undefined,
                };
              })}
              canHold={actions.hold && !!quote && !held && !busy}
              canDiscount={Boolean(actions.discount)}
              readOnly={!actions.sell || !!held || pending}
              onChangeColor={(id, value) => variant(id, "color", value)}
              onChangeSize={(id, value) => variant(id, "size", value)}
              onChangeQuantity={(id, quantity) => {
                const row = rows.find((r) => String(r.product.id) === id);
                if (row && quantity > Number(row.product.stock)) {
                  setError("Недостаточно свободного остатка.");
                  return;
                }
                update(id, { quantity });
              }}
              onChangeLineDiscount={(id, discountAmount, discountPercent) =>
                update(id, { discountAmount, discountPercent })
              }
              onRemoveLine={(id) => update(id, { removed: true })}
              onRestoreLine={(id) => update(id, { removed: false })}
              onHold={() => setHoldOpen(true)}
              onCancel={newReceipt}
            />
          </Box>
          {actions.clients && (
            <Box
              sx={{
                opacity: pending ? 0.6 : 1,
                pointerEvents: pending || held ? "none" : "auto",
              }}
            >
              <PosClientFooter
                client={client}
                query={clientQuery}
                onQueryChange={setClientQuery}
                results={clientSearch && !clients.isFetching ? clients.data ?? [] : null}
                searching={Boolean(clientSearch) && clients.isFetching}
                onSelectClient={(value) => {
                  setClient(value);
                  setClientQuery("");
                  setClientSearch("");
                  setBenefits(emptyBenefits);
                }}
                canRegister={actions.client_create}
                canHistory={actions.history}
                onRegister={async (name, phone) => {
                  let created = false;
                  await act(async () => {
                    const result = await posRequest<PosClient>(
                      scope,
                      "clients/",
                      {
                        method: "POST",
                        body: { name, phone, branchId: scope.branchId },
                      }
                    );
                    setClient(result);
                    setClientQuery("");
                    setClientSearch("");
                    setBenefits(emptyBenefits);
                    void cache.invalidateQueries({ queryKey: [...prefix, "clients"] });
                    created = true;
                  });
                  return created;
                }}
                onChangeClient={() => {
                  setClient(null);
                  setClientQuery("");
                  setClientSearch("");
                  setBenefits(emptyBenefits);
                }}
                onOpenHistory={() => {
                  setHistoryClient(client ? Number(client.id) : null);
                  setListOffset(0);
                  setList("history");
                }}
              />
            </Box>
          )}
        </Stack>
        <LivePaymentPanel
          actions={actions}
          benefits={benefits}
          onChange={setBenefits}
          quote={quote}
          quoteError={quoteError}
          busy={busy}
          onCheckout={() => setCheckoutOpen(true)}
          discountPercent={client?.discountPercent ?? 0}
          bonuses={client?.bonuses ?? 0}
          hasClient={!!client}
          locked={!!held || pending}
          discountKinds={discountKinds}
          discountMode={discountMode}
          lineDiscounts={panelLineDiscounts}
          lineDiscountIgnored={lineDiscountIgnored}
        />
      </Box>
      <PosConfirmDialog
        request={confirmRequest}
        onClose={() => setConfirmRequest(null)}
      />
      <PosHoldReceiptDialog
        open={holdOpen}
        onClose={() => setHoldOpen(false)}
        onConfirm={(comment) => void save([], "held", comment)}
      />
      {quote && (
        <CheckoutDialog
          open={checkoutOpen}
          due={quote.due}
          bootstrap={{ ...data, actions }}
          lines={checkoutLines}
          subtotal={Number(quote.subtotal)}
          discount={Number(quote.discount)}
          benefits={checkoutBenefits}
          pending={pending}
          error={error}
          onClose={() => setCheckoutOpen(false)}
          onPay={(payments) => void save(payments)}
        />
      )}
      <Dialog
        open={list !== null}
        onClose={() => setList(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {list === "held" ? "Отложенные чеки" : "История покупок"}
        </DialogTitle>
        <DialogContent>
          <Stack gap={1.5}>
            {receipts.isFetching && <LinearProgress />}
            {receipts.isError && (
              <Alert severity="error">{message(receipts.error)}</Alert>
            )}
            {receipts.data?.map((receipt) => (
              <Stack
                key={receipt.id}
                direction="row"
                alignItems="center"
                gap={2}
                sx={{
                  p: 1.5,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 2,
                }}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography fontWeight={700}>
                    №{receipt.number.slice(0, 8)} ·{" "}
                    {receipt.status === "held"
                      ? "Отложен"
                      : receipt.status === "returned"
                      ? "Возвращён"
                      : receipt.status === "draft"
                      ? "Отменён / черновик"
                      : "Завершён"}
                  </Typography>
                  <Typography fontSize={12} color="text.secondary">
                    {new Date(receipt.createdAt).toLocaleString("ru-RU")} ·{" "}
                    {receipt.lines.length} позиций · {receipt.comment}
                  </Typography>
                </Box>
                <PosAmount value={Number(receipt.totalAmount)} />
                {list === "held" && actions.sell && (
                  <Button
                    onClick={() => void restore(receipt)}
                    disabled={pending}
                  >
                    Открыть
                  </Button>
                )}
                {list === "held" && actions.cancel && (
                  <Button
                    color="error"
                    disabled={pending}
                    onClick={() =>
                      setConfirmRequest({
                        title: "Отменить чек?",
                        message: "Резерв товара будет освобождён.",
                        confirmLabel: "Отменить чек",
                        danger: true,
                        onConfirm: () =>
                          void act(async () => {
                            await posRequest(
                              scope,
                              `receipts/${receipt.id}/cancel/`,
                              { method: "POST" }
                            );
                            invalidate();
                          }),
                      })
                    }
                  >
                    Отменить
                  </Button>
                )}
                {list === "history" && (
                  <Button onClick={() => setSaved(receipt)}>Чек</Button>
                )}
                {list === "history" &&
                  actions.return &&
                  receipt.status === "completed" && (
                    <Button
                      color="error"
                      onClick={() => {
                        setReturnTarget(receipt);
                        setReason("");
                      }}
                    >
                      Возврат
                    </Button>
                  )}
              </Stack>
            ))}
            {!receipts.isFetching && receipts.data?.length === 0 && (
              <Typography>Чеков нет.</Typography>
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={!listOffset}
            onClick={() => setListOffset(Math.max(0, listOffset - 25))}
          >
            Назад
          </Button>
          <Button
            disabled={(receipts.data?.length ?? 0) < 25}
            onClick={() => setListOffset(listOffset + 25)}
          >
            Далее
          </Button>
          <Button onClick={() => setList(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!saved}
        onClose={() => setSaved(null)}
        fullWidth
        maxWidth="lg"
        PaperProps={{ sx: { borderRadius: { xs: 0, sm: 3 }, bgcolor: c.page, color: c.text, backgroundImage: "none", overflow: "hidden" } }}
      >
        {saved && <>
          <DialogTitle sx={{ px: { xs: 2, sm: 3 }, py: 1.5, borderBottom: `1px solid ${c.hairline}`, bgcolor: c.card }}>
            <Stack direction="row" alignItems="center" gap={1}>
              <Typography fontWeight={800}>Оплата</Typography>
              <Typography variant="caption" color="text.secondary">{saved.lines.length} товаров</Typography>
              <Typography variant="caption" color="text.secondary">· Чек №{saved.number.slice(0, 8)}</Typography>
              <IconButton onClick={() => setSaved(null)} size="small" sx={{ ml: "auto", color: "text.secondary" }}><CloseRounded fontSize="small" /></IconButton>
            </Stack>
          </DialogTitle>
          <DialogContent sx={{ p: { xs: 1.5, sm: 3 } }}>
          <Stack direction={{ xs: "column", md: "row" }} gap={{ xs: 2, md: 3 }}>
            <Box sx={{ width: { xs: "100%", md: 320 }, flexShrink: 0 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}><Typography sx={{ fontSize: 10, letterSpacing: ".1em", fontWeight: 800, color: c.textDim }}>ПЕЧАТНАЯ ФОРМА ЧЕКА</Typography><Typography sx={{ fontSize: 10, color: c.textDim }}>прокрутите</Typography></Stack>
              <Box id="pos-print" sx={{ bgcolor: "#fff", color: "#141722", p: { xs: 2, sm: 2.5 }, borderRadius: 1.5, boxShadow: "0 18px 50px rgba(0,0,0,.35)", minHeight: { md: 470 } }}>
                <Stack alignItems="center" gap={.25} mb={2}><Typography fontWeight={900} letterSpacing=".12em">{data.organization.name.toUpperCase()}</Typography><Typography variant="caption">{data.branch.name}</Typography><Typography variant="caption" color="#6e7280">Товарный чек · не фискальный</Typography></Stack>
                <Stack direction="row" justifyContent="space-between" mb={1}><Typography variant="caption">ЧЕК №{saved.number.slice(0, 8)}</Typography><Typography variant="caption">{new Date(saved.createdAt).toLocaleDateString("ru-RU")}</Typography></Stack>
                <Box sx={{ borderTop: "1px dashed #adb0ba", borderBottom: "1px dashed #adb0ba", py: 1 }}>{saved.lines.map((line) => <Stack key={line.id} direction="row" justifyContent="space-between" gap={1} py={.55}><Box sx={{ minWidth: 0 }}><Typography fontSize={12} fontWeight={600} noWrap>{line.productName}</Typography><Typography fontSize={10} color="#6e7280">{line.quantity} × {Number(line.unitPrice).toLocaleString("ru-RU")} сом{Number(line.discountAmount ?? 0) > 0 ? ` · скидка −${Number(line.discountAmount).toLocaleString("ru-RU")} сом` : ""}</Typography></Box><Typography fontSize={12} fontWeight={700} whiteSpace="nowrap">{Number(line.total).toLocaleString("ru-RU")} сом</Typography></Stack>)}</Box>
                <Stack gap={.5} mt={1.5}><Stack direction="row" justifyContent="space-between"><Typography variant="caption">Подытог</Typography><Typography variant="caption">{Number(saved.subtotal).toLocaleString("ru-RU")} сом</Typography></Stack><Stack direction="row" justifyContent="space-between"><Typography variant="caption">Скидка</Typography><Typography variant="caption">− {Number(saved.discountTotal).toLocaleString("ru-RU")} сом</Typography></Stack><Stack direction="row" justifyContent="space-between" mt={.5}><Typography fontWeight={800}>ИТОГО</Typography><Typography fontWeight={900}>{Number(saved.totalAmount).toLocaleString("ru-RU")} сом</Typography></Stack></Stack>
                <Stack alignItems="center" mt={2}><QrCode2Rounded sx={{ fontSize: 76, color: "#191c26" }} /><Typography fontSize={9} color="#777">Проверить чек</Typography></Stack>
              </Box>
            </Box>
            <Box sx={{ flex: 1, minWidth: 0, pt: { md: 3 } }}>
              <Box sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2.5, bgcolor: theme.palette.success.lighter, border: `1px solid ${alpha(theme.palette.success.main, 0.35)}` }}><Stack direction="row" gap={1.25} alignItems="flex-start"><CheckCircleRounded sx={{ color: c.positive, fontSize: 28 }} /><Box sx={{ minWidth: 0, flex: 1 }}><Stack direction="row" justifyContent="space-between" gap={1}><Box><Typography fontWeight={800} color={c.positive}>Оплата прошла успешно</Typography><Typography variant="caption" color={c.textDim}>Чек №{saved.number.slice(0, 8)} · {new Date(saved.createdAt).toLocaleString("ru-RU")}</Typography></Box><Chip size="small" label={saved.payments[0]?.method === "cash" ? "Оплата наличными" : "Оплата картой"} sx={{ bgcolor: alpha(theme.palette.success.main, 0.15), color: c.positive, fontSize: 10, fontWeight: 700 }} /></Stack><Typography variant="h4" fontWeight={900} sx={{ mt: 1, color: c.text }}>{Number(saved.totalAmount).toLocaleString("ru-RU")} сом</Typography></Box></Stack></Box>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" }, gap: 1, mt: 1.5 }}>{[{ label: "Позиций", value: `${saved.lines.length} шт.` }, { label: "Способ оплаты", value: saved.payments.map((payment) => payment.method === "cash" ? "Наличные" : payment.method === "card" ? "Карта" : "Безналичные").join(", ") }, { label: "Клиент", value: saved.clientId ? `#${saved.clientId}` : "Без клиента" }, { label: "Кассир", value: data.cashier }].map((item) => <Box key={item.label} sx={{ p: 1.25, borderRadius: 1.5, bgcolor: c.card, border: `1px solid ${c.hairline}`, minWidth: 0 }}><Typography variant="caption" color={c.textDim} noWrap>{item.label}</Typography><Typography fontWeight={700} noWrap>{item.value}</Typography></Box>)}</Box>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1, mt: 1 }}><Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: c.card, border: `1px solid ${c.hairline}` }}><Typography variant="caption" color={c.textDim}>Печатный чек</Typography><Typography fontWeight={700} color={c.positive}>Готов к печати</Typography></Box><Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: c.card, border: `1px solid ${c.hairline}` }}><Typography variant="caption" color={c.textDim}>Электронный чек</Typography><Typography fontWeight={700} color={c.positive}>Не отправлен</Typography></Box></Box>
              <Button fullWidth variant="contained" onClick={() => setSaved(null)} sx={{ mt: 1.5, minHeight: 46, borderRadius: 2, fontWeight: 800 }}>Новый чек <Box component="span" sx={{ ml: 1, opacity: .65, fontSize: 11 }}>Enter</Box></Button>
              <Stack direction={{ xs: "column", sm: "row" }} gap={1} mt={1}><Button fullWidth startIcon={<DownloadRounded />} sx={{ borderRadius: 2, bgcolor: c.card, color: c.accentText, border: `1px solid ${c.hairline}` }} onClick={() => window.print()}>Скачать чек</Button>{actions.print && <Button fullWidth startIcon={<PrintRounded />} sx={{ borderRadius: 2, bgcolor: c.card, color: c.accentText, border: `1px solid ${c.hairline}` }} onClick={() => window.print()}>Повторная печать</Button>}</Stack>
            </Box>
          </Stack>
          </DialogContent>
        </>}
      </Dialog>
      <Dialog
        open={!!returnTarget}
        onClose={() => setReturnTarget(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Возврат товаров по чеку</DialogTitle>
        <DialogContent>
          <Stack gap={2}>
            <Alert severity="info">
              Будет создан документ возврата и восстановлен остаток товара.
              Можно вернуть только товары из этого чека — сумма и количество
              возврата не могут превышать проданные.
              Возврат будет отражён в общей кассе тем же способом оплаты.
              Для карты также проведите операцию в терминале.
            </Alert>
            <TextField
              label="Причина возврата"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              fullWidth
            />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReturnTarget(null)}>Назад</Button>
          <Button
            color="error"
            disabled={!reason.trim() || pending}
            onClick={() =>
              void act(async () => {
                if (!returnTarget) return;
                await apiRequest(
                  `/v2/pos/receipts/${returnTarget.id}/return/`,
                  {
                    method: "POST",
                    headers: {
                      "X-Organization-Id": String(scope.organizationId),
                    },
                    body: { reason, lines: [] },
                  }
                );
                setReturnTarget(null);
                invalidate();
              })
            }
          >
            Подтвердить возврат
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

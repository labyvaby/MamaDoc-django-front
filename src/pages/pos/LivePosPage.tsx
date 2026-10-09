import React from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import SearchOffOutlined from "@mui/icons-material/SearchOffOutlined";
import QrCodeScannerOutlined from "@mui/icons-material/QrCodeScannerOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import PauseCircleOutlineRounded from "@mui/icons-material/PauseCircleOutlineRounded";
import { apiRequest } from "../../api/client";
import { uploadClientPhoto, type CreateClientPayload, type DjangoClientStatus } from "../../api/clients";
import { getDiscountKinds, type DiscountKind } from "../../api/promotions";
import {
  checkoutPosCart,
  type PosDebtTerms,
  getPosBootstrap,
  getPosClientCertificates,
  getPosProducts,
  posRequest,
  promoCodesEnabled,
  quotePosCart,
  type PosCart,
  type PosProduct,
  type PosQuote,
  type PosSavedReceipt,
  type PosTender,
} from "../../api/pos";
import { usePermissions } from "../../hooks/usePermissions";
import { ActiveContextSwitcher } from "../../components/sidebar/ActiveContextSwitcher";
import ClientEditorDrawer from "../clients/ClientEditorDrawer";
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
import { decimalForRequest, maxDiscountPercent } from "./discountInput";
import { POS_RADIUS, posColors } from "./layout";
import type { PosCatalogItem, PosClient, PosReceiptLine } from "./types";
import { PosAmount } from "./ui";
import { playScanFeedback, useBarcodeScanner } from "./barcodeScanner";
import { formatPosError, posError, toPosUserError, type PosUserError } from "./errors";
import { PosErrorNotice } from "./ErrorNotice";
import { CertificateSellDialog } from "./CertificateSellDialog";
import {
  HOLD_BLOCKED_BY_CERTIFICATE,
  certificateDraftsTotalCents,
  giftCardExpiryLabel,
  normalizeCheckoutResult,
  toCertificateInputs,
  type PosCertificateDraft,
  type PosSaleResult,
} from "./certificateCart";
import { SaleDoneDialog } from "./SaleDoneDialog";
import { heldNoticeFor, type HeldNotice } from "./holdNotice";

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
  /** Сертификаты, добавленные в чек, но ещё не оплаченные. */
  certificates?: PosCertificateDraft[];
};
/** Вкладки кассы на телефоне. */
type PhoneTab = "products" | "receipt" | "payment";
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
  // «Телефон» в теме — всё, что уже md (md = 768): там касса работает вкладками.
  const phone = useMediaQuery(theme.breakpoints.down("md"));
  const [tab, setTab] = React.useState<PhoneTab>("products");
  // Вкладки делят одну прокрутку: новая вкладка открывается сверху.
  const phoneContentRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    phoneContentRef.current?.scrollTo?.({ top: 0 });
  }, [tab]);
  const cache = useQueryClient();
  const scope = {
    organizationId: auth.activeOrganization?.id ?? 0,
    branchId: auth.activeBranch?.id ?? 0,
  };
  const ready = Boolean(
    scope.organizationId && scope.branchId && auth.hasModule("pos")
  );
  // Сертификат — карта организации, поэтому печать на ней — логотип
  // организации, а не филиала. `/auth/me/` отдаёт его вместе с организацией.
  const organizationLogoUrl = auth.activeOrganization?.logoUrl ?? null;
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
  // Промокод — часть права «Акции», но организация может выключить только
  // его. Тогда поле скрыто, а код из черновика чека не уходит на сервер.
  const canPromoCode =
    Boolean(actions.promotions) && promoCodesEnabled(data?.rules);
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
  // Сканер срабатывает чаще, чем React перерисовывает страницу: остаток
  // сверяем с последним составом чека, а не с тем, что был при прошлом рендере.
  const rowsRef = React.useRef<CartRow[]>(rows);
  rowsRef.current = rows;
  const [variants, setVariants] = React.useState<PosProduct[]>([]);
  const [client, setClient] = React.useState<PosClient | null>(null);
  const [clientQuery, setClientQuery] = React.useState("");
  const [clientSearch, setClientSearch] = React.useState("");
  const [clientEditorOpen, setClientEditorOpen] = React.useState(false);
  const [clientEditorQuery, setClientEditorQuery] = React.useState("");
  /** Для кого открыта форма нового клиента: покупатель чека или покупатель сертификата. */
  const [clientEditorTarget, setClientEditorTarget] = React.useState<"receipt" | "certificate">("receipt");
  const [certificateSellOpen, setCertificateSellOpen] = React.useState(false);
  const [certificateBuyer, setCertificateBuyer] = React.useState<PosClient | null>(null);
  /** Сертификаты, проданные строками текущего чека (сертификаты v2). */
  const [certificates, setCertificates] = React.useState<PosCertificateDraft[]>([]);
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
  const [error, setErrorState] = React.useState<PosUserError | null>(null);
  /** Принимает ошибку каталога, ответ API или строку — кассир видит понятный текст. */
  const setError = React.useCallback(
    (value: unknown) => setErrorState(value == null ? null : toPosUserError(value)),
    []
  );
  const [addedNotice, setAddedNotice] = React.useState<{ key: number; text: string } | null>(null);
  const [heldNotice, setHeldNotice] = React.useState<HeldNotice | null>(null);
  const [sale, setSale] = React.useState<PosSaleResult | null>(null);
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
      if (Array.isArray(draft.certificates)) setCertificates(draft.certificates);
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
      if (!rows.length && !held && !certificates.length) {
        window.localStorage.removeItem(draftKey);
        return;
      }
      const draft: PosDraft = { rows, client, benefits, held, warehouseChoice, certificates };
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // localStorage can be unavailable in private mode or when the quota is full.
    }
  }, [draftKey, rows, client, benefits, held, warehouseChoice, certificates]);

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
  const clientStatuses = useQuery({
    queryKey: [...prefix, "client-statuses"],
    queryFn: ({ signal }) => posRequest<DjangoClientStatus[]>(scope, "client-statuses/", { signal }),
    enabled: ready && !!actions.client_create && clientEditorOpen,
    staleTime: 5 * 60 * 1000,
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
    discountPercent: decimalForRequest(benefits.discountPercent),
    discountAmount: decimalForRequest(benefits.discount),
    discountKindId: benefits.discountKindId ?? undefined,
    clientDiscount: benefits.clientDiscount,
    promotions: benefits.promotions,
    promoCode: canPromoCode ? benefits.promoCode.trim() : "",
    useBonuses: benefits.bonuses,
    certificateCode: benefits.certificateCode.trim(),
    // Пустой список не отправляем: без сертификатов запрос остаётся прежним.
    ...(certificates.length ? { certificates: toCertificateInputs(certificates) } : {}),
  };
  /** В чеке есть что считать: товары или сертификаты. */
  const hasCartContent = cart.lines.length > 0 || certificates.length > 0;
  const certificatesTotal = certificateDraftsTotalCents(certificates) / 100;
  const quoteQuery = useQuery({
    queryKey: [...prefix, "quote", cart],
    queryFn: ({ signal }) => quotePosCart(scope, cart, signal),
    enabled: ready && !!warehouseId && hasCartContent && !held,
    staleTime: 0,
    retry: false,
    // Пока сервер пересчитывает, панель не мигает «—»: показываем оценку ниже.
    placeholderData: keepPreviousData,
  });
  // Сертификаты покупателя для способа оплаты «Сертификат» — грузим, когда
  // открыто окно оплаты: список нужен только там.
  const clientCertificates = useQuery({
    queryKey: [...prefix, "client-certificates", client?.id ?? null],
    queryFn: ({ signal }) => getPosClientCertificates(scope, Number(client?.id), signal),
    enabled: ready && !!actions.certificate && !!client && checkoutOpen && !held,
    staleTime: 0,
    retry: false,
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
    (quoteQuery.isError || !hasCartContent ? undefined : quoteQuery.data);
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
    hasCartContent &&
    !quoteQuery.isError &&
    (quoteQuery.isPlaceholderData || (!quoteQuery.data && quoteQuery.isFetching));
  const estimateQuote = (previous: PosQuote | undefined): PosQuote => {
    const afterLines = localSubtotal - localLineDiscount;
    const kind = discountKinds.find((item) => item.id === benefits.discountKindId);
    const percent = kind ? Number(kind.percent) : Number(benefits.discountPercent) || 0;
    // Процент (вид скидки или свой) считается от суммы после скидок на позиции, иначе — сумма.
    const cartDiscount = percent
      ? (afterLines * percent) / 100
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
    const certificate = previous && benefits.certificateCode.trim()
      ? Math.min(Number(previous.certificateAmount), total - bonusesUsed)
      : 0;
    return {
      subtotal: localSubtotal.toFixed(2),
      discount: discount.toFixed(2),
      total: total.toFixed(2),
      bonuses: bonusesUsed.toFixed(2),
      certificateAmount: certificate.toFixed(2),
      // Проданные сертификаты идут к оплате целиком: скидки на них не действуют.
      due: (total - bonusesUsed - certificate + certificatesTotal).toFixed(2),
      certificatesTotal: certificatesTotal.toFixed(2),
      promotionApplied: previous?.promotionApplied,
      appliedPromotions: previous?.appliedPromotions,
      lines: [],
    };
  };
  const quote = quoteStale ? estimateQuote(serverQuote) : serverQuote;
  // Старый бэкенд молча отбросил бы сертификаты и взял деньги только за товары.
  const certificatesUnsupported =
    !held && certificates.length > 0 && !!serverQuote && !quoteStale && serverQuote.certificatesTotal === undefined;
  const payDisabledReason = certificatesUnsupported
    ? "Сервер кассы ещё не принимает сертификаты в чеке. Уберите сертификат из чека или обновите бэкенд."
    : null;
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
    setCertificates([]);
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
    if (!rows.length && !certificates.length) {
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
      setError(e);
    } finally {
      sending.current = false;
      setPending(false);
    }
  };
  /** Добавить товар в чек. `true` — позиция добавлена или её количество выросло. */
  const add = async (product: PosProduct): Promise<boolean> => {
    if (!actions.sell) {
      setError(posError("NO_SELL_PERMISSION"));
      return false;
    }
    if (held || pending) return false;
    const stock = Number(product.stock);
    if (stock <= 0) {
      setError(posError("OUT_OF_STOCK", { name: product.name }));
      return false;
    }
    const existing = rowsRef.current.find((row) => row.product.id === product.id);
    if (existing && !existing.removed && existing.quantity >= stock) {
      setError(posError("STOCK_LIMIT", { name: product.name, stock }));
      return false;
    }
    setRows((previous) => {
      const current = previous.find((row) => row.product.id === product.id);
      if (current && !current.removed && current.quantity >= stock) return previous;
      return current
        ? previous.map((row) =>
            row.product.id === product.id
              ? { ...row, quantity: row.removed ? 1 : row.quantity + 1, removed: false }
              : row
          )
        : [...previous, { product, quantity: 1 }];
    });
    setError(null);
    setSearch("");
    // На телефоне фокус поднял бы клавиатуру поверх чека — там показываем подсказку.
    if (phone) setAddedNotice({ key: Date.now(), text: `Добавлено: ${product.name}` });
    else searchInputRef.current?.focus();
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
      } catch {
        // Без списка вариантов строка просто не предложит сменить цвет/размер.
      }
    }
    return true;
  };

  /**
   * Товар по штрихкоду или артикулу — только точное совпадение, без учёта
   * регистра. Поиск по названию сюда не подходит: частичное совпадение
   * положило бы в чек не тот товар.
   */
  const addByCode = async (rawCode: string, source: "scanner" | "manual") => {
    const code = rawCode.trim();
    if (!code) return;
    const fail = (value: PosUserError) => {
      setError(value);
      if (source === "scanner") playScanFeedback(false);
    };
    if (!actions.sell) return fail(posError("NO_SELL_PERMISSION"));
    if (held) return fail(posError("SCAN_HELD_RECEIPT"));
    if (pending) return fail(posError("SCAN_BUSY"));
    if (!warehouseId) return fail(posError("NO_WAREHOUSE"));
    if (source === "manual" && !canStartProductSearch(code)) return;
    try {
      const result = await getPosProducts(scope, { warehouseId, search: code, limit: 50 });
      const wanted = code.toLocaleLowerCase();
      const same = (value: string | null | undefined) => (value ?? "").trim().toLocaleLowerCase() === wanted;
      const exact = result.results.filter(
        (item) => same(item.barcode) || item.barcodes.some(same) || same(item.sku)
      );
      const match =
        exact.length === 1
          ? exact[0]
          : source === "manual" && !exact.length && result.count === 1
          ? result.results[0]
          : undefined;
      if (match) {
        if (await add(match)) {
          if (source === "scanner") playScanFeedback(true);
          setAddedNotice({ key: Date.now(), text: `Добавлено: ${match.name}` });
        } else if (source === "scanner") playScanFeedback(false);
        return;
      }
      if (exact.length > 1) return fail(posError("SCAN_AMBIGUOUS", { code }));
      // Ручной ввод с несколькими совпадениями по названию — кассир выберет в списке.
      if (source === "manual" && result.count > 0) return;
      fail(posError("SCAN_NOT_FOUND", { code }));
    } catch (e) {
      fail(toPosUserError(e));
    }
  };

  /** Код со сканера — сразу в чек, при любом фокусе. */
  const handleScan = (code: string) => {
    // Окно продажи сертификата: номер выдаёт CRM, сканировать там нечего.
    if (certificateSellOpen) {
      playScanFeedback(false);
      return;
    }
    // Открыто окно (оплата, скидка, выбор варианта): товар в чек не кладём —
    // иначе сумма поменялась бы прямо во время оплаты.
    const modalOpen =
      checkoutOpen ||
      holdOpen ||
      list !== null ||
      sale !== null ||
      returnTarget !== null ||
      confirmRequest !== null ||
      Boolean(document.querySelector(".MuiModal-root:not(.MuiModal-hidden)"));
    if (modalOpen) {
      setError(posError("SCAN_BLOCKED_DIALOG"));
      playScanFeedback(false);
      return;
    }
    setResultsOpen(false);
    void addByCode(code, "scanner");
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
      setError(posError("VARIANT_UNAVAILABLE"));
      return;
    }
    if (
      rows.some((item) => item !== row && item.product.id === replacement.id)
    ) {
      setError(posError("VARIANT_DUPLICATE"));
      return;
    }
    update(id, { product: replacement });
  };
  const save = (payments: PosTender[], status = "completed", comment = "", terms: PosDebtTerms = {}) =>
    act(async () => {
      if (!quote) return;
      const fingerprint = JSON.stringify({ cart, payments, status, comment, terms });
      if (fingerprint !== attempt.current.fingerprint)
        attempt.current = { fingerprint, key: crypto.randomUUID() };
      const result: PosSaleResult = held
        ? {
            receipt: await posRequest<PosSavedReceipt>(
              scope,
              `receipts/${held.id}/complete/`,
              { method: "POST", body: { payments } }
            ),
            certificates: [],
          }
        : normalizeCheckoutResult(
            await checkoutPosCart(scope, cart, {
              payments,
              status,
              comment,
              ...terms,
              expectedTotal: quote.due,
              idempotencyKey: attempt.current.key,
            })
          );
      const soldCertificates = certificates.length > 0 || result.certificates.length > 0;
      const soldOnCredit = payments.some((payment) => payment.method === "debt");
      reset();
      setCheckoutOpen(false);
      setHoldOpen(false);
      if (phone) setTab("products");
      // Отложенный чек не оплачен: окна «Оплата прошла» нет — только
      // подтверждение, что чек лежит в отложенных.
      if (status === "held") setHeldNotice(heldNoticeFor(result.receipt, comment));
      else setSale(result);
      invalidate();
      if (soldCertificates) {
        // Деньги за сертификат — операция кассы и смены, а не выручка чека.
        void cache.invalidateQueries({ queryKey: ["django", "cashbox"] });
        void cache.invalidateQueries({ queryKey: ["django", "shifts"] });
        void cache.invalidateQueries({ queryKey: ["django", "promotions", "certificates"] });
      }
      if (soldOnCredit) {
        // Долг появился в карточке покупателя и в реестре долгов.
        void cache.invalidateQueries({ queryKey: ["client-debts"] });
      }
    });
  const restore = (receipt: PosSavedReceipt) => {
    if (!rows.length && !certificates.length) {
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
      setCertificates([]);
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
        if (actions.sell && quote && !busy && !list && !lineDiscountIgnored && !certificateSellOpen && !payDisabledReason)
          setCheckoutOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [actions.sell, quote, busy, list, lineDiscountIgnored, certificateSellOpen, payDisabledReason]);

  useBarcodeScanner(handleScan, ready && Boolean(data));

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
        <PosErrorNotice inline error={toPosUserError(bootstrap.error)} />
        <Button onClick={() => bootstrap.refetch()}>Повторить</Button>
      </Stack>
    );
  if (!data) return <LinearProgress />;
  const quoteError =
    quoteQuery.isError && !held ? message(quoteQuery.error) : null;
  const quoteErrorField = inlineQuoteErrorField(quoteError);
  // Ошибку промокода и оплаты сертификатом панель показывает под своим блоком;
  // остальное (в том числе ошибки продажи сертификата) — баннером.
  const quoteErrorInline =
    (quoteErrorField === "promo" && canPromoCode) ||
    (quoteErrorField === "certificate" && Boolean(benefits.certificateCode.trim()));
  const visibleError: PosUserError | null =
    error ??
    (quoteError && !quoteErrorInline
      ? toPosUserError(quoteQuery.error)
      : products.isError
      ? toPosUserError(products.error)
      : clients.isError
      ? toPosUserError(clients.error)
      : null);
  const checkoutLines = quote
    ? [
        ...quote.lines.map((line) => ({
          name: line.name,
          quantity: line.quantity,
          discountAmount: Number(line.discountAmount),
          total: Number(line.subtotal) - Number(line.discountAmount),
        })),
        ...(held
          ? []
          : certificates.map((item) => ({
              name: `Подарочный сертификат · ${item.client.name}`,
              quantity: "1",
              total: item.nominalCents / 100,
              certificate: true,
            }))),
      ]
    : [];
  const checkoutBenefits = [
    { label: "Оплата сертификатом", value: Number(quote?.certificateAmount ?? 0), tone: "certificate" as const },
    { label: "Бонусы", value: Number(quote?.bonuses ?? 0), tone: "bonus" as const },
    { label: "Подарочные сертификаты", value: held ? 0 : certificatesTotal, tone: undefined },
  ].filter((item) => item.value > 0);
  const receiptCertificates = held
    ? []
    : certificates.map((item) => ({
        key: item.key,
        clientName: item.client.name,
        amount: item.nominalCents / 100,
        expiryLabel: giftCardExpiryLabel(item.noExpiry, item.expiresOn),
        comment: item.comment,
      }));
  const due = quote ? Number(quote.due) : 0;
  const canPay =
    Boolean(actions.sell) && !!quote && !busy && !lineDiscountIgnored && !payDisabledReason;
  const receiptCount =
    rows.filter((row) => !row.removed).length + receiptCertificates.length;

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

  const receiptView = (
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
      certificates={receiptCertificates}
      onRemoveCertificate={(key) =>
        setCertificates((current) => current.filter((item) => item.key !== key))
      }
      // Сервер не откладывает чек с сертификатом — кнопку не даём нажать.
      canHold={actions.hold && !!quote && !held && !busy && !certificates.length}
      holdHint={certificates.length ? HOLD_BLOCKED_BY_CERTIFICATE : undefined}
      canDiscount={Boolean(actions.discount)}
      readOnly={!actions.sell || !!held || pending}
      onChangeColor={(id, value) => variant(id, "color", value)}
      onChangeSize={(id, value) => variant(id, "size", value)}
      onChangeQuantity={(id, quantity) => {
        const row = rows.find((r) => String(r.product.id) === id);
        if (row && quantity > Number(row.product.stock)) {
          setError(posError("STOCK_LIMIT", { name: row.product.name, stock: Number(row.product.stock) }));
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
  );
  const clientView = actions.clients ? (
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
        onCreateClient={(query) => {
          setClientEditorTarget("receipt");
          setClientEditorQuery(query);
          setClientEditorOpen(true);
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
  ) : null;
  const paymentPanel = (
    <LivePaymentPanel
      actions={actions}
      canPromoCode={canPromoCode}
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
      maxPercent={maxDiscountPercent(data.rules)}
      lineDiscounts={panelLineDiscounts}
      lineDiscountIgnored={lineDiscountIgnored}
      certificatesTotal={held ? 0 : Number(quote?.certificatesTotal ?? certificatesTotal)}
      hidePayButton={phone}
      payDisabledReason={payDisabledReason}
      activePromotionsCount={data.activePromotionsCount}
    />
  );
  /** Телефон, вкладка «Товары»: найденные товары — списком во всю ширину. */
  const productsPane = (
    <Box sx={{ px: 1.5, py: 1.25 }}>
      {dropdown ? (
        <Box
          sx={{
            px: "4px",
            bgcolor: c.card,
            border: `1px solid ${c.outline}`,
            borderRadius: `${POS_RADIUS.card}px`,
          }}
        >
          {dropdown}
        </Box>
      ) : (
        <Stack alignItems="center" gap={1} sx={{ py: 6, px: 2, textAlign: "center" }}>
          <Box sx={{ width: 56, height: 56, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: c.tile }}>
            <QrCodeScannerOutlined sx={{ fontSize: 28, color: c.textDim }} />
          </Box>
          <Typography sx={{ fontSize: 16, fontWeight: 800, color: c.text }}>
            {held ? "Отложенный чек" : "Найдите товар"}
          </Typography>
          <Typography sx={{ fontSize: 13, color: c.textDim, maxWidth: 300 }}>
            {held
              ? "Состав отложенного чека менять нельзя — откройте вкладку «Чек» или «Оплата»."
              : "Название, артикул или штрихкод — в поле выше. Сканер тоже работает: товар сразу ляжет в чек."}
          </Typography>
          {receiptCount > 0 && (
            <Button variant="outlined" onClick={() => setTab("receipt")} sx={{ mt: 1, minHeight: 44, borderRadius: `${POS_RADIUS.control}px` }}>
              Открыть чек ({receiptCount})
            </Button>
          )}
        </Stack>
      )}
    </Box>
  );

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: c.page,
        color: c.text,
        // Телефон: прокручивается только вкладка, шапка и нижняя панель на месте.
        overflow: phone ? "hidden" : "auto",
        overflowX: "hidden",
      }}
    >
      <style>{`@media print { body * { visibility:hidden !important; } #pos-print, #pos-print * { visibility:visible !important; } #pos-print { position:fixed; left:0; top:0; width:80mm; background:white; color:black; padding:8mm; max-height:none !important; overflow:visible !important; } }`}</style>
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
        // На телефоне список — во вкладке под шапкой, а не поверх неё.
        onDropdownClose={phone ? undefined : () => setResultsOpen(false)}
        searchMode={phone ? (tab === "products" ? "inline" : "hidden") : "dropdown"}
        autoFocusSearch={!phone}
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
        canSellCertificate={Boolean(actions.certificate_sell)}
        sellCertificateDisabledReason={
          held ? "Сначала оплатите отложенный чек или начните новый" : pending ? "Подождите, чек сохраняется" : undefined
        }
        onSellCertificate={() => {
          // Чаще всего сертификат покупает тот же покупатель, что и в чеке.
          setCertificateBuyer(client);
          setCertificateSellOpen(true);
        }}
        onScan={() => void addByCode(search, "manual")}
      />
      {visibleError && (
        <PosErrorNotice error={visibleError} onClose={() => setError(null)} />
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
      {phone ? (
        <>
          <Box ref={phoneContentRef} sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
            {tab === "products" && productsPane}
            {tab === "receipt" && (
              <Stack gap={1.25} sx={{ p: 1.25 }}>
                <Box sx={{ display: "flex", minHeight: 160 }}>{receiptView}</Box>
                {clientView}
              </Stack>
            )}
            {tab === "payment" && (
              <Stack gap={0}>
                {clientView ? <Box sx={{ px: 1.25, pt: 1.25 }}>{clientView}</Box> : null}
                {paymentPanel}
              </Stack>
            )}
          </Box>
          <Box
            sx={{
              flexShrink: 0,
              bgcolor: c.card,
              borderTop: `1px solid ${c.outline}`,
              pb: "env(safe-area-inset-bottom)",
            }}
          >
            {actions.sell && (hasCartContent || held) && (
              <Box sx={{ px: 1.25, pt: 1 }}>
                <ButtonBase
                  onClick={() => setCheckoutOpen(true)}
                  disabled={!canPay}
                  aria-label={`Оплатить ${quote ? quote.due : ""} сом`}
                  sx={{
                    width: "100%",
                    minHeight: 52,
                    px: 2.5,
                    justifyContent: "space-between",
                    borderRadius: `${POS_RADIUS.control}px`,
                    bgcolor: c.accent,
                    color: c.onAccent,
                    fontSize: 16,
                    fontWeight: 800,
                    "&.Mui-disabled": { opacity: 0.45 },
                  }}
                >
                  <span>{busy ? "Считаем…" : "Оплатить"}</span>
                  <span>{quote ? <PosAmount value={due} /> : "—"}</span>
                </ButtonBase>
              </Box>
            )}
            <BottomNavigation
              showLabels
              value={tab}
              onChange={(_, value: PhoneTab) => setTab(value)}
              sx={{
                height: 60,
                bgcolor: "transparent",
                "& .MuiBottomNavigationAction-root": { minWidth: 0, color: c.textDim },
                "& .Mui-selected": { color: c.accentText },
                "& .MuiBottomNavigationAction-label": { fontSize: 12, fontWeight: 700 },
                "& .MuiBottomNavigationAction-label.Mui-selected": { fontSize: 12 },
              }}
            >
              <BottomNavigationAction value="products" label="Товары" icon={<Inventory2Outlined />} />
              <BottomNavigationAction
                value="receipt"
                label={receiptCount ? `Чек (${receiptCount})` : "Чек"}
                icon={<ReceiptLongOutlined />}
              />
              <BottomNavigationAction value="payment" label="Оплата" icon={<PaymentsOutlined />} />
            </BottomNavigation>
          </Box>
        </>
      ) : (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "row",
          }}
        >
          <Stack
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              p: 1.5,
            }}
            gap={1.5}
          >
            <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>{receiptView}</Box>
            {clientView}
          </Stack>
          {paymentPanel}
        </Box>
      )}
      <ClientEditorDrawer
        open={clientEditorOpen}
        organizationId={scope.organizationId || null}
        client={null}
        initialQuery={clientEditorQuery}
        statuses={clientStatuses.data ?? []}
        showPhoto={auth.hasPermission("clients.update") || auth.isSuperAdmin()}
        // Поверх окна продажи сертификата: у Drawer слой ниже, чем у Dialog.
        zIndex={clientEditorTarget === "certificate" ? theme.zIndex.modal + 1 : undefined}
        onClose={() => setClientEditorOpen(false)}
        onCreate={async (payload: CreateClientPayload, photoFile) => {
          // Организацию касса передаёт заголовком (posRequest), а ФИО ручка
          // кассы исторически принимает как `name`.
          const fields: Partial<CreateClientPayload> = { ...payload };
          delete fields.fullName;
          delete fields.organizationId;
          const result = await posRequest<PosClient>(scope, "clients/", {
            method: "POST",
            body: { ...fields, name: payload.fullName, branchId: scope.branchId },
          });
          if (clientEditorTarget === "certificate") {
            setCertificateBuyer(result);
          } else {
            setClient(result);
            setClientQuery("");
            setClientSearch("");
            setBenefits(emptyBenefits);
          }
          void cache.invalidateQueries({ queryKey: [...prefix, "clients"] });
          void cache.invalidateQueries({ queryKey: ["clients", scope.organizationId] });
          if (photoFile) {
            try {
              await uploadClientPhoto(Number(result.id), photoFile);
            } catch {
              setError(posError("CLIENT_PHOTO_NOT_SAVED"));
            }
          }
        }}
      />
      <Snackbar
        key={addedNotice?.key}
        open={addedNotice !== null}
        autoHideDuration={1600}
        onClose={() => setAddedNotice(null)}
        message={addedNotice?.text}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        ContentProps={{ sx: { fontWeight: 700 } }}
        // На телефоне — над липкой кнопкой оплаты и вкладками.
        sx={{ bottom: phone ? "calc(136px + env(safe-area-inset-bottom)) !important" : undefined }}
      />
      <Snackbar
        key={heldNotice?.key}
        open={heldNotice !== null}
        autoHideDuration={8000}
        onClose={(_, reason) => {
          // Случайный клик по кассе не должен прятать подтверждение раньше времени.
          if (reason !== "clickaway") setHeldNotice(null);
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        sx={{ bottom: phone ? "calc(136px + env(safe-area-inset-bottom)) !important" : undefined }}
      >
        <Alert
          severity="info"
          icon={<PauseCircleOutlineRounded fontSize="inherit" />}
          onClose={() => setHeldNotice(null)}
          sx={{ width: { xs: "calc(100vw - 32px)", md: 380 }, maxWidth: 420, alignItems: "flex-start", boxShadow: 6, "& .MuiAlert-message": { minWidth: 0, flex: 1 } }}
        >
          <Typography sx={{ fontSize: 14, fontWeight: 800, lineHeight: 1.3 }}>{heldNotice?.title}</Typography>
          <Typography sx={{ mt: "2px", fontSize: 12, lineHeight: 1.35, color: "text.secondary", overflowWrap: "anywhere" }}>
            {heldNotice?.comment ? `«${heldNotice.comment}» · ` : ""}оплата не принята, чек ждёт в отложенных
          </Typography>
          {actions.hold ? (
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                setHeldNotice(null);
                setListOffset(0);
                setList("held");
              }}
              sx={{ mt: 1, minHeight: 36, fontWeight: 800 }}
            >
              Открыть отложенные
            </Button>
          ) : null}
        </Alert>
      </Snackbar>
      <PosConfirmDialog
        request={confirmRequest}
        onClose={() => setConfirmRequest(null)}
      />
      <PosHoldReceiptDialog
        open={holdOpen}
        onClose={() => setHoldOpen(false)}
        onConfirm={(comment) => void save([], "held", comment)}
      />
      {actions.certificate_sell && (
        <CertificateSellDialog
          open={certificateSellOpen}
          scope={scope}
          organizationName={data.organization.name}
          organizationLogoUrl={organizationLogoUrl}
          canSearchClients={Boolean(actions.clients)}
          buyer={certificateBuyer}
          onBuyerChange={setCertificateBuyer}
          onCreateBuyer={
            actions.client_create
              ? (query) => {
                  setClientEditorTarget("certificate");
                  setClientEditorQuery(query);
                  setClientEditorOpen(true);
                }
              : undefined
          }
          onClose={() => setCertificateSellOpen(false)}
          onAdd={(draft) => {
            setCertificates((current) => [...current, draft]);
            // Покупатель сертификата платит за чек: если покупателя чека ещё
            // нет, им становится он (скидки и бонусы клиента — по кнопкам).
            if (!client && certificateBuyer) {
              setClient(certificateBuyer);
              setBenefits(emptyBenefits);
            }
            setCertificateSellOpen(false);
            setCertificateBuyer(null);
            setError(null);
            if (phone) setTab("receipt");
            setAddedNotice({ key: Date.now(), text: "Сертификат добавлен в чек" });
          }}
        />
      )}
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
          recalculating={!held && quoteQuery.isFetching}
          error={error ? formatPosError(error) : null}
          onClose={() => setCheckoutOpen(false)}
          onPay={(payments, terms) => void save(payments, "completed", "", terms)}
          debt={
            held
              ? undefined
              : {
                  enabled: Boolean(actions.debt),
                  hasGoods: cart.lines.length > 0,
                  hasCertificates: certificates.length > 0,
                  clientName: client?.name ?? null,
                  onPickClient: () => {
                    setCheckoutOpen(false);
                    if (phone) setTab("receipt");
                  },
                }
          }
          certificate={
            held
              ? undefined
              : {
                  hasGoods: cart.lines.length > 0,
                  clientName: client?.name ?? null,
                  list: clientCertificates.data,
                  loading: clientCertificates.isFetching,
                  loadError: clientCertificates.isError
                    ? formatPosError(toPosUserError(clientCertificates.error))
                    : null,
                  applied: benefits.certificateCode.trim(),
                  appliedAmount: Number(quote.certificateAmount ?? 0),
                  onApply: (code) =>
                    setBenefits((current) => ({ ...current, certificateCode: code })),
                  onPickClient: () => {
                    setCheckoutOpen(false);
                    if (phone) setTab("receipt");
                  },
                }
          }
        />
      )}
      <Dialog
        fullScreen={phone}
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
              <PosErrorNotice inline error={toPosUserError(receipts.error)} />
            )}
            {receipts.data?.map((receipt) => (
              <Stack
                key={receipt.id}
                direction="row"
                alignItems="center"
                flexWrap={{ xs: "wrap", md: "nowrap" }}
                gap={{ xs: 1, md: 2 }}
                sx={{
                  p: 1.5,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 2,
                }}
              >
                <Box sx={{ flex: { xs: "1 1 100%", md: 1 }, minWidth: 0 }}>
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
                  <Button onClick={() => setSale({ receipt, certificates: [] })}>Чек</Button>
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
            {error && <PosErrorNotice inline error={error} />}
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
      <SaleDoneDialog
        sale={sale}
        organizationName={data.organization.name}
        organizationLogoUrl={organizationLogoUrl}
        branchName={data.branch.name}
        cashier={data.cashier}
        canPrint={Boolean(actions.print)}
        cashlessMethods={data.cashlessMethods}
        onClose={() => setSale(null)}
      />
      <Dialog
        fullScreen={phone}
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
            {error && <PosErrorNotice inline error={error} />}
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

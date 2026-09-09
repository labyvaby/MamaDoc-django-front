import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { apiRequest } from "../../api/client";
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
import { PosCategoryBar } from "./CategoryBar";
import { PosClientFooter } from "./ClientFooter";
import { PosHoldReceiptDialog } from "./HoldReceiptDialog";
import { PosProductCards } from "./ProductCards";
import { PosReceipt } from "./Receipt";
import { PosTopBar } from "./TopBar";
import { CheckoutDialog } from "./CheckoutDialog";
import {
  LivePaymentPanel,
  emptyBenefits,
  type Benefits,
} from "./LivePaymentPanel";
import { posColors } from "./layout";
import type { PosClient, PosReceiptLine } from "./types";
import { PosAmount } from "./ui";

type CartRow = { product: PosProduct; quantity: number; removed?: boolean };
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
    sku: p.sku,
    barcode: p.barcode,
    quantity: row.quantity,
    price: Number(p.price),
    imageUrl: p.imageUrl,
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

export default function LivePosPage() {
  const auth = usePermissions();
  const c = posColors(useTheme());
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
  const warehouseId = warehouseChoice ?? data?.warehouses[0]?.id ?? 0;
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [category, setCategory] = React.useState<string | null>(null);
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
  const [returnTarget, setReturnTarget] =
    React.useState<PosSavedReceipt | null>(null);
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    const id = window.setTimeout(() => {
      setDebounced(search);
    }, 250);
    return () => window.clearTimeout(id);
  }, [search]);
  const categoryId = data?.categories.find(
    (item) => item.name === category
  )?.id;
  const products = useQuery({
    queryKey: [
      ...prefix,
      "products",
      warehouseId,
      debounced,
      categoryId,
    ],
    queryFn: ({ signal }) =>
      getPosProducts(
        scope,
        {
          warehouseId,
          search: debounced,
          limit: 200,
          ...(categoryId ? { categoryId } : {}),
        },
        signal
      ),
    enabled: ready && !!warehouseId,
  });
  const clients = useQuery({
    queryKey: [...prefix, "clients", clientSearch],
    queryFn: ({ signal }) =>
      posRequest<PosClient[]>(
        scope,
        `clients/?search=${encodeURIComponent(clientSearch)}`,
        { signal }
      ),
    enabled: ready && !!actions.clients && !held,
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
      })),
    discountPercent: benefits.discount || "0",
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
  });
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
  const quote =
    heldQuote ??
    (quoteQuery.isError || !cart.lines.length ? undefined : quoteQuery.data);
  const busy = pending || (!held && quoteQuery.isFetching);
  const reset = () => {
    setRows([]);
    setHeld(null);
    setClient(null);
    setBenefits(emptyBenefits);
    setSearch("");
    setError(null);
    attempt.current = { fingerprint: "", key: "" };
  };
  const newReceipt = () => {
    if (sending.current) return;
    if (
      !rows.length ||
      window.confirm("Начать новый чек? Несохранённая корзина будет очищена.")
    )
      reset();
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
  const restore = (receipt: PosSavedReceipt) =>
    act(async () => {
      if (
        rows.length &&
        !window.confirm(
          "Открыть отложенный чек? Текущая корзина будет очищена."
        )
      )
        return;
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
        document
          .querySelector<HTMLInputElement>(
            'input[placeholder^="Поиск по названию"]'
          )
          ?.focus();
      }
      if (event.key === "F5") {
        event.preventDefault();
        if (actions.sell && quote && !busy && !list)
          setCheckoutOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [actions.sell, quote, busy, list]);

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
  const visibleError =
    error ??
    (quoteQuery.isError && !held
      ? message(quoteQuery.error)
      : products.isError
      ? message(products.error)
      : clients.isError
      ? message(clients.error)
      : null);

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
        search={search}
        onSearchChange={setSearch}
        onNewReceipt={newReceipt}
        onOpenHeldReceipts={() => {
          setListOffset(0);
          setList("held");
        }}
        canSell={actions.sell && !pending}
        canHold={actions.hold}
        onScan={() => {
          const code = search.trim();
          if (!code || !actions.sell || pending || held) return;
          void getPosProducts(scope, { warehouseId, search: code })
            .then((result) => {
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
            })
            .catch((e) => setError(message(e)));
        }}
      />
      {visibleError && (
        <Alert severity="error" onClose={() => setError(null)}>
          {visibleError}
        </Alert>
      )}
      {!warehouseId && (
        <Alert severity="warning">
          В этом филиале пока нет склада и товаров для продажи. Добавьте склад в
          разделе «Склады», затем загрузите каталог и оформите приход. Суммы и
          товары не подменяются демонстрационными данными.
        </Alert>
      )}
      {held && (
        <Alert severity="info">
          Отложенный чек №{held.number.slice(0, 8)}. Состав и цены сохранены;
          оплатите его или начните новый чек.
        </Alert>
      )}
      <PosCategoryBar
        categories={data.categories.map((item) => item.name)}
        active={category}
        onSelect={(value) => {
          setCategory(value);
        }}
      />
      {!held && category && ((products.data?.count ?? 0) > 0 || !!search) && (
        <>
          {products.isFetching && <LinearProgress />}
          <PosProductCards
            items={(products.data?.results ?? []).map((product) => ({
              ...toLine({ product, quantity: 1 }, [product]),
              id: String(product.id),
              stock: Number(product.stock),
            }))}
            onAdd={(item) => {
              const product = products.data?.results.find(
                (p) => String(p.id) === item.id
              );
              if (product) void add(product);
            }}
            disabled={!actions.sell || pending}
          />
        </>
      )}
      <Box
        sx={{
          flex: 1,
          minHeight: { xs: 480, lg: 0 },
          display: "flex",
          flexDirection: { xs: "column", lg: "row" },
        }}
      >
        <Stack sx={{ flex: 1, minWidth: 0, px: 1.5, pb: 1.5 }} gap={1.5}>
          <Box
            sx={{
              flex: 1,
              minHeight: 260,
              display: "flex",
              overflowX: "auto",
              "& > div": { minWidth: 780 },
            }}
          >
            <PosReceipt
              number={held?.number.slice(0, 8) ?? "новый"}
              lines={rows.map((row) => ({
                ...toLine(row, variants),
                total: held
                  ? Number(
                      held.lines.find(
                        (line) => line.productId === row.product.id
                      )?.total ?? row.product.price
                    )
                  : quote?.lines.find(
                      (line) => line.productId === row.product.id
                    )
                  ? Number(
                      quote.lines.find(
                        (line) => line.productId === row.product.id
                      )!.subtotal
                    ) -
                    Number(
                      quote.lines.find(
                        (line) => line.productId === row.product.id
                      )!.discountAmount
                    )
                  : undefined,
              }))}
              canHold={actions.hold && !!quote && !held && !busy}
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
              onRemoveLine={(id) => update(id, { removed: true })}
              onRestoreLine={(id) => update(id, { removed: false })}
              onHold={() => setHoldOpen(true)}
              onCancel={newReceipt}
            />
          </Box>
          {rows.length === 0 && (
            <Typography textAlign="center" color="text.secondary">
              Найдите товар по названию или отсканируйте штрихкод, чтобы начать
              продажу.
            </Typography>
          )}
          {actions.clients && (
            <Box
              sx={{
                overflowX: "auto",
                opacity: pending ? 0.6 : 1,
                pointerEvents: pending || held ? "none" : "auto",
                "& > div": { minWidth: 760 },
              }}
            >
              <PosClientFooter
                client={client}
                query={clientQuery}
                onQueryChange={setClientQuery}
                onSearch={() => setClientSearch(clientQuery)}
                results={clientSearch ? clients.data ?? [] : null}
                onSelectClient={(value) => {
                  setClient(value);
                  setBenefits(emptyBenefits);
                }}
                canRegister={actions.client_create}
                canHistory={actions.history}
                onRegister={(name, phone) =>
                  void act(async () => {
                    const result = await posRequest<PosClient>(
                      scope,
                      "clients/",
                      {
                        method: "POST",
                        body: { name, phone, branchId: scope.branchId },
                      }
                    );
                    setClient(result);
                    invalidate();
                  })
                }
                onChangeClient={() => {
                  setClient(null);
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
          busy={busy}
          onCheckout={() => setCheckoutOpen(true)}
          discountPercent={client?.discountPercent ?? 0}
          bonuses={client?.bonuses ?? 0}
          hasClient={!!client}
          locked={!!held || pending}
        />
      </Box>
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
                    onClick={() => {
                      if (
                        window.confirm(
                          "Отменить чек и освободить резерв товара?"
                        )
                      )
                        void act(async () => {
                          await posRequest(
                            scope,
                            `receipts/${receipt.id}/cancel/`,
                            { method: "POST" }
                          );
                          invalidate();
                        });
                    }}
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
        maxWidth="sm"
      >
        <DialogTitle>
          {saved?.status === "held" ? "Чек отложен" : "Товарный чек"}
        </DialogTitle>
        <DialogContent>
          {saved && (
            <Box id="pos-print">
              <Typography variant="h5">{data.organization.name}</Typography>
              <Typography>{data.branch.name}</Typography>
              <Typography fontSize={12}>
                №{saved.number} ·{" "}
                {new Date(saved.createdAt).toLocaleString("ru-RU")}
              </Typography>
              <Typography fontSize={12} color="text.secondary">
                Товарный чек · не является фискальным документом
              </Typography>
              {saved.lines.map((line) => (
                <Stack
                  key={line.id}
                  direction="row"
                  justifyContent="space-between"
                  py={1}
                >
                  <Typography>
                    {line.productName} × {line.quantity}
                  </Typography>
                  <PosAmount value={Number(line.total)} />
                </Stack>
              ))}
              <Typography variant="h5" mt={2}>
                Итого: <PosAmount value={Number(saved.totalAmount)} />
              </Typography>
              {saved.payments.map((payment) => (
                <Typography key={payment.id}>
                  {(
                    {
                      cash: "Наличные",
                      card: "Карта",
                      cashless: "Безналичные",
                      bonus: "Бонусы",
                      certificate: "Сертификат",
                    } as Record<string, string>
                  )[payment.method] ?? payment.method}
                  : {payment.amount} сом
                </Typography>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {actions.print && saved && (
            <Button onClick={() => window.print()}>Печать</Button>
          )}
          <Button onClick={() => setSaved(null)}>Закрыть</Button>
        </DialogActions>
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
              Возврат банковского платежа выполняется отдельно в терминале.
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

import React from "react";
import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";

import { POS_LAYOUT, posColors } from "./layout";
import { PosCategoryBar } from "./CategoryBar";
import { PosClientFooter } from "./ClientFooter";
import { PosHeldReceiptsDialog } from "./HeldReceiptsDialog";
import { PosHoldReceiptDialog } from "./HoldReceiptDialog";
import { PosPaymentPanel, type PosPaymentState, type PosTotals } from "./PaymentPanel";
import { PosProductCards } from "./ProductCards";
import { PosReceipt } from "./Receipt";
import { PosRecommendationBar } from "./RecommendationBar";
import { PosTopBar } from "./TopBar";
import {
  POS_CASHIER,
  POS_CATALOG,
  POS_CATEGORIES,
  POS_CERTIFICATE_AMOUNT,
  POS_CLIENT,
  POS_CLIENT_SEARCH_RESULTS,
  POS_DISCOUNTS,
  POS_HELD_RECEIPTS,
  POS_RECEIPT_LINES,
  POS_RECEIPT_NUMBER,
  POS_RECOMMENDATION,
  POS_VALID_PROMO,
} from "./mocks";
import type { PosCatalogItem, PosClient, PosClientSearchResult, PosHeldReceipt, PosReceiptLine } from "./types";

const EMPTY_PAYMENT: PosPaymentState = {
  clientDiscountApplied: false,
  extraDiscountId: null,
  bonusesApplied: false,
  cashbackApplied: false,
  promoCode: null,
  certificate: null,
};

/** Строка чека из карточки каталога — количество копится, а не дублирует позицию. */
const catalogItemToLine = (item: PosCatalogItem, index: number): PosReceiptLine => ({
  id: `${item.id}-${index}`,
  name: item.name,
  brand: item.brand,
  sku: "TSH-153731",
  barcode: "4600000000130",
  colors: item.colors,
  selectedColorId: item.colors[0]?.id ?? "",
  sizes: item.sizes,
  selectedSizeId: item.sizes[0]?.id ?? "",
  quantity: 1,
  price: item.price,
});

/**
 * Модуль «Касса» (POS) — вёрстка по макету Monogram, node 136:2103.
 *
 * Данные пока моковые (`mocks.ts`): формы типов совпадают с тем, что отдаёт
 * `/pos/` (`src/api/retail.ts`), поэтому подключение бэка не потребует правки
 * разметки. Все состояния макета достижимы кликом: категория раскрывает полосу
 * товаров, «Сменить клиента» — поиск и регистрацию, кнопки «Применить» —
 * применённые скидки, шапка — диалоги отложенных чеков.
 */
export default function PosPage() {
  const theme = useTheme();
  const c = posColors(theme);

  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState<string | null>(null);
  const [lines, setLines] = React.useState<PosReceiptLine[]>(POS_RECEIPT_LINES);
  const [client, setClient] = React.useState<PosClient | null>(POS_CLIENT);
  const [clientQuery, setClientQuery] = React.useState("");
  const [clientResults, setClientResults] = React.useState<PosClientSearchResult[] | null>(null);
  const [payment, setPayment] = React.useState<PosPaymentState>(EMPTY_PAYMENT);
  const [promoInput, setPromoInput] = React.useState("");
  const [promoError, setPromoError] = React.useState<string | null>(null);
  const [certificateInput, setCertificateInput] = React.useState("");
  const [heldReceipts, setHeldReceipts] = React.useState<PosHeldReceipt[]>(POS_HELD_RECEIPTS);
  const [holdOpen, setHoldOpen] = React.useState(false);
  const [heldListOpen, setHeldListOpen] = React.useState(false);
  const [recommendationHidden, setRecommendationHidden] = React.useState(false);

  const totals: PosTotals = React.useMemo(() => {
    const subtotal = lines.filter((line) => !line.removed).reduce((sum, line) => sum + line.price * line.quantity, 0);
    const extra = POS_DISCOUNTS.find((item) => item.id === payment.extraDiscountId);
    const percent = (payment.clientDiscountApplied && client ? client.discountPercent : 0) + (extra?.percent ?? 0);
    const discount = Math.round((subtotal * percent) / 100);
    const bonuses = payment.bonusesApplied && client ? client.bonuses : 0;
    const cashback = payment.cashbackApplied && client ? client.cashback : 0;
    const certificate = payment.certificate ?? 0;
    const total = Math.max(subtotal - discount - bonuses - cashback - certificate, 0);
    return { subtotal, discount, bonuses, cashback, certificate, total };
  }, [lines, payment, client]);

  const patchLine = React.useCallback((lineId: string, patch: Partial<PosReceiptLine>) => {
    setLines((prev) => prev.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
  }, []);

  const handleNewReceipt = React.useCallback(() => {
    setLines(POS_RECEIPT_LINES);
    setPayment(EMPTY_PAYMENT);
    setPromoInput("");
    setPromoError(null);
    setCertificateInput("");
    setRecommendationHidden(false);
  }, []);

  const handleSearchClient = React.useCallback(() => {
    const query = clientQuery.trim();
    if (!query) {
      setClientResults(null);
      return;
    }
    // Цифры без совпадений — сценарий регистрации нового клиента: касса
    // предлагает завести карту на набранный номер.
    const matches = POS_CLIENT_SEARCH_RESULTS.filter((item) =>
      item.name.toLowerCase().includes(query.toLowerCase()) || item.phone.replace(/\D/g, "").includes(query.replace(/\D/g, "")),
    );
    setClientResults(matches);
  }, [clientQuery]);

  const handleApplyPromo = React.useCallback(() => {
    if (payment.promoCode) {
      setPayment((prev) => ({ ...prev, promoCode: null }));
      return;
    }
    const code = promoInput.trim().toUpperCase();
    if (code === POS_VALID_PROMO) {
      setPayment((prev) => ({ ...prev, promoCode: code }));
      setPromoError(null);
      setPromoInput("");
      return;
    }
    setPromoError("Промокод не найден или истек срок");
  }, [payment.promoCode, promoInput]);

  const handleApplyCertificate = React.useCallback(() => {
    if (payment.certificate) {
      setPayment((prev) => ({ ...prev, certificate: null }));
      return;
    }
    const amount = Number(certificateInput.replace(/\D/g, "")) || POS_CERTIFICATE_AMOUNT;
    setPayment((prev) => ({ ...prev, certificate: amount }));
    setCertificateInput("");
  }, [payment.certificate, certificateInput]);

  const handleHoldReceipt = React.useCallback(
    (comment: string) => {
      setHeldReceipts((prev) => [
        {
          id: `held-${Date.now()}`,
          createdAt: new Date().toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
          number: `Чек №${POS_RECEIPT_NUMBER}`,
          clientName: client?.name ?? "Клиент не указан",
          comment,
          total: totals.total,
        },
        ...prev,
      ]);
      setHoldOpen(false);
      handleNewReceipt();
    },
    [client, totals.total, handleNewReceipt],
  );

  // F2 — поиск товара, F5 — приём оплаты: подписи этих клавиш стоят прямо в
  // макете, и на кассе работают быстрее мыши.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        const input = document.querySelector<HTMLInputElement>('input[placeholder^="Поиск по названию"]');
        input?.focus();
      }
      if (event.key === "F5") {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", bgcolor: c.page, color: c.text, overflow: "hidden" }}>
      <PosTopBar
        search={search}
        onSearchChange={setSearch}
        cashierDesk={POS_CASHIER.desk}
        cashierName={POS_CASHIER.name}
        onNewReceipt={handleNewReceipt}
        onOpenHeldReceipts={() => setHeldListOpen(true)}
      />

      <PosCategoryBar categories={POS_CATEGORIES} active={category} onSelect={setCategory} />

      {category ? (
        <PosProductCards
          items={POS_CATALOG}
          onAdd={(item) => setLines((prev) => [...prev, catalogItemToLine(item, prev.length)])}
        />
      ) : null}

      <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            px: `${POS_LAYOUT.contentPaddingX}px`,
            pb: "16px",
          }}
        >
          <PosReceipt
            number={POS_RECEIPT_NUMBER}
            lines={lines}
            onChangeColor={(lineId, colorId) => patchLine(lineId, { selectedColorId: colorId })}
            onChangeSize={(lineId, sizeId) => patchLine(lineId, { selectedSizeId: sizeId })}
            onChangeQuantity={(lineId, quantity) => patchLine(lineId, { quantity })}
            onRemoveLine={(lineId) => patchLine(lineId, { removed: true })}
            onRestoreLine={(lineId) => patchLine(lineId, { removed: false })}
            onHold={() => setHoldOpen(true)}
            onCancel={handleNewReceipt}
          />

          {client && !recommendationHidden ? (
            <PosRecommendationBar
              item={POS_RECOMMENDATION}
              onAccept={() => {
                setLines((prev) => [
                  ...prev,
                  catalogItemToLine({ ...POS_RECOMMENDATION, id: `${POS_RECOMMENDATION.id}` }, prev.length),
                ]);
                setRecommendationHidden(true);
              }}
              onDismiss={() => setRecommendationHidden(true)}
            />
          ) : null}

          <PosClientFooter
            client={client}
            query={clientQuery}
            onQueryChange={setClientQuery}
            onSearch={handleSearchClient}
            results={clientResults}
            recent={POS_CLIENT_SEARCH_RESULTS}
            onSelectClient={(selected) => {
              setClient(selected);
              setClientResults(null);
              setClientQuery("");
            }}
            onRegister={(name, phone) => {
              setClient({ ...POS_CLIENT, id: `client-${Date.now()}`, name: name || "Новый клиент", phone, tier: "Старт", discountPercent: 0, bonuses: 0, cashback: 0 });
              setClientResults(null);
              setClientQuery("");
            }}
            onChangeClient={() => {
              setClient(null);
              setPayment(EMPTY_PAYMENT);
              setClientResults(null);
            }}
            onOpenHistory={() => undefined}
          />
        </Box>

        <PosPaymentPanel
          hasClient={Boolean(client)}
          clientDiscountPercent={client?.discountPercent ?? 0}
          bonusesAvailable={client?.bonuses ?? 0}
          cashbackAvailable={client?.cashback ?? 0}
          discounts={POS_DISCOUNTS}
          state={payment}
          totals={totals}
          promoInput={promoInput}
          onPromoInputChange={(value) => {
            setPromoInput(value);
            setPromoError(null);
          }}
          promoError={promoError}
          onApplyPromo={handleApplyPromo}
          certificateInput={certificateInput}
          onCertificateInputChange={setCertificateInput}
          onApplyCertificate={handleApplyCertificate}
          onToggleClientDiscount={() => setPayment((prev) => ({ ...prev, clientDiscountApplied: !prev.clientDiscountApplied }))}
          onSelectExtraDiscount={(id) => setPayment((prev) => ({ ...prev, extraDiscountId: id }))}
          onToggleBonuses={() => setPayment((prev) => ({ ...prev, bonusesApplied: !prev.bonusesApplied }))}
          onToggleCashback={() => setPayment((prev) => ({ ...prev, cashbackApplied: !prev.cashbackApplied }))}
          onCheckout={() => undefined}
        />
      </Box>

      <PosHoldReceiptDialog open={holdOpen} onClose={() => setHoldOpen(false)} onConfirm={handleHoldReceipt} />

      <PosHeldReceiptsDialog
        open={heldListOpen}
        receipts={heldReceipts}
        onClose={() => setHeldListOpen(false)}
        onRestore={(receipt) => {
          setHeldReceipts((prev) => prev.filter((item) => item.id !== receipt.id));
          setHeldListOpen(false);
        }}
        onDelete={(receipt) => setHeldReceipts((prev) => prev.filter((item) => item.id !== receipt.id))}
      />
    </Box>
  );
}

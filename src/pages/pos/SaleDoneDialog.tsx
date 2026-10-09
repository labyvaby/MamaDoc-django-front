import React from "react";
import { Box, Button, Chip, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import dayjs from "dayjs";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import HandshakeOutlined from "@mui/icons-material/HandshakeOutlined";
import PauseCircleRounded from "@mui/icons-material/PauseCircleRounded";
import PrintRounded from "@mui/icons-material/PrintRounded";
import QrCode2Rounded from "@mui/icons-material/QrCode2Rounded";

import type { PosSavedReceipt } from "../../api/pos";
import type { GiftCertificateDetail } from "../../api/promotions";
import { certificateExpiryLabel } from "../certificates/certificateMeta";
import type { PosSaleResult } from "./certificateCart";
import { showMinus } from "./format";
import { GiftCard } from "./GiftCard";
import { paymentLabelWithTerminal } from "./historyMeta";
import { posColors } from "./layout";
import { saleDebtSummary } from "./saleDebt";

const money = (value: string | number) => `${Number(value).toLocaleString("ru-RU")} сом`;
/** «Оплата: наличными» на плашке — как кассир говорит это вслух. */
const CHIP_METHOD: Record<string, string> = {
  cash: "наличными",
  card: "картой",
  cashless: "по QR",
  certificate: "сертификатом",
  bonus: "бонусами",
  debt: "в долг",
};
type Terminals = ReadonlyArray<{ id: number; name: string }>;
type DonePayment = { method: string; amount?: string; cashlessMethodId?: number | null; cashlessMethodName?: string | null };

/**
 * «Оплата прошла» — товарный чек и проданные сертификаты, готовые к печати.
 * Печатная форма — `#pos-print` (стили печати задаёт страница кассы): чек на
 * 80 мм, а за ним каждый сертификат отдельным талоном.
 */
export function SaleDoneDialog({
  sale,
  organizationName,
  organizationLogoUrl,
  branchName,
  cashier,
  canPrint,
  cashlessMethods = [],
  onClose,
}: {
  sale: PosSaleResult | null;
  organizationName: string;
  /** Логотип организации — печать на подарочной карте. */
  organizationLogoUrl?: string | null;
  branchName: string;
  cashier: string;
  canPrint: boolean;
  /** Терминалы кассы: «QR · POS МБанк» вместо просто «QR». */
  cashlessMethods?: Terminals;
  onClose: () => void;
}) {
  const theme = useTheme();
  const c = posColors(theme);
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const receipt = sale?.receipt ?? null;
  const certificates = sale?.certificates ?? [];
  const certificatesTotal = certificates.reduce((total, item) => total + Number(item.nominal), 0);
  const total = Number(receipt?.totalAmount ?? 0) + certificatesTotal;
  const createdAt = receipt?.createdAt ?? certificates[0]?.soldAt ?? certificates[0]?.createdAt ?? new Date().toISOString();
  // Чек только из сертификатов: способы оплаты берём из денег самих сертификатов.
  const payments: DonePayment[] = receipt?.payments?.length
    ? receipt.payments
    : certificates.flatMap((item) => item.payments ?? []).filter((payment) => payment.operation !== "refund");
  // Из истории сюда открывают и отложенный чек: денег по нему ещё нет.
  const held = receipt?.status === "held";
  const methods = [...new Set(payments.map((payment) => paymentLabelWithTerminal(payment, cashlessMethods)))];
  const kinds = [...new Set(payments.map((payment) => payment.method))];
  const chip = kinds.length > 1 ? "Оплата частями" : kinds.length ? `Оплата ${CHIP_METHOD[kinds[0]] ?? methods[0]}` : "";
  // Частями — ниже отдельный блок: каждая часть своей строкой с терминалом и суммой.
  const parts = payments.length > 1 ? payments : [];
  const title = receipt ? `Чек №${receipt.number.slice(0, 8)}` : certificates.length === 1 ? `Сертификат ${certificates[0].code}` : `Сертификатов: ${certificates.length}`;
  // Продано в долг: часть (или весь чек) не оплачена — зелёное «Оплата
  // прошла» здесь врало бы. Сумма долга — из ответа checkout, а у чека,
  // открытого из истории, — из его строки оплаты «в долг».
  const credit = held ? null : saleDebtSummary(receipt, sale?.debt ?? null);
  const debt = sale?.debt ?? null;
  const facts = [
    { label: "Позиций", value: `${(receipt?.lines.length ?? 0) + certificates.length} шт.` },
    held
      ? { label: "Оплата", value: "Не принята" }
      : { label: "Способ оплаты", value: parts.length ? "Частями" : methods.length ? methods.join(", ") : "—" },
    ...(credit
      ? [{ label: "Вернуть до", value: credit.dueDate ? dayjs(credit.dueDate).format("DD.MM.YYYY") : credit.dueDate === null ? "Без срока" : "В карточке клиента" }]
      : []),
    { label: "Клиент", value: receipt?.clientName || (receipt?.clientId ? `#${receipt.clientId}` : certificates[0]?.buyerName || "Без клиента") },
    { label: "Кассир", value: cashier },
  ];

  return (
    <Dialog
      open={sale !== null}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      fullScreen={fullScreen}
      PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 3, bgcolor: c.page, color: c.text, backgroundImage: "none", overflow: "hidden" } }}
    >
      {sale && (
        <>
          <DialogTitle sx={{ px: { xs: 2, sm: 3 }, py: 1.5, borderBottom: `1px solid ${c.hairline}`, bgcolor: c.card }}>
            <Stack direction="row" alignItems="center" gap={1}>
              <Typography fontWeight={800}>{credit ? "Продажа в долг" : "Оплата"}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {receipt ? `${receipt.lines.length} товаров` : ""}
                {receipt && certificates.length ? " · " : ""}
                {certificates.length ? `${certificates.length} серт.` : ""} · {title}
              </Typography>
              <IconButton onClick={onClose} aria-label="Закрыть" sx={{ ml: "auto", width: 44, height: 44, color: "text.secondary" }}>
                <CloseRounded fontSize="small" />
              </IconButton>
            </Stack>
          </DialogTitle>
          <DialogContent sx={{ p: { xs: 1.5, sm: 3 } }}>
            <Stack direction={{ xs: "column", md: "row" }} gap={{ xs: 2, md: 3 }} sx={{ pt: { xs: 1.5, sm: 3 } }}>
              {/* На телефоне сначала итог и кнопки, печатная форма — ниже. */}
              <Box sx={{ order: { xs: 2, md: 0 }, width: { xs: "100%", md: 320 }, flexShrink: 0 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography sx={{ fontSize: 10, letterSpacing: ".1em", fontWeight: 800, color: c.textDim }}>ПЕЧАТНАЯ ФОРМА</Typography>
                  <Typography sx={{ fontSize: 10, color: c.textDim }}>прокрутите</Typography>
                </Stack>
                <Box
                  id="pos-print"
                  sx={{ bgcolor: "#fff", color: "#141722", p: { xs: 2, sm: 2.5 }, borderRadius: 1.5, boxShadow: "0 18px 50px rgba(0,0,0,.35)", minHeight: { md: 470 }, maxHeight: { md: 560 }, overflowY: { md: "auto" } }}
                >
                  {receipt ? <ReceiptPrint receipt={receipt} organizationName={organizationName} branchName={branchName} cashlessMethods={cashlessMethods} onCredit={Boolean(credit)} dueDate={credit?.dueDate} /> : null}
                  {certificates.map((certificate, index) => (
                    <CertificatePrint
                      key={certificate.id ?? certificate.code}
                      certificate={certificate}
                      organizationName={organizationName}
                      branchName={branchName}
                      separated={Boolean(receipt) || index > 0}
                    />
                  ))}
                </Box>
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {credit ? (
                  <CreditHeader
                    credit={credit}
                    total={Number(receipt?.totalAmount ?? 0)}
                    title={title}
                    createdAt={createdAt}
                    clientName={receipt?.clientName ?? null}
                    comment={debt?.comment ?? ""}
                  />
                ) : (
                <Box sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2.5, bgcolor: held ? alpha(theme.palette.warning.main, 0.1) : theme.palette.success.lighter, border: `1px solid ${alpha(held ? theme.palette.warning.main : theme.palette.success.main, 0.35)}` }}>
                  <Stack direction="row" gap={1.25} alignItems="flex-start">
                    {held ? <PauseCircleRounded sx={{ color: theme.palette.warning.main, fontSize: 28 }} /> : <CheckCircleRounded sx={{ color: c.positive, fontSize: 28 }} />}
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Stack direction="row" justifyContent="space-between" gap={1} flexWrap="wrap">
                        <Box>
                          <Typography fontWeight={800} color={held ? theme.palette.warning.dark : c.positive}>
                            {held ? "Чек отложен — оплата не принята" : receipt ? "Оплата прошла успешно" : certificates.length > 1 ? "Сертификаты проданы" : "Сертификат продан"}
                          </Typography>
                          <Typography variant="caption" color={c.textDim} sx={{ overflowWrap: "anywhere" }}>
                            {title} · {new Date(createdAt).toLocaleString("ru-RU")}
                          </Typography>
                        </Box>
                        {chip && !held ? (
                          <Chip size="small" label={chip} sx={{ bgcolor: alpha(theme.palette.success.main, 0.15), color: c.positive, fontSize: 10, fontWeight: 700 }} />
                        ) : null}
                      </Stack>
                      <Typography variant="h4" fontWeight={900} sx={{ mt: 1, color: c.text }}>
                        {money(total)}
                      </Typography>
                      {receipt && certificates.length ? (
                        <Typography variant="caption" color={c.textDim}>
                          товары {money(receipt.totalAmount)} + сертификаты {money(certificatesTotal)}
                        </Typography>
                      ) : null}
                    </Box>
                  </Stack>
                </Box>
                )}

                {certificates.length > 0 && (
                  <Stack gap={1.5} sx={{ mt: 1.5 }}>
                    {certificates.map((certificate) => (
                      <Box key={`card-${certificate.id ?? certificate.code}`} sx={{ maxWidth: 420 }}>
                        <GiftCard
                          organizationName={organizationName}
                          logoUrl={organizationLogoUrl}
                          amountCents={Math.round(Number(certificate.nominal) * 100)}
                          holderName={certificate.buyerName}
                          expiryLabel={certificateExpiryLabel(certificate.expiresAt)}
                          code={certificate.code}
                        />
                      </Box>
                    ))}
                  </Stack>
                )}

                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, gap: 1, mt: 1.5 }}>
                  {facts.map((item) => (
                    <Box key={item.label} sx={{ p: 1.25, borderRadius: 1.5, bgcolor: c.card, border: `1px solid ${c.hairline}`, minWidth: 0 }}>
                      <Typography variant="caption" color={c.textDim} noWrap component="div">{item.label}</Typography>
                      {/* «QR · POS МБанк» в половине телефона — переносом, а не «QR · PO…». */}
                      <Typography fontWeight={700} sx={{ lineHeight: 1.3, overflowWrap: "anywhere" }}>{item.value}</Typography>
                    </Box>
                  ))}
                </Box>
                {parts.length > 0 && !held ? (
                  <Box sx={{ mt: 1, p: 1.25, borderRadius: 1.5, bgcolor: c.card, border: `1px solid ${c.hairline}` }}>
                    <Typography variant="caption" color={c.textDim} component="div">{credit ? "Как оформлен чек" : "Из чего сложилась оплата"}</Typography>
                    <Stack component="ul" gap={0.5} sx={{ m: 0, mt: 0.5, p: 0, listStyle: "none" }}>
                      {parts.map((payment, index) => (
                        <Stack component="li" key={`${payment.method}-${index}`} direction="row" justifyContent="space-between" alignItems="baseline" gap={1.5}>
                          <Typography fontWeight={700} sx={{ minWidth: 0, lineHeight: 1.3, overflowWrap: "anywhere" }}>{paymentLabelWithTerminal(payment, cashlessMethods)}</Typography>
                          <Typography fontWeight={800} sx={{ flexShrink: 0, whiteSpace: "nowrap" }}>{money(payment.amount ?? 0)}</Typography>
                        </Stack>
                      ))}
                    </Stack>
                  </Box>
                ) : null}
                <Button fullWidth variant="contained" onClick={onClose} sx={{ mt: 1.5, minHeight: 48, borderRadius: 2, fontWeight: 800 }}>
                  Новый чек
                  <Box component="span" sx={{ ml: 1, opacity: 0.65, fontSize: 11, display: { xs: "none", md: "inline" } }}>Enter</Box>
                </Button>
                <Stack direction={{ xs: "column", md: "row" }} gap={1} mt={1}>
                  <Button fullWidth startIcon={<DownloadRounded />} sx={{ minHeight: 44, borderRadius: 2, bgcolor: c.card, color: c.accentText, border: `1px solid ${c.hairline}` }} onClick={() => window.print()}>
                    {receipt ? "Скачать чек" : "Скачать сертификат"}
                  </Button>
                  {canPrint && (
                    <Button fullWidth startIcon={<PrintRounded />} sx={{ minHeight: 44, borderRadius: 2, bgcolor: c.card, color: c.accentText, border: `1px solid ${c.hairline}` }} onClick={() => window.print()}>
                      {certificates.length ? (receipt ? "Печать чека и сертификата" : "Печать сертификата") : "Повторная печать"}
                    </Button>
                  )}
                </Stack>
              </Box>
            </Stack>
          </DialogContent>
        </>
      )}
    </Dialog>
  );
}

function ReceiptPrint({ receipt, organizationName, branchName, cashlessMethods, onCredit = false, dueDate }: {
  receipt: PosSavedReceipt; organizationName: string; branchName: string; cashlessMethods: Terminals;
  /** Чек продан в долг (целиком или частью). */
  onCredit?: boolean;
  /** Срок возврата: null — без срока; undefined — неизвестен (чек из истории). */
  dueDate?: string | null;
}) {
  return (
    <>
      <Stack alignItems="center" gap={0.25} mb={2}>
        <Typography fontWeight={900} letterSpacing=".12em">{organizationName.toUpperCase()}</Typography>
        <Typography variant="caption">{branchName}</Typography>
        <Typography variant="caption" color="#6e7280">Товарный чек · не фискальный</Typography>
      </Stack>
      <Stack direction="row" justifyContent="space-between" mb={1}>
        <Typography variant="caption">ЧЕК №{receipt.number.slice(0, 8)}</Typography>
        <Typography variant="caption">{new Date(receipt.createdAt).toLocaleDateString("ru-RU")}</Typography>
      </Stack>
      <Box sx={{ borderTop: "1px dashed #adb0ba", borderBottom: "1px dashed #adb0ba", py: 1 }}>
        {receipt.lines.map((line) => (
          <Stack key={line.id} direction="row" justifyContent="space-between" gap={1} py={0.55}>
            <Box sx={{ minWidth: 0 }}>
              <Typography fontSize={12} fontWeight={600} noWrap>{line.productName}</Typography>
              <Typography fontSize={10} color="#6e7280">
                {line.quantity} × {Number(line.unitPrice).toLocaleString("ru-RU")} сом
                {Number(line.discountAmount ?? 0) > 0 ? ` · скидка −${Number(line.discountAmount).toLocaleString("ru-RU")} сом` : ""}
              </Typography>
            </Box>
            <Typography fontSize={12} fontWeight={700} whiteSpace="nowrap">{money(line.total)}</Typography>
          </Stack>
        ))}
      </Box>
      <Stack gap={0.5} mt={1.5}>
        <Stack direction="row" justifyContent="space-between"><Typography variant="caption">Подытог</Typography><Typography variant="caption">{money(receipt.subtotal)}</Typography></Stack>
        {/* Без скидки строки нет: «− 0 сом» на чеке читается как ошибка. */}
        {showMinus(Number(receipt.discountTotal), true) ? (
          <Stack direction="row" justifyContent="space-between"><Typography variant="caption">Скидка</Typography><Typography variant="caption">− {money(receipt.discountTotal)}</Typography></Stack>
        ) : null}
        <Stack direction="row" justifyContent="space-between" mt={0.5}><Typography fontWeight={800}>ИТОГО</Typography><Typography fontWeight={900}>{money(receipt.totalAmount)}</Typography></Stack>
      </Stack>
      {receipt.payments.length > 0 ? (
        <Stack gap={0.25} mt={1} pt={1} sx={{ borderTop: "1px dashed #adb0ba" }}>
          {receipt.payments.map((payment) => (
            <Stack key={payment.id} direction="row" justifyContent="space-between" gap={1}>
              <Typography variant="caption">{paymentLabelWithTerminal(payment, cashlessMethods)}</Typography>
              <Typography variant="caption" whiteSpace="nowrap">{money(payment.amount)}</Typography>
            </Stack>
          ))}
          {onCredit ? (
            <Box sx={{ mt: 0.75, p: 0.75, border: "1px solid #141722", borderRadius: 0.5, textAlign: "center" }}>
              <Typography fontSize={11} fontWeight={800}>ПРОДАНО В ДОЛГ</Typography>
              <Typography fontSize={10}>{dueDate ? `Вернуть до ${dayjs(dueDate).format("DD.MM.YYYY")}` : dueDate === null ? "Без срока возврата" : "Срок — в карточке клиента"}</Typography>
            </Box>
          ) : null}
        </Stack>
      ) : null}
      <Stack alignItems="center" mt={2}>
        <QrCode2Rounded sx={{ fontSize: 76, color: "#191c26" }} />
        <Typography fontSize={9} color="#777">Проверить чек</Typography>
      </Stack>
    </>
  );
}

/** Шапка «Продано в долг»: сколько не оплачено, сколько внесли сейчас, срок. */
function CreditHeader({ credit, total, title, createdAt, clientName, comment }: {
  credit: NonNullable<ReturnType<typeof saleDebtSummary>>;
  total: number;
  title: string;
  createdAt: string;
  clientName: string | null;
  comment: string;
}) {
  const theme = useTheme();
  const c = posColors(theme);
  const tone = theme.palette.warning;
  const share = total > 0 ? Math.min(100, (credit.paidNow / total) * 100) : 0;
  return (
    <Box sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2.5, bgcolor: alpha(tone.main, 0.1), border: `1px solid ${alpha(tone.main, 0.45)}` }}>
      <Stack direction="row" gap={1.25} alignItems="flex-start">
        <HandshakeOutlined sx={{ color: tone.main, fontSize: 28 }} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" justifyContent="space-between" gap={1} flexWrap="wrap">
            <Box sx={{ minWidth: 0 }}>
              <Typography fontWeight={800} sx={{ color: theme.palette.mode === "dark" ? tone.light : tone.dark }}>
                {credit.paidNow > 0 ? "Продано частично в долг" : "Продано в долг — оплата не получена"}
              </Typography>
              <Typography variant="caption" color={c.textDim}>
                {title} · {new Date(createdAt).toLocaleString("ru-RU")}
              </Typography>
            </Box>
            <Chip size="small" label={credit.paidNow > 0 ? "Часть в долг" : "Весь чек в долг"} sx={{ bgcolor: alpha(tone.main, 0.18), color: theme.palette.mode === "dark" ? tone.light : tone.dark, fontSize: 10, fontWeight: 800 }} />
          </Stack>
          <Typography variant="caption" color={c.textDim} component="div" sx={{ mt: 1.25 }}>
            {clientName ? `${clientName} должен` : "Покупатель должен"}
          </Typography>
          <Typography variant="h4" fontWeight={900} sx={{ color: c.danger, lineHeight: 1.15 }}>
            {money(credit.debt)}
          </Typography>
          <Box sx={{ mt: 1.25, height: 8, borderRadius: 4, overflow: "hidden", bgcolor: alpha(c.danger, 0.25) }}>
            <Box sx={{ width: `${share}%`, height: "100%", bgcolor: c.positive }} />
          </Box>
          <Stack direction="row" justifyContent="space-between" gap={1} flexWrap="wrap" sx={{ mt: 0.75 }}>
            <Typography variant="caption" color={c.textDim}>
              Получено сейчас <Box component="b" sx={{ color: c.text }}>{money(credit.paidNow)}</Box> из {money(total)}
            </Typography>
            <Typography variant="caption" fontWeight={700} sx={{ color: c.text }}>
              {credit.dueDate ? `Вернуть до ${dayjs(credit.dueDate).format("DD.MM.YYYY")}` : credit.dueDate === null ? "Без срока возврата" : "Срок — в карточке клиента"}
            </Typography>
          </Stack>
          {comment ? <Typography variant="caption" component="div" sx={{ mt: 0.5, color: c.textDim, overflowWrap: "anywhere" }}>«{comment}»</Typography> : null}
          <Typography variant="caption" component="div" sx={{ mt: 1, color: c.textDim }}>
            Долг записан в карточку клиента — там его гасят частями.
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}

/** Талон сертификата для термопринтера: организация, номер, сумма, срок, покупатель. */
function CertificatePrint({
  certificate,
  organizationName,
  branchName,
  separated,
}: {
  certificate: GiftCertificateDetail;
  organizationName: string;
  branchName: string;
  separated: boolean;
}) {
  const soldAt = certificate.soldAt ?? certificate.createdAt;
  return (
    <Box sx={{ mt: separated ? 2.5 : 0, pt: separated ? 2.5 : 0, borderTop: separated ? "2px dashed #adb0ba" : "none", breakBefore: separated ? "page" : "auto" }}>
      <Stack alignItems="center" gap={0.25} mb={1.5}>
        <Typography fontWeight={900} letterSpacing=".16em" sx={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>{organizationName.toUpperCase()}</Typography>
        <Typography variant="caption">{branchName}</Typography>
      </Stack>
      <Box sx={{ border: "1.5px solid #141722", borderRadius: 1, p: 1.5, textAlign: "center" }}>
        <Typography sx={{ fontSize: 10, fontWeight: 800, letterSpacing: ".22em" }}>ПОДАРОЧНЫЙ СЕРТИФИКАТ</Typography>
        <Typography sx={{ mt: 1, fontSize: 28, fontWeight: 900, lineHeight: 1.1 }}>{money(certificate.nominal)}</Typography>
        {/* Номер с карты бывает длинным — переносим, а не режем край талона. */}
        <Typography
          sx={{
            mt: 1,
            fontFamily: "monospace",
            fontSize: certificate.code.length > 16 ? 14 : 18,
            fontWeight: 800,
            letterSpacing: certificate.code.length > 16 ? ".06em" : ".18em",
            overflowWrap: "anywhere",
            wordBreak: "break-all",
          }}
        >
          {certificate.code}
        </Typography>
      </Box>
      <Stack gap={0.4} mt={1.25}>
        <Stack direction="row" justifyContent="space-between" gap={1}><Typography variant="caption">Действует</Typography><Typography variant="caption" fontWeight={700}>{certificateExpiryLabel(certificate.expiresAt)}</Typography></Stack>
        <Stack direction="row" justifyContent="space-between" gap={1}><Typography variant="caption">Покупатель</Typography><Typography variant="caption" fontWeight={700} textAlign="right">{certificate.buyerName || "—"}</Typography></Stack>
        {soldAt ? <Stack direction="row" justifyContent="space-between" gap={1}><Typography variant="caption">Продан</Typography><Typography variant="caption">{new Date(soldAt).toLocaleDateString("ru-RU")}</Typography></Stack> : null}
        {certificate.comment ? <Typography variant="caption" color="#6e7280">{certificate.comment}</Typography> : null}
      </Stack>
      <Typography sx={{ mt: 1.25, fontSize: 9, lineHeight: 1.35, color: "#6e7280", textAlign: "center" }}>
        Назовите номер сертификата на кассе при оплате покупки.
      </Typography>
    </Box>
  );
}

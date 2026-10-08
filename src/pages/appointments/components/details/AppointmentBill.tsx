import React from "react";
import { Avatar, Box, Chip, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import TaskAltOutlined from "@mui/icons-material/TaskAltOutlined";
import EditNoteOutlined from "@mui/icons-material/EditNoteOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";

import {
  consumptionLineTotal,
  type AppointmentConsumption,
} from "../../../../api/appointments";
import {
  discountPercentOf,
  formatAmountPlain as plainAmount,
  formatQuantity,
} from "../../../../utility/format";
import { subtleBg, subtleBorder } from "../../../../theme/uiHelpers";
import { useT } from "../../../../i18n/VerticalProvider";
import type { PaymentPhase } from "../../../../api/payments";
import {
  buildEmployeeAccentMap,
  employeeInitials,
} from "../../../../components/appointments/employeeAccent";

/** Услуга внутри группы исполнителя (уже посчитанная сумма строки). */
export interface ServiceGroupLine {
  /** id строки услуги приёма — ключ списка. */
  lineId: number;
  /** id услуги каталога; null — услуга не сохранилась/удалена. */
  serviceId: number | null;
  name: string;
  imageUrl?: string | null;
  quantity: number;
  durationMinutes?: number;
  /** Отформатированная сумма строки; null — не показывать. */
  amount: string | null;
  /**
   * Состояние заключения по строке (бэк шлёт его в каждой строке услуги).
   * Показываем значком: врач видит, по какой услуге он уже отписался.
   */
  conclusionState?: "not_required" | "not_created" | "draft" | "completed";
  /** Документов у строки и завершённых из них — для «1/2». */
  conclusionsTotal?: number;
  conclusionsCompleted?: number;
  /** Расходники строки — чипами под услугой. */
  consumptions?: AppointmentConsumption[];
  /** Дополнительное действие строки, например однократная правка цены. */
  action?: React.ReactNode;
}

/** Исполнитель и его услуги в рамках одного приёма. */
export interface ServiceEmployeeGroup {
  employeeId: number | null;
  employeeName: string;
  employeePhotoUrl: string | null;
  lines: ServiceGroupLine[];
}

/** Деньги приёма для низа чека. Все суммы — числа, уже без валюты. */
export interface BillPayment {
  /** Сумма до скидки. */
  baseTotal: number;
  discountAmount: number;
  /** К оплате с учётом скидки. */
  finalTotal: number;
  debt: number;
  /** Внесено всего (по журналу), включая способы, скрытые от зрителя. */
  paidTotal: number;
  /** Внесено за вычетом возвратов. */
  netPaid: number;
  refunded: number;
  cash: number;
  card: number;
  cardMethodName?: string | null;
  balance: number;
  bonuses: number;
  insurance: number;
  insurerName?: string | null;
  isCancelled: boolean;
  /**
   * Фаза счёта (`utility/paymentPhase`): до начала приёма остаток — «к
   * оплате», после — долг (правило заказчика 05.10.2026). Нет фазы — итог
   * говорит нейтрально «Осталось оплатить».
   */
  phase?: PaymentPhase | null;
}

/**
 * Значок состояния заключения рядом с названием услуги. «Не требуется» и
 * «не создано» не помечаем: первое — шум, второе видно по отсутствию значка.
 */
function conclusionMark(
  line: ServiceGroupLine,
  t: (key: string, options?: Record<string, unknown>) => string,
): React.ReactNode {
  const state = line.conclusionState;
  const total = line.conclusionsTotal ?? 0;
  if (total > 1) {
    // Бэк сводит state по всем документам: «completed» = готовы все. Без
    // conclusionsCompleted (на 27.09.2026 бэк его не отдаёт) прогресс
    // неизвестен — показываем число документов, а не выдуманное «0/2».
    const done =
      line.conclusionsCompleted != null
        ? Math.min(line.conclusionsCompleted, total)
        : state === "completed"
          ? total
          : null;
    const allDone = done === total;
    return (
      <Tooltip
        title={
          done != null
            ? t("serviceLine.conclusionsProgress", { done, count: total })
            : t("serviceLine.conclusionsCount", { count: total })
        }
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.25}
          sx={{ flexShrink: 0, color: allDone ? "success.main" : "warning.main" }}
        >
          {allDone ? (
            <TaskAltOutlined sx={{ fontSize: 15 }} />
          ) : (
            <EditNoteOutlined sx={{ fontSize: 16 }} />
          )}
          <Typography component="span" variant="caption" fontWeight={600} lineHeight={1}>
            {done != null ? `${done}/${total}` : total}
          </Typography>
        </Stack>
      </Tooltip>
    );
  }
  if (state === "completed") {
    return (
      <Tooltip title={t("serviceLine.conclusionReady")}>
        <TaskAltOutlined sx={{ fontSize: 15, color: "success.main", flexShrink: 0 }} />
      </Tooltip>
    );
  }
  if (state === "draft") {
    return (
      <Tooltip title={t("serviceLine.conclusionDraft")}>
        <EditNoteOutlined sx={{ fontSize: 16, color: "warning.main", flexShrink: 0 }} />
      </Tooltip>
    );
  }
  return null;
}

/** Миниатюра строки: 36px, общая для услуг и товаров чека. */
export const BILL_THUMB = 36;
/** Отступ под миниатюру — чтобы чипы и подписи вставали под названием. */
export const BILL_INDENT = `${BILL_THUMB + 12}px`;

/**
 * Расходник чипом: название, количество и доплата, если платный. Остатки
 * склада и прочие подробности — в подсказке (на телефоне — по тапу), а
 * нехватку выдаёт янтарная точка: раньше она занимала отдельный жёлтый блок и
 * дублировалась в карточке каждого расходника.
 */
const ConsumptionChip: React.FC<{ c: AppointmentConsumption; writtenOff: boolean }> = ({
  c,
  writtenOff,
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();
  const extra = consumptionLineTotal(c);
  const billable = Boolean(c.billable);
  const unit = c.unit ? ` ${c.unit}` : "";

  // Уже списанный расходник: остаток показан после списания, нехватки впереди нет.
  const shortage = c.shortage && !writtenOff;
  const stockLine =
    c.stockOnHand === null
      ? t("consumptions.stockUnknown")
      : writtenOff && c.autoWriteOff
        ? `${t("consumptions.writtenOff")} · ${t("consumptions.stock", {
            stock: formatQuantity(c.stockOnHand),
          })}`
      : c.autoWriteOff && c.resultingStock !== null
        ? `${t("consumptions.stock", { stock: formatQuantity(c.stockOnHand) })} → ${t(
            "consumptions.afterCompletion",
            { resulting: formatQuantity(c.resultingStock) },
          )}`
        : t("consumptions.stock", { stock: formatQuantity(c.stockOnHand) });

  const hint = (
    <Stack spacing={0.25}>
      <Typography variant="caption" fontWeight={700}>
        {c.name} {t("consumptions.quantity", { quantity: formatQuantity(c.quantity), unit })}
      </Typography>
      <Typography variant="caption">{stockLine}</Typography>
      <Typography variant="caption">
        {billable ? t("consumptions.billableHint") : t("consumptions.includedHint")}
      </Typography>
      {!c.autoWriteOff && (
        <Typography variant="caption">{t("consumptions.noWriteOff")}</Typography>
      )}
      {c.source === "manual" && (
        <Typography variant="caption">{t("consumptions.manual")}</Typography>
      )}
    </Stack>
  );

  return (
    <Tooltip title={hint} enterTouchDelay={0} leaveTouchDelay={4000}>
      <Chip
        size="small"
        tabIndex={0}
        variant={c.autoWriteOff ? "filled" : "outlined"}
        icon={
          shortage ? (
            <Box
              component="span"
              sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "warning.main" }}
            />
          ) : undefined
        }
        label={
          <>
            {c.name} × {formatQuantity(c.quantity)}
            {extra > 0 && (
              <Box component="span" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {" · "}
                {t("consumptions.extra", { amount: plainAmount(extra) })}
              </Box>
            )}
          </>
        }
        sx={{
          height: 26,
          maxWidth: "100%",
          borderRadius: "8px",
          fontWeight: billable ? 600 : 500,
          color: billable ? "primary.onSurface" : "text.secondary",
          bgcolor: c.autoWriteOff
            ? billable
              ? alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.16 : 0.1)
              : subtleBg(theme, true)
            : "transparent",
          "& .MuiChip-icon": { ml: "8px", mr: "-2px" },
        }}
      />
    </Tooltip>
  );
};

const ConsumptionChips: React.FC<{
  consumptions: AppointmentConsumption[];
  writtenOff: boolean;
}> = ({ consumptions, writtenOff }) => {
  const { t } = useT("appointments");
  const shortages = writtenOff ? 0 : consumptions.filter((c) => c.shortage).length;
  return (
    <Box sx={{ pl: BILL_INDENT }}>
      <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.75}>
        {consumptions.map((c) => (
          <ConsumptionChip key={c.id} c={c} writtenOff={writtenOff} />
        ))}
      </Stack>
      {shortages > 0 && (
        <Typography
          variant="caption"
          color="warning.onSurface"
          display="block"
          sx={{ mt: 0.75 }}
        >
          {t("consumptions.shortageSummary", { count: shortages })}
        </Typography>
      )}
    </Box>
  );
};

/** Строка чека: миниатюра, название с подписью, сумма справа. */
export const BillRow: React.FC<{
  thumb: React.ReactNode;
  imageUrl?: string | null;
  title: React.ReactNode;
  titleAdornment?: React.ReactNode;
  subtitle?: React.ReactNode;
  amount?: string | null;
  action?: React.ReactNode;
  onClick?: () => void;
}> = ({ thumb, imageUrl, title, titleAdornment, subtitle, amount, action, onClick }) => {
  const theme = useTheme();
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      onClick={onClick}
      sx={{
        mx: -1,
        px: 1,
        py: 0.5,
        borderRadius: "10px",
        cursor: onClick ? "pointer" : "default",
        transition: "background-color 0.2s",
        ...(onClick && { "&:hover": { bgcolor: subtleBg(theme, true) } }),
      }}
    >
      <Avatar
        variant="rounded"
        src={imageUrl ?? undefined}
        sx={{
          width: BILL_THUMB,
          height: BILL_THUMB,
          borderRadius: "10px",
          bgcolor: subtleBg(theme, true),
          color: "text.secondary",
          flexShrink: 0,
        }}
      >
        {thumb}
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600} noWrap>
            {title}
          </Typography>
          {titleAdornment}
        </Stack>
        {subtitle && (
          <Typography variant="caption" color="text.secondary" display="block" noWrap>
            {subtitle}
          </Typography>
        )}
      </Box>
      {amount != null && (
        <Typography
          variant="body2"
          fontWeight={600}
          sx={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}
        >
          {amount}
        </Typography>
      )}
      {action && (
        <Box onClick={(event) => event.stopPropagation()} sx={{ display: "flex", flexShrink: 0 }}>
          {action}
        </Box>
      )}
    </Stack>
  );
};

/** Шапка группы чека: маленький аватар и имя (специалист или «Товары»). */
export const BillGroupHeader: React.FC<{
  avatar: React.ReactNode;
  avatarColor?: string;
  avatarSrc?: string | null;
  label: string;
  onClick?: () => void;
}> = ({ avatar, avatarColor, avatarSrc, label, onClick }) => {
  const theme = useTheme();
  const bg = avatarColor ?? subtleBg(theme, true);
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      component={onClick ? "button" : "div"}
      type={onClick ? "button" : undefined}
      onClick={onClick}
      sx={{
        alignSelf: "flex-start",
        maxWidth: "100%",
        p: 0,
        border: 0,
        bgcolor: "transparent",
        font: "inherit",
        color: "inherit",
        textAlign: "left",
        cursor: onClick ? "pointer" : "default",
        ...(onClick && { "&:hover .bill-group-label": { color: "text.primary" } }),
      }}
    >
      <Avatar
        src={avatarSrc ?? undefined}
        sx={{
          width: 24,
          height: 24,
          fontSize: "0.625rem",
          fontWeight: 700,
          bgcolor: bg,
          color: avatarColor ? theme.palette.getContrastText(avatarColor) : "text.secondary",
        }}
      >
        {avatar}
      </Avatar>
      <Typography
        className="bill-group-label"
        variant="body2"
        fontWeight={600}
        color="text.secondary"
        noWrap
        sx={{ transition: "color 0.2s" }}
      >
        {label}
      </Typography>
    </Stack>
  );
};

const PaidMark: React.FC = () => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        width: 36,
        height: 36,
        borderRadius: "10px",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "success.onSurface",
        bgcolor: alpha(theme.palette.success.main, theme.palette.mode === "dark" ? 0.16 : 0.1),
      }}
    >
      <CheckOutlined sx={{ fontSize: 20 }} />
    </Box>
  );
};

/** Строка разбивки низа чека: подпись слева, сумма справа. */
const SumRow: React.FC<{ label: React.ReactNode; value: string; color?: string }> = ({
  label,
  value,
  color = "text.secondary",
}) => (
  <Stack direction="row" justifyContent="space-between" spacing={2}>
    <Typography variant="body2" color={color} noWrap>
      {label}
    </Typography>
    <Typography
      variant="body2"
      color={color}
      sx={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}
    >
      {value}
    </Typography>
  </Stack>
);

/**
 * Низ чека. Каждое число встречается один раз: «Итого», скидка и внесённые
 * суммы появляются, только когда итог от них отличается. У неоплаченного
 * приёма без скидки остаётся одна строка «К оплате».
 */
const BillFooter: React.FC<{
  payment: BillPayment | null;
  actions?: React.ReactNode;
  /** Ниже стоит история оплат — способы и суммы оплат показывает она. */
  withHistory: boolean;
}> = ({ payment: p, actions, withHistory }) => {
  const { t } = useT("appointments");

  if (!p) {
    // Суммы нет (бесплатный приём / нет права на финансы), но кнопка есть.
    return actions ? (
      <Stack direction="row" justifyContent="flex-end" sx={{ px: 2.5, py: 2 }}>
        {actions}
      </Stack>
    ) : null;
  }

  const discountPercent = discountPercentOf(p.baseTotal, p.discountAmount);
  const hasDiscount = discountPercent != null;
  const isClosed = p.isCancelled ? p.netPaid > 0 : p.debt <= 0;
  const isPartial = !isClosed && p.paidTotal > 0;

  const methods = [
    { key: "cash", label: t("bill.methodCash"), amount: p.cash },
    {
      key: "card",
      label: p.cardMethodName
        ? t("bill.methodCardNamed", { name: p.cardMethodName })
        : t("bill.methodCard"),
      amount: p.card,
    },
    { key: "balance", label: t("bill.methodBalance"), amount: p.balance },
    { key: "bonus", label: t("bill.methodBonus"), amount: p.bonuses },
    {
      key: "insurance",
      label: p.insurerName
        ? t("bill.methodInsuranceNamed", { name: p.insurerName })
        : t("bill.methodInsurance"),
      amount: p.insurance,
    },
  ].filter((m) => m.amount > 0);

  // Внесённые суммы — строками «− 500», только если ниже нет истории оплат:
  // лента показывает их с датой, кассиром и способом.
  const showMethodRows = isPartial && !withHistory;
  // «Итого» нужен, когда от него что-то отнимают строками ниже; с историей
  // частичную оплату объясняет подпись «Оплачено 500 из 1 251».
  const showSubtotal = hasDiscount || showMethodRows;
  const showRows = showSubtotal || p.refunded > 0;

  let label: string;
  let labelColor: string;
  let amount: number;
  let caption: string | null = null;
  const paidOf = (key: string) =>
    t(key, { paid: plainAmount(p.paidTotal), total: plainAmount(p.finalTotal) });
  if (isClosed) {
    label = t("bill.paid");
    labelColor = "success.onSurface";
    amount = p.netPaid > 0 ? p.netPaid : p.finalTotal;
    // Способы оплаты — подписью: отдельные строки повторили бы итог.
    caption = withHistory
      ? null
      : methods.length === 1
        ? methods[0].label
        : methods.map((m) => `${m.label} ${plainAmount(m.amount)}`).join(" · ") || null;
  } else if (p.phase === "debt") {
    label = t("bill.debt");
    labelColor = "error.onSurface";
    amount = p.debt;
    caption = isPartial && !showMethodRows ? paidOf("bill.paidOf") : null;
  } else if (isPartial) {
    const prepaid = p.phase === "prepaid";
    label = prepaid ? t("bill.toPayAtVisit") : t("bill.remaining");
    labelColor = "warning.onSurface";
    amount = p.debt;
    caption = showMethodRows ? null : paidOf(prepaid ? "bill.prepaidOf" : "bill.paidOf");
  } else {
    label = t("bill.toPay");
    labelColor = "text.secondary";
    amount = p.debt > 0 ? p.debt : p.finalTotal;
  }

  return (
    <Box sx={{ px: 2.5, pt: 2, pb: 2.25 }}>
      {showRows && (
        <Stack spacing={0.75} sx={{ mb: 1.75 }}>
          {showSubtotal && (
            <SumRow label={t("bill.subtotal")} value={plainAmount(p.baseTotal)} />
          )}
          {hasDiscount && (
            <SumRow
              label={t("bill.discount", { percent: discountPercent })}
              value={`− ${plainAmount(p.discountAmount)}`}
              color="primary.onSurface"
            />
          )}
          {showMethodRows &&
            methods.map((m) => (
              <SumRow key={m.key} label={m.label} value={`− ${plainAmount(m.amount)}`} />
            ))}
          {p.refunded > 0 && (
            <SumRow
              label={t("bill.refunded")}
              value={plainAmount(p.refunded)}
              color="error.onSurface"
            />
          )}
        </Stack>
      )}

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        useFlexGap
        gap={1.5}
      >
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
          {isClosed && <PaidMark />}
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="caption"
              color={labelColor}
              display="block"
              sx={{ fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}
            >
              {label}
            </Typography>
            <Typography
              component="div"
              sx={{
                fontSize: isClosed ? "1.375rem" : "1.75rem",
                fontWeight: 700,
                lineHeight: 1.15,
                letterSpacing: "-0.02em",
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {plainAmount(amount)}{" "}
              <Box
                component="span"
                sx={{ fontSize: "1rem", fontWeight: 600, color: "text.secondary" }}
              >
                {t("bill.currency")}
              </Box>
            </Typography>
            {caption && (
              <Typography variant="caption" color="text.secondary" display="block" noWrap>
                {caption}
              </Typography>
            )}
          </Box>
        </Stack>
        {actions}
      </Stack>
    </Box>
  );
};

export interface AppointmentBillProps {
  groups: ServiceEmployeeGroup[];
  onEmployeeClick?: (group: ServiceEmployeeGroup) => void;
  onServiceClick?: (serviceId: number) => void;
  /** Строки товаров визита (`AppointmentProductLines`); null — товаров нет. */
  products?: React.ReactNode;
  /** Деньги приёма; null — суммы не показываем. */
  payment: BillPayment | null;
  /** Кнопки кассы (оплата, чек, возврат) справа от итога. */
  actions?: React.ReactNode;
  /** Расходники уже списаны (приём оплачен или завершён) — нехватку не показываем. */
  consumptionsWrittenOff?: boolean;
  /** История оплат (`AppointmentPaymentHistory embedded`) — последней строкой чека. */
  history?: React.ReactNode;
}

/**
 * «Состав и оплата» — приём как чек: специалисты и их услуги, расходники
 * чипами под услугой, товары визита и внизу итог с кнопкой оплаты.
 *
 * Раньше это были четыре блока (оплата, услуги, расходники, товары), и одни и
 * те же суммы повторялись: цена услуги, «Платные товары +250», та же доплата у
 * расходника, итог и «остаток» равный итогу. Липкая шапка оплаты наезжала на
 * контент, поэтому её убрали — итог стоит там, где заканчивается состав.
 */
const AppointmentBill: React.FC<AppointmentBillProps> = ({
  groups,
  onEmployeeClick,
  onServiceClick,
  products,
  payment,
  actions,
  consumptionsWrittenOff = false,
  history,
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();
  const mode = theme.palette.mode;

  const colorByEmployee = React.useMemo(
    () => buildEmployeeAccentMap(groups.map((g) => g.employeeId), mode),
    [groups, mode],
  );

  const hasFooter = Boolean(payment || actions || history);
  const sections: React.ReactNode[] = groups.map((group) => {
    const accent =
      group.employeeId !== null ? colorByEmployee.get(group.employeeId) : undefined;
    const employeeClickable = group.employeeId !== null && Boolean(onEmployeeClick);
    return (
      <Stack key={`emp-${group.employeeId ?? "none"}`} spacing={1.25}>
        <BillGroupHeader
          avatar={group.employeeId !== null ? employeeInitials(group.employeeName) : "?"}
          avatarColor={accent}
          avatarSrc={group.employeePhotoUrl}
          label={group.employeeName}
          onClick={employeeClickable ? () => onEmployeeClick?.(group) : undefined}
        />
        {group.lines.map((line) => {
          const subtitle = [
            line.quantity > 1 ? `× ${line.quantity}` : null,
            line.durationMinutes
              ? `${line.durationMinutes} ${t("priceField.minutesShort")}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <Stack key={line.lineId} spacing={1}>
              <BillRow
                thumb={<MedicalServicesOutlined sx={{ fontSize: 18 }} />}
                imageUrl={line.imageUrl}
                title={
                  <Tooltip title={line.name} enterDelay={600}>
                    <span>{line.name}</span>
                  </Tooltip>
                }
                titleAdornment={conclusionMark(line, t)}
                subtitle={subtitle || null}
                amount={line.amount}
                action={line.action}
                onClick={
                  line.serviceId !== null && onServiceClick
                    ? () => onServiceClick(line.serviceId!)
                    : undefined
                }
              />
              {(line.consumptions?.length ?? 0) > 0 && (
                <ConsumptionChips
                  consumptions={line.consumptions!}
                  writtenOff={consumptionsWrittenOff}
                />
              )}
            </Stack>
          );
        })}
      </Stack>
    );
  });
  if (products) sections.push(<Box key="products">{products}</Box>);

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
        {hasFooter ? t("bill.title") : t("details.servicesAndSpecialists")}
      </Typography>
      <Paper
        variant="outlined"
        sx={{ borderRadius: "16px", bgcolor: subtleBg(theme), overflow: "hidden" }}
      >
        <Stack sx={{ px: 2.5, py: 2 }} spacing={2}>
          {sections.length === 0 ? (
            <Typography variant="body2" color="text.disabled">
              {t("details.noServices")}
            </Typography>
          ) : (
            sections.map((section, i) => (
              <Box
                key={i}
                sx={i > 0 ? { pt: 2, borderTop: `1px solid ${subtleBorder(theme)}` } : undefined}
              >
                {section}
              </Box>
            ))
          )}
        </Stack>
        {hasFooter && (
          <>
            <Box sx={{ mx: 2.5, borderTop: "1px dashed", borderColor: "divider" }} />
            <BillFooter payment={payment} actions={actions} withHistory={Boolean(history)} />
            {history}
          </>
        )}
      </Paper>
    </Box>
  );
};

export default AppointmentBill;

import React from "react";
import {
  Box,
  Stack,
  Typography,
  Paper,
  Chip,
  Divider,
  alpha,
  useTheme
} from "@mui/material";
import {
  AccountBalanceWalletOutlined,
  CreditCardOutlined,
  CardGiftcardOutlined,
  HealthAndSafetyOutlined,
  CheckCircleOutline,
  ErrorOutline,
  InfoOutlined,
  CancelOutlined as CancelIcon,
} from "@mui/icons-material";
import { discountPercentOf } from "../../utility/format";

export interface PaymentInfo {
  baseTotal: number;
  discountPercent?: number;
  discountAmount?: number;
  cash: number;
  card: number;
  /**
   * Способ безнала («Bakai POS», «MBank»…) — подписью к строке «Безналичными».
   * Пусто — операция способа не хранит или проведена до появления справочника.
   */
  cashlessMethodName?: string | null;
  balance?: number;
  bonuses?: number;
  /** Покрыто страховой компанией */
  insurance?: number;
  /** Название страховой компании (для строки «Страховка») */
  insurerName?: string | null;
  /** Номер полиса пациента */
  policyNumber?: string | null;
  finalTotal: number;
  debt?: number;
  status?: string;
}

export interface PaymentInfoBlockProps {
  payment: PaymentInfo;
  variant?: "summary" | "detailed";
  showIcons?: boolean;
  actionButton?: React.ReactNode;
  /**
   * Плотная раскладка detailed-варианта: те же данные, но без крупных
   * заголовочных сумм и лишних отступов. Для боковых карточек (приём), где
   * блок конкурирует за высоту с услугами и текстами; на отдельных страницах
   * (расходы, продажи) остаётся обычный размер.
   */
  dense?: boolean;
  /**
   * Дописывать к шапке «· скидка N%». По умолчанию выключено: продажи уже
   * показывают процент отдельным чипом («Со скидкой 20%») из своего
   * discountPercent, и второй процент рядом — не только дубль, но и риск
   * расхождения, если бэк отдаёт дробный процент, а мы округляем.
   * Приёмам включаем: у оплаченного приёма чипа скидки нет, и шапка —
   * единственное место, где дисконт виден.
   */
  showDiscountPercent?: boolean;
}

export const PaymentInfoBlock: React.FC<PaymentInfoBlockProps> = ({
  payment,
  variant = "detailed",
  actionButton,
  dense = false,
  showDiscountPercent = false,
}) => {
  const theme = useTheme();
  const {
    discountAmount, baseTotal, cash, card, cashlessMethodName,
    balance = 0, bonuses = 0, insurance = 0, insurerName, policyNumber,
    finalTotal, debt = 0, status,
  } = payment;
  const totalPaid = cash + card + balance + bonuses + insurance;

  // Шапка показывает сумму К ОПЛАТЕ: baseTotal — это цена до скидки, и на чеке
  // со скидкой она расходилась с фактически принятыми деньгами (1600 при
  // оплате 1000), причём сама скидка нигде не выводилась — 600 сом просто
  // «исчезали». Исходную сумму оставляем зачёркнутой рядом.
  // Процент считаем сами, а не берём из payment.discountPercent: вызывающие
  // округляют его по-своему, и 99.6% превращались в «100%» — то есть в
  // «платить нечего».
  const hasDiscount = discountPercentOf(baseTotal, discountAmount) != null;
  const headerDiscountPercent = showDiscountPercent
    ? discountPercentOf(baseTotal, discountAmount)
    : null;
  const headerTotal = hasDiscount ? finalTotal : baseTotal || finalTotal;

  let isPaid: boolean = false;
  let isPartiallyPaid: boolean = false;
  let isDiscounted: boolean = false;
  let isCancelled: boolean = false;
  let isArrived: boolean = false;

  if (status) {
    const s = status.trim().toLowerCase();
    isPaid = s === 'paid' || s === 'оплачено' || s === 'discounted' || s === 'оплачено со скидкой';
    isPartiallyPaid = s === 'partial' || s === 'частично оплачено';
    isDiscounted = s === 'discounted' || s === 'оплачено со скидкой';
    isCancelled = s === 'canceled' || s === 'cancelled' || s === 'отменено' || s === 'пациент не пришел';
    isArrived = s === 'пациент здесь' || s === 'прибыл' || s === 'в очереди';
  } else {
    // Fallback logic
    isDiscounted = debt <= 0 && totalPaid <= 0 && (discountAmount || 0) > 0;
    isPaid = debt <= 0 && !isDiscounted;
    isPartiallyPaid = totalPaid > 0 && debt > 0;
  }

  const getStatusConfig = () => {
    if (isCancelled) {
      return {
        label: status || "Отменено",
        color: "error" as const,
        icon: <CancelIcon fontSize="small" />,
        bgColor: theme.palette.error.main,
        lightBg: alpha(theme.palette.error.main, 0.08),
      };
    }
    if (isArrived) {
      return {
        label: status || "Пациент здесь",
        color: "success" as const,
        icon: <CheckCircleOutline fontSize="small" />,
        bgColor: theme.palette.success.main,
        lightBg: alpha(theme.palette.success.main, 0.08),
      };
    }
    if (isDiscounted) {
      return {
        label: "Оплачено со скидкой",
        color: "secondary" as const,
        icon: <CheckCircleOutline fontSize="small" />,
        bgColor: theme.palette.secondary.main,
        lightBg: alpha(theme.palette.secondary.main, 0.08),
      };
    }
    if (isPaid) {
      return {
        label: "Оплачено",
        color: "success" as const,
        icon: <CheckCircleOutline fontSize="small" />,
        bgColor: theme.palette.success.main,
        lightBg: alpha(theme.palette.success.main, 0.08),
      };
    }
    if (isPartiallyPaid) {
      return {
        label: "Частично",
        color: "info" as const,
        icon: <InfoOutlined fontSize="small" />,
        bgColor: theme.palette.info.main,
        lightBg: alpha(theme.palette.info.main, 0.08),
      };
    }
    return {
      label: "Ожидаем",
      color: "warning" as const,
      icon: <ErrorOutline fontSize="small" />,
      bgColor: theme.palette.warning.main,
      lightBg: alpha(theme.palette.warning.main, 0.08),
    };
  };

  const statusConfig = getStatusConfig();

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("ru-RU").format(amount);
  };

  // Неоплаченный визит: «Остаток к оплате» повторял «Общую сумму» цифра в цифру
  // и занимал вторую половину блока. В плотном режиме такую плашку скрываем, а
  // кнопку оплаты поднимаем в строку с суммой.
  const hasAnyPayment = cash > 0 || card > 0 || balance > 0 || bonuses > 0 || insurance > 0;
  const debtEqualsTotal =
    dense && debt > 0 && !hasAnyPayment && Math.abs(debt - finalTotal) < 0.5;
  const showBreakdownBody = hasAnyPayment || !debtEqualsTotal;

  if (variant === "summary") {
    return (
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          borderRadius: "14px",
          borderColor: alpha(statusConfig.bgColor, 0.3),
          bgcolor: alpha(statusConfig.bgColor, 0.02),
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.2, fontWeight: 600, letterSpacing: 0.5 }}>
              Итого
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: statusConfig.bgColor }}>
              {formatAmount(finalTotal)} <Typography component="span" variant="h6" sx={{ fontWeight: 700 }}>сом</Typography>
            </Typography>
          </Box>
          <Chip
            label={statusConfig.label}
            icon={statusConfig.icon}
            color={statusConfig.color}
            size="small"
            sx={{ fontWeight: 700, borderRadius: "7px" }}
          />
        </Stack>
      </Paper>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Paper
        variant="outlined"
        sx={{
          borderRadius: "14px",
          overflow: 'hidden',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        {/* Header - Total and Status */}
        <Box sx={{ p: dense ? 1.25 : 2, bgcolor: alpha(theme.palette.primary.main, 0.03), borderBottom: '1px solid', borderColor: 'divider' }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems={dense ? "center" : "flex-start"}
            flexWrap="wrap"
            useFlexGap
            rowGap={1}
          >
            {dense ? (
              // Плотный режим: подпись и сумма одной строкой — заголовочная
              // «Общая сумма» в h4 занимала полкарточки приёма.
              <Stack direction="row" alignItems="baseline" spacing={0.75} flexWrap="wrap">
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                  Общая сумма
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {hasDiscount && (
                    <Typography
                      component="span"
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontWeight: 700, mr: 0.75, textDecoration: "line-through" }}
                    >
                      {formatAmount(baseTotal)}
                    </Typography>
                  )}
                  {formatAmount(headerTotal)}
                  <Typography component="span" variant="body2" color="text.secondary" sx={{ fontWeight: 700, ml: 0.5 }}>сом</Typography>
                </Typography>
                {headerDiscountPercent != null && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                    · скидка {headerDiscountPercent}%
                  </Typography>
                )}
              </Stack>
            ) : (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 1, display: 'block', mb: 0.5 }}>
                  Общая сумма
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 700, display: 'flex', alignItems: 'baseline', gap: 0.5, flexWrap: 'wrap' }}>
                  {hasDiscount && (
                    <Typography
                      component="span"
                      variant="h6"
                      color="text.secondary"
                      sx={{ fontWeight: 700, textDecoration: "line-through" }}
                    >
                      {formatAmount(baseTotal)}
                    </Typography>
                  )}
                  {formatAmount(headerTotal)}
                  <Typography component="span" variant="h6" color="text.secondary" sx={{ fontWeight: 700 }}>сом</Typography>
                  {headerDiscountPercent != null && (
                    <Typography component="span" variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>
                      · скидка {headerDiscountPercent}%
                    </Typography>
                  )}
                </Typography>
              </Box>
            )}
            <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0 }}>
              <Chip
                label={statusConfig.label}
                icon={statusConfig.icon}
                color={statusConfig.color}
                size={dense ? "small" : "medium"}
                sx={{ fontWeight: 700, height: dense ? 24 : 28, borderRadius: "7px" }}
              />
              {debtEqualsTotal && actionButton}
            </Stack>
          </Stack>
        </Box>

        {showBreakdownBody && (
        <Box sx={{ p: dense ? 1.25 : 2 }}>
          <Stack spacing={dense ? 1.25 : 2}>
            {/* Payment Details Table-like Breakdown */}
            <Stack spacing={dense ? 1 : 1.5}>
              {/* Cash */}
              {cash > 0 && (
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box sx={{ p: 0.5, borderRadius: 1, bgcolor: alpha(theme.palette.success.main, 0.1), display: 'flex' }}>
                      <AccountBalanceWalletOutlined sx={{ fontSize: 18, color: 'success.main' }} />
                    </Box>
                    <Typography variant="body2" color="text.secondary" fontWeight={500}>Наличными</Typography>
                  </Stack>
                  <Typography variant="body2" fontWeight={700}>{formatAmount(cash)} сом</Typography>
                </Stack>
              )}

              {/* Card */}
              {card > 0 && (
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box sx={{ p: 0.5, borderRadius: 1, bgcolor: alpha(theme.palette.info.main, 0.1), display: 'flex' }}>
                      <CreditCardOutlined sx={{ fontSize: 18, color: 'info.main' }} />
                    </Box>
                    <Typography variant="body2" color="text.secondary" fontWeight={500}>
                      Безналичными{cashlessMethodName ? ` · ${cashlessMethodName}` : ""}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" fontWeight={700}>{formatAmount(card)} сом</Typography>
                </Stack>
              )}

              {/* Balance */}
              {balance > 0 && (
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box sx={{ p: 0.5, borderRadius: 1, bgcolor: alpha(theme.palette.success.main, 0.1), display: 'flex' }}>
                      <AccountBalanceWalletOutlined sx={{ fontSize: 18, color: 'success.main' }} />
                    </Box>
                    <Typography variant="body2" color="text.secondary" fontWeight={500}>С баланса</Typography>
                  </Stack>
                  <Typography variant="body2" fontWeight={700}>{formatAmount(balance)} сом</Typography>
                </Stack>
              )}

              {/* Bonuses */}
              {bonuses > 0 && (
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box sx={{ p: 0.5, borderRadius: 1, bgcolor: alpha(theme.palette.warning.main, 0.1), display: 'flex' }}>
                      <CardGiftcardOutlined sx={{ fontSize: 18, color: 'warning.main' }} />
                    </Box>
                    <Typography variant="body2" color="text.secondary" fontWeight={500}>Бонусами</Typography>
                  </Stack>
                  <Typography variant="body2" fontWeight={700}>{formatAmount(bonuses)} сом</Typography>
                </Stack>
              )}

              {/* Insurance (страховка) */}
              {insurance > 0 && (
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box sx={{ p: 0.5, borderRadius: 1, bgcolor: alpha(theme.palette.info.main, 0.1), display: 'flex' }}>
                      <HealthAndSafetyOutlined sx={{ fontSize: 18, color: 'info.main' }} />
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary" fontWeight={500}>
                        Страховка{insurerName ? ` · ${insurerName}` : ""}
                      </Typography>
                      {policyNumber && (
                        <Typography variant="caption" color="text.disabled" display="block">
                          Полис {policyNumber}
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                  <Typography variant="body2" fontWeight={700}>{formatAmount(insurance)} сом</Typography>
                </Stack>
              )}

            </Stack>

            {/* Разделитель нужен только когда выше есть строки способов оплаты */}
            {hasAnyPayment && <Divider sx={{ borderStyle: 'dashed' }} />}

            {/* Final Balance / Debt Section */}
            <Box sx={{
              p: dense ? 1 : 1.5,
              borderRadius: "14px",
              bgcolor: debt > 0 ? alpha(theme.palette.error.main, 0.04) : alpha(theme.palette.success.main, 0.04),
              border: '1px solid',
              borderColor: debt > 0 ? alpha(theme.palette.error.main, 0.1) : alpha(theme.palette.success.main, 0.1),
            }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                {dense ? (
                  <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ minWidth: 0 }}>
                    <Typography variant="caption" color={debt > 0 ? "error.main" : "success.main"} sx={{ fontWeight: 700 }}>
                      {debt > 0 ? "Остаток к оплате" : "Итого оплачено"}
                    </Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: debt > 0 ? "error.main" : "success.main" }}>
                      {formatAmount(debt > 0 ? debt : totalPaid)} сом
                    </Typography>
                  </Stack>
                ) : (
                  <Box>
                    <Typography variant="caption" color={debt > 0 ? "error.main" : "success.main"} sx={{ fontWeight: 700, letterSpacing: 0.5, display: 'block', mb: 0.2 }}>
                      {debt > 0 ? "Остаток к оплате" : "Итого оплачено"}
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: debt > 0 ? "error.main" : "success.main" }}>
                      {formatAmount(debt > 0 ? debt : totalPaid)} сом
                    </Typography>
                  </Box>
                )}
                {actionButton && <Box sx={{ flexShrink: 0 }}>{actionButton}</Box>}
              </Stack>
            </Box>
          </Stack>
        </Box>
        )}
      </Paper>
    </Box>
  );
};

export default PaymentInfoBlock;

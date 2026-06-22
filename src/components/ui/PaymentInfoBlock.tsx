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
  CheckCircleOutline,
  ErrorOutline,
  InfoOutlined,
  Cancel as CancelIcon,
} from "@mui/icons-material";

export interface PaymentInfo {
  baseTotal: number;
  discountPercent?: number;
  discountAmount?: number;
  cash: number;
  card: number;
  balance?: number;
  bonuses?: number;
  finalTotal: number;
  debt?: number;
  status?: string;
}

export interface PaymentInfoBlockProps {
  payment: PaymentInfo;
  variant?: "summary" | "detailed";
  showIcons?: boolean;
  actionButton?: React.ReactNode;
}

export const PaymentInfoBlock: React.FC<PaymentInfoBlockProps> = ({
  payment,
  variant = "detailed",
  actionButton,
}) => {
  const theme = useTheme();
  const { discountPercent, discountAmount, baseTotal, cash, card, balance = 0, bonuses = 0, finalTotal, debt = 0, status } = payment;
  const totalPaid = cash + card + balance + bonuses;

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

  if (variant === "summary") {
    return (
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          borderRadius: 2,
          borderColor: alpha(statusConfig.bgColor, 0.3),
          bgcolor: alpha(statusConfig.bgColor, 0.02),
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Итого
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, color: statusConfig.bgColor }}>
              {formatAmount(finalTotal)} <Typography component="span" variant="h6" sx={{ fontWeight: 700 }}>сом</Typography>
            </Typography>
          </Box>
          <Chip
            label={statusConfig.label}
            icon={statusConfig.icon}
            color={statusConfig.color}
            size="small"
            sx={{ fontWeight: 700, borderRadius: 1.5 }}
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
          borderRadius: 3,
          overflow: 'hidden',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        }}
      >
        {/* Header - Total and Status */}
        <Box sx={{ p: 2, bgcolor: alpha(theme.palette.primary.main, 0.03), borderBottom: '1px solid', borderColor: 'divider' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 0.5 }}>
                Общая сумма
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800, display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                {formatAmount(baseTotal || finalTotal)}
                <Typography component="span" variant="h6" color="text.secondary" sx={{ fontWeight: 700 }}>сом</Typography>
              </Typography>
            </Box>
            <Chip
              label={statusConfig.label}
              icon={statusConfig.icon}
              color={statusConfig.color}
              sx={{ fontWeight: 700, height: 28, borderRadius: 1.5 }}
            />
          </Stack>
        </Box>

        <Box sx={{ p: 2 }}>
          <Stack spacing={2}>
            {/* Payment Details Table-like Breakdown */}
            <Stack spacing={1.5}>
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
                    <Typography variant="body2" color="text.secondary" fontWeight={500}>Безналичными</Typography>
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

            </Stack>

            <Divider sx={{ borderStyle: 'dashed' }} />

            {/* Final Balance / Debt Section */}
            <Box sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: debt > 0 ? alpha(theme.palette.error.main, 0.04) : alpha(theme.palette.success.main, 0.04),
              border: '1px solid',
              borderColor: debt > 0 ? alpha(theme.palette.error.main, 0.1) : alpha(theme.palette.success.main, 0.1),
            }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="caption" color={debt > 0 ? "error.main" : "success.main"} sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 0.2 }}>
                    {debt > 0 ? "Остаток к оплате" : "Итого оплачено"}
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 800, color: debt > 0 ? "error.main" : "success.main" }}>
                    {formatAmount(debt > 0 ? debt : totalPaid)} сом
                  </Typography>
                </Box>
                {actionButton && <Box>{actionButton}</Box>}
              </Stack>
            </Box>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
};

export default PaymentInfoBlock;

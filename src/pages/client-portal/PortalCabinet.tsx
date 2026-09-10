import React from "react";
import {
  Alert,
  Avatar,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  Chip,
  CircularProgress,
  LinearProgress,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
} from "@mui/material";
import AccountCircleRounded from "@mui/icons-material/AccountCircleRounded";
import CalendarMonthRounded from "@mui/icons-material/CalendarMonthRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import CreditCardRounded from "@mui/icons-material/CreditCardRounded";
import HomeRounded from "@mui/icons-material/HomeRounded";
import PaymentsRounded from "@mui/icons-material/PaymentsRounded";
import ReceiptLongRounded from "@mui/icons-material/ReceiptLongRounded";
import VerifiedRounded from "@mui/icons-material/VerifiedRounded";
import { alpha, useTheme } from "@mui/material/styles";
import { useMutation, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import "dayjs/locale/ru";

import { ApiError } from "../../api/client";
import {
  createPortalPayLink,
  getPortalMe,
  isPortalTokenInvalid,
  type PortalCharge,
  type PortalChargeStatus,
  type PortalMe,
  type PortalOfferingKind,
  type PortalPayment,
  type PortalPaymentMethod,
  type PortalPaymentStatus,
  type PortalSubscription,
} from "../../api/clientPortal";
import { formatPhoneDisplay } from "../../utility/phone";
import { useClientPortalSession } from "./session";

type Section = "home" | "charges" | "payments" | "profile";
type ChargeFilter = "open" | "history";

function money(value: string | number | null | undefined): string {
  const parsed = Number(value ?? 0);
  const safe = Number.isFinite(parsed) ? parsed : 0;
  return `${safe.toLocaleString("ru-RU", {
    minimumFractionDigits: Number.isInteger(safe) ? 0 : 2,
    maximumFractionDigits: 2,
  })} сом`;
}

const formatDate = (value: string | null | undefined): string =>
  value ? dayjs(value).locale("ru").format("D MMM YYYY") : "—";

const CHARGE_STATUS: Record<
  PortalChargeStatus,
  { label: string; tone: string }
> = {
  draft: { label: "Черновик", tone: "#66736F" },
  issued: { label: "К оплате", tone: "#176B61" },
  partial: { label: "Частично", tone: "#B65D2F" },
  paid: { label: "Оплачено", tone: "#278065" },
  overdue: { label: "Просрочено", tone: "#C75243" },
  canceled: { label: "Отменено", tone: "#77817E" },
};

const PAYMENT_STATUS: Record<PortalPaymentStatus, string> = {
  pending: "В обработке",
  succeeded: "Проведён",
  failed: "Ошибка",
  refunded: "Возвращён",
};
const PAYMENT_METHOD: Record<PortalPaymentMethod, string> = {
  bakai: "Bakai Bank",
  cash: "Наличные",
  transfer: "Перевод",
};
const OFFERING_KIND: Record<PortalOfferingKind, string> = {
  service: "Услуга",
  course: "Курс",
  rental: "Аренда",
};

const Surface: React.FC<React.PropsWithChildren<{ sx?: object }>> = ({
  children,
  sx,
}) => (
  <Paper
    elevation={0}
    sx={{
      border: "1px solid",
      borderColor: "rgba(18,63,58,.10)",
      borderRadius: 4,
      bgcolor: "#FFF",
      ...sx,
    }}
  >
    {children}
  </Paper>
);

const Empty: React.FC<{ title: string; text: string }> = ({ title, text }) => (
  <Surface sx={{ px: 3, py: 5, textAlign: "center" }}>
    <VerifiedRounded sx={{ color: "#66C7B5", fontSize: 42, mb: 1 }} />
    <Typography fontWeight={800}>{title}</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
      {text}
    </Typography>
  </Surface>
);

const ChargeCard: React.FC<{
  charge: PortalCharge;
  onPay: (() => void) | null;
  paying: boolean;
}> = ({ charge, onPay, paying }) => {
  const amount = Number(charge.amount);
  const paid = Number(charge.paidAmount);
  const remainder = Math.max(0, amount - paid);
  const progress = amount > 0 ? Math.min(100, (paid / amount) * 100) : 0;
  const status = CHARGE_STATUS[charge.status];
  return (
    <Surface sx={{ p: 2.25 }}>
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <Avatar
          variant="rounded"
          sx={{
            width: 42,
            height: 42,
            bgcolor: alpha(status.tone, 0.1),
            color: status.tone,
          }}
        >
          <ReceiptLongRounded fontSize="small" />
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography fontWeight={800} lineHeight={1.25}>
            {charge.purpose || `Начисление № ${charge.number}`}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            До {formatDate(charge.dueDate)} · № {charge.number}
          </Typography>
        </Box>
        <Chip
          size="small"
          label={status.label}
          sx={{
            bgcolor: alpha(status.tone, 0.1),
            color: status.tone,
            fontWeight: 750,
          }}
        />
      </Stack>
      {paid > 0 && paid < amount && (
        <Box sx={{ mt: 2 }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            sx={{ mb: 0.75 }}
          >
            <Typography variant="caption" color="text.secondary">
              Оплачено {money(paid)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              из {money(amount)}
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              height: 6,
              borderRadius: 9,
              bgcolor: "#EAF1EF",
              "& .MuiLinearProgress-bar": { bgcolor: "#66C7B5" },
            }}
          />
        </Box>
      )}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mt: 2 }}
      >
        <Box>
          <Typography variant="caption" color="text.secondary">
            {charge.isOpen ? "Осталось оплатить" : "Сумма"}
          </Typography>
          <Typography variant="h6" fontWeight={850} lineHeight={1.15}>
            {money(charge.isOpen ? remainder : amount)}
          </Typography>
        </Box>
        {onPay && (
          <Button
            variant="contained"
            disableElevation
            disabled={paying}
            onClick={onPay}
            startIcon={
              paying ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <CreditCardRounded />
              )
            }
            sx={{ borderRadius: 3, px: 2.25 }}
          >
            Оплатить
          </Button>
        )}
      </Stack>
    </Surface>
  );
};

const PaymentCard: React.FC<{ payment: PortalPayment }> = ({ payment }) => {
  const succeeded = payment.status === "succeeded";
  return (
    <Surface sx={{ p: 2 }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Avatar
          sx={{
            bgcolor: succeeded ? "#E5F5EF" : "#F3F5F4",
            color: succeeded ? "#278065" : "#66736F",
          }}
        >
          <PaymentsRounded />
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography fontWeight={850}>{money(payment.amount)}</Typography>
          <Typography variant="caption" color="text.secondary">
            {PAYMENT_METHOD[payment.method] ?? payment.method} ·{" "}
            {formatDate(payment.paidAt)}
          </Typography>
        </Box>
        <Typography
          variant="caption"
          fontWeight={750}
          color={succeeded ? "#278065" : "text.secondary"}
        >
          {PAYMENT_STATUS[payment.status] ?? payment.status}
        </Typography>
      </Stack>
    </Surface>
  );
};

const SubscriptionCard: React.FC<{ subscription: PortalSubscription }> = ({
  subscription,
}) => (
  <Surface sx={{ p: 2 }}>
    <Stack direction="row" spacing={1.5} alignItems="center">
      <Avatar variant="rounded" sx={{ bgcolor: "#EDF7F5", color: "#176B61" }}>
        <CalendarMonthRounded />
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography fontWeight={800}>{subscription.offeringName}</Typography>
        <Typography variant="caption" color="text.secondary">
          {OFFERING_KIND[subscription.offeringKind]} · с{" "}
          {formatDate(subscription.startsOn)}
        </Typography>
      </Box>
      {subscription.sessionsLeft != null && (
        <Chip
          size="small"
          label={`${subscription.sessionsLeft} занятий`}
          sx={{ bgcolor: "#EDF7F5", color: "#176B61" }}
        />
      )}
    </Stack>
  </Surface>
);

function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      sx={{ mb: 1.5 }}
    >
      <Typography variant="h6" fontWeight={850}>
        {title}
      </Typography>
      {action}
    </Stack>
  );
}

export const PortalCabinet: React.FC = () => {
  const { session, signOut } = useClientPortalSession();
  const token = session?.token ?? "";
  const theme = useTheme();
  // В проекте `sm` начинается уже с 360 px, поэтому ориентируем мобильную
  // навигацию на `md`: нижнее меню должно оставаться и на обычных телефонах,
  // и на компактных планшетах.
  const desktop = useMediaQuery(theme.breakpoints.up("md"));
  const [section, setSection] = React.useState<Section>("home");
  const [chargeFilter, setChargeFilter] = React.useState<ChargeFilter>("open");
  const [payError, setPayError] = React.useState<string | null>(null);
  const meQuery = useQuery<PortalMe>({
    queryKey: ["client-portal", "me", session?.clientId ?? null],
    queryFn: ({ signal }) => getPortalMe(token, signal),
    enabled: Boolean(token),
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: (count, error) => !isPortalTokenInvalid(error) && count < 2,
  });
  React.useEffect(() => {
    if (meQuery.error && isPortalTokenInvalid(meQuery.error)) signOut();
  }, [meQuery.error, signOut]);
  const payMutation = useMutation({
    mutationFn: (chargeId: number) => createPortalPayLink(token, chargeId),
    onSuccess: (link) => {
      if (!link.providerPayUrl) {
        setPayError(
          "Банк не вернул ссылку на оплату. Выберите другой способ оплаты."
        );
        return;
      }
      window.location.href = link.providerPayUrl;
    },
    onError: (error) =>
      setPayError(
        error instanceof ApiError && error.message
          ? error.message
          : "Не удалось перейти к оплате. Попробуйте позже."
      ),
  });
  if (meQuery.isLoading)
    return (
      <Stack alignItems="center" sx={{ py: 10 }}>
        <CircularProgress />
      </Stack>
    );
  if (meQuery.isError || !meQuery.data)
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" onClick={() => void meQuery.refetch()}>
            Повторить
          </Button>
        }
      >
        {meQuery.error instanceof ApiError
          ? meQuery.error.message
          : "Не удалось загрузить кабинет."}
      </Alert>
    );

  const me = meQuery.data;
  const openCharges = me.charges.filter((charge) => charge.isOpen);
  const closedCharges = me.charges.filter(
    (charge) => !charge.isOpen && charge.status !== "draft"
  );
  const hasDebt = Number(me.client.debt) > 0;
  const pay = (charge: PortalCharge) => {
    setPayError(null);
    payMutation.mutate(charge.id);
  };
  const renderCharge = (charge: PortalCharge) => (
    <ChargeCard
      key={charge.id}
      charge={charge}
      paying={payMutation.isPending && payMutation.variables === charge.id}
      onPay={charge.isOpen ? () => pay(charge) : null}
    />
  );

  const home = (
    <Stack spacing={2.5}>
      <Box
        sx={{
          position: "relative",
          overflow: "hidden",
          p: { xs: 2.5, sm: 3.5 },
          minHeight: 190,
          borderRadius: 5,
          bgcolor: "#123F3A",
          color: "white",
          boxShadow: "0 20px 50px rgba(18,63,58,.20)",
          "&::after": {
            content: '""',
            position: "absolute",
            width: 210,
            height: 210,
            borderRadius: "50%",
            right: -85,
            top: -90,
            bgcolor: "rgba(102,199,181,.18)",
          },
          "&::before": {
            content: '""',
            position: "absolute",
            width: 120,
            height: 120,
            borderRadius: "50%",
            right: 38,
            bottom: -72,
            border: "22px solid rgba(255,255,255,.05)",
          },
        }}
      >
        <Typography
          variant="overline"
          sx={{ opacity: 0.7, letterSpacing: ".12em" }}
        >
          {hasDebt ? "Сумма к оплате" : "Всё оплачено"}
        </Typography>
        <Typography
          sx={{
            fontSize: { xs: 34, sm: 42 },
            fontWeight: 850,
            letterSpacing: "-.04em",
            mt: 0.25,
          }}
        >
          {money(me.client.debt)}
        </Typography>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{
            position: "absolute",
            left: { xs: 20, sm: 28 },
            bottom: { xs: 20, sm: 26 },
          }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: "#66C7B5",
            }}
          />
          <Typography variant="body2" sx={{ opacity: 0.8 }}>
            Аванс: {money(me.client.balance)}
          </Typography>
        </Stack>
      </Box>
      {payError && (
        <Alert severity="error" onClose={() => setPayError(null)}>
          {payError}
        </Alert>
      )}
      <Box>
        <SectionTitle
          title="Ближайшие счета"
          action={
            openCharges.length > 2 ? (
              <Button
                size="small"
                endIcon={<ChevronRightRounded />}
                onClick={() => setSection("charges")}
              >
                Все
              </Button>
            ) : undefined
          }
        />
        <Stack spacing={1.25}>
          {openCharges.slice(0, 2).map(renderCharge)}
          {!openCharges.length && (
            <Empty
              title="Счетов к оплате нет"
              text="Новые начисления появятся здесь."
            />
          )}
        </Stack>
      </Box>
      {me.subscriptions.length > 0 && (
        <Box>
          <SectionTitle
            title="Активные услуги"
            action={
              <Button size="small" onClick={() => setSection("profile")}>
                Все · {me.subscriptions.length}
              </Button>
            }
          />
          <SubscriptionCard subscription={me.subscriptions[0]} />
        </Box>
      )}
    </Stack>
  );

  const visibleCharges = chargeFilter === "open" ? openCharges : closedCharges;
  const chargesSection = (
    <Box>
      <SectionTitle title="Начисления" />
      <ToggleButtonGroup
        exclusive
        fullWidth
        value={chargeFilter}
        onChange={(_, value: ChargeFilter | null) =>
          value && setChargeFilter(value)
        }
        sx={{
          mb: 2,
          bgcolor: "#EAF1EF",
          p: 0.5,
          borderRadius: 3,
          "& .MuiToggleButton-root": {
            border: 0,
            borderRadius: "10px !important",
            py: 0.75,
            textTransform: "none",
            fontWeight: 750,
          },
          "& .Mui-selected": {
            bgcolor: "white !important",
            boxShadow: "0 2px 8px rgba(18,63,58,.08)",
          },
        }}
      >
        <ToggleButton value="open">
          К оплате · {openCharges.length}
        </ToggleButton>
        <ToggleButton value="history">
          История · {closedCharges.length}
        </ToggleButton>
      </ToggleButtonGroup>
      {payError && (
        <Alert
          severity="error"
          onClose={() => setPayError(null)}
          sx={{ mb: 2 }}
        >
          {payError}
        </Alert>
      )}
      <Stack spacing={1.25}>
        {visibleCharges.map(renderCharge)}
        {!visibleCharges.length && (
          <Empty
            title={
              chargeFilter === "open" ? "Всё оплачено" : "История пока пуста"
            }
            text={
              chargeFilter === "open"
                ? "У вас нет открытых начислений."
                : "Оплаченные счета появятся здесь."
            }
          />
        )}
      </Stack>
    </Box>
  );
  const paymentsSection = (
    <Box>
      <SectionTitle title="Оплаты" />
      <Stack spacing={1.25}>
        {me.payments.map((payment) => (
          <PaymentCard key={payment.id} payment={payment} />
        ))}
        {!me.payments.length && (
          <Empty
            title="Оплат пока нет"
            text="История платежей появится после первой оплаты."
          />
        )}
      </Stack>
    </Box>
  );
  const profileSection = (
    <Stack spacing={3}>
      <Surface sx={{ p: 2.5 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar
            sx={{ width: 54, height: 54, bgcolor: "#123F3A", fontWeight: 850 }}
          >
            {me.client.fullName.trim().charAt(0).toLocaleUpperCase("ru")}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" fontWeight={850}>
              {me.client.fullName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatPhoneDisplay(me.client.phone)}
            </Typography>
          </Box>
        </Stack>
      </Surface>
      <Box>
        <SectionTitle title="Мои услуги" />
        <Stack spacing={1.25}>
          {me.subscriptions.map((item) => (
            <SubscriptionCard key={item.id} subscription={item} />
          ))}
          {!me.subscriptions.length && (
            <Empty
              title="Нет активных услуг"
              text="Заключённые договоры и абонементы появятся здесь."
            />
          )}
        </Stack>
      </Box>
      {me.family.length > 0 && (
        <Box>
          <SectionTitle title="Семья" />
          <Surface sx={{ overflow: "hidden" }}>
            {me.family.map((member, index) => (
              <Stack
                key={member.id}
                direction="row"
                spacing={1.5}
                alignItems="center"
                sx={{ p: 2, borderTop: index ? "1px solid #EAF1EF" : 0 }}
              >
                <Avatar sx={{ bgcolor: "#EDF7F5", color: "#176B61" }}>
                  {member.fullName.charAt(0)}
                </Avatar>
                <Box>
                  <Typography fontWeight={750}>{member.fullName}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatPhoneDisplay(member.phone)}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Surface>
        </Box>
      )}
    </Stack>
  );
  const sections: Record<Section, React.ReactNode> = {
    home,
    charges: chargesSection,
    payments: paymentsSection,
    profile: profileSection,
  };
  const navItems = [
    { value: "home", label: "Главная", icon: <HomeRounded /> },
    { value: "charges", label: "Счета", icon: <ReceiptLongRounded /> },
    { value: "payments", label: "Оплаты", icon: <PaymentsRounded /> },
    { value: "profile", label: "Профиль", icon: <AccountCircleRounded /> },
  ] as const;

  return (
    <>
      {desktop && (
        <Paper
          elevation={0}
          sx={{
            p: 0.75,
            mb: 3,
            display: "flex",
            gap: 0.5,
            borderRadius: 3,
            border: "1px solid rgba(18,63,58,.10)",
          }}
        >
          {navItems.map((item) => (
            <Button
              key={item.value}
              startIcon={item.icon}
              onClick={() => setSection(item.value)}
              sx={{
                flex: 1,
                borderRadius: 2.5,
                color: section === item.value ? "#123F3A" : "text.secondary",
                bgcolor: section === item.value ? "#E7F3F0" : "transparent",
                fontWeight: 750,
              }}
            >
              {item.label}
            </Button>
          ))}
        </Paper>
      )}
      <Box
        sx={{ pb: { xs: "calc(86px + env(safe-area-inset-bottom))", md: 2 } }}
      >
        {sections[section]}
      </Box>
      {!desktop && (
        <Paper
          elevation={12}
          sx={{
            position: "fixed",
            zIndex: 20,
            left: 0,
            right: 0,
            bottom: 0,
            pb: "env(safe-area-inset-bottom)",
            borderRadius: "22px 22px 0 0",
            overflow: "hidden",
            boxShadow: "0 -10px 35px rgba(18,63,58,.12)",
          }}
        >
          <BottomNavigation
            showLabels
            value={section}
            onChange={(_, value: Section) => setSection(value)}
            sx={{
              height: 72,
              "& .MuiBottomNavigationAction-root": {
                minWidth: 0,
                color: "#7A8783",
              },
              "& .Mui-selected": { color: "#123F3A" },
              "& .MuiBottomNavigationAction-label": {
                fontSize: 11,
                fontWeight: 700,
                mt: 0.25,
              },
              "& .MuiSvgIcon-root": { fontSize: 25 },
            }}
          >
            {navItems.map((item) => (
              <BottomNavigationAction
                key={item.value}
                value={item.value}
                label={item.label}
                icon={item.icon}
              />
            ))}
          </BottomNavigation>
        </Paper>
      )}
    </>
  );
};

import React from "react";
import { Alert, Box, Button, Drawer, IconButton, LinearProgress, Skeleton, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import LinkOutlined from "@mui/icons-material/LinkOutlined";
import NotificationsActiveOutlined from "@mui/icons-material/NotificationsActiveOutlined";

import {
  billingKeys,
  getBillingAccount,
  isPartiallyPaid,
  setBillingAutopay,
  type BillingAccount,
  type ScheduleRow,
} from "../../api/billing";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatPhoneDisplay } from "../../utility/phone";
import { formatDateRu, formatKGS } from "../../utility/format";
import { PayLinkDialog, PaymentDialog, RemindDialog } from "./dialogs";
import { StateChip, stateColor } from "./StateChip";

type Action = "payment" | "remind" | "payLink" | null;

/** Карточка лицевого счёта рассрочки: суммы, график, оплаты и действия. */
export function AccountDrawer({ accountId, canManage, onClose }: { accountId: number | null; canManage: boolean; onClose: () => void }) {
  return (
    <Drawer
      anchor="right"
      open={accountId != null}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: "100vw", md: 760 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      {accountId != null && <AccountContent key={accountId} accountId={accountId} canManage={canManage} onClose={onClose} />}
    </Drawer>
  );
}

function AccountContent({ accountId, canManage, onClose }: { accountId: number; canManage: boolean; onClose: () => void }) {
  const { t } = useT("billing");
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [action, setAction] = React.useState<Action>(null);

  const query = useQuery({
    queryKey: billingKeys.account(scope, accountId),
    queryFn: ({ signal }) => getBillingAccount(accountId, scope, signal),
    enabled: scope.orgReady !== false,
  });
  // После любого действия перечитываем счёт, таблицу и сводку — так велит контракт.
  const refresh = () => void queryClient.invalidateQueries({ queryKey: billingKeys.all });

  const autopay = useMutation({
    mutationFn: (on: boolean) => setBillingAutopay(accountId, on, scope),
    onSuccess: (next) => {
      enqueueSnackbar(next.autopay ? t("actions.autopayEnabled") : t("actions.autopayDisabled"), { variant: "success" });
      refresh();
    },
    onError: (error) => enqueueSnackbar(error instanceof Error ? error.message : t("actions.failed"), { variant: "error" }),
  });

  const account = query.data;

  return (
    <>
      <Box sx={{ px: { xs: 2, md: 3 }, pt: 2.5, pb: 2, display: "flex", alignItems: "flex-start", gap: 2, borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          {account ? (
            <>
              <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "primary.onSurface" }}>
                {t("account.eyebrow", { number: account.number })}
              </Typography>
              <Typography component="h2" sx={{ mt: 0.5, fontSize: "1.35rem", fontWeight: 700 }}>
                {account.buyer}
              </Typography>
              <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                {t("account.subtitle", { project: account.project, unit: account.unitNumber, contract: account.contract || account.number })}
              </Typography>
            </>
          ) : (
            <Skeleton width={260} height={56} />
          )}
        </Box>
        {account && (
          <Box sx={{ textAlign: "right" }}>
            <StateChip state={account.state} label={account.stateLabel || t(`state.${account.state}`)} />
            <Typography sx={{ mt: 0.75, fontSize: "0.75rem", color: "text.secondary" }}>
              {account.autopay ? t("account.autopayOn") : t("account.autopayOff")}
            </Typography>
          </Box>
        )}
        <IconButton aria-label={t("common.close")} onClick={onClose} sx={{ mt: -0.5, mr: -1 }}>
          <CloseOutlined />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", px: { xs: 2, md: 3 }, py: 2 }}>
        {query.isError ? (
          <Alert severity="error">
            {t("account.loadError")}: {query.error instanceof Error ? query.error.message : ""}
          </Alert>
        ) : !account ? (
          <Skeleton variant="rounded" height={420} />
        ) : (
          <AccountBody account={account} />
        )}
      </Box>

      {account && canManage && (
        <Box sx={{ px: { xs: 2, md: 3 }, py: 1.5, display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 1, borderTop: 1, borderColor: "divider" }}>
          <Button variant="outlined" startIcon={<NotificationsActiveOutlined />} onClick={() => setAction("remind")}>
            {t("actions.remind")}
          </Button>
          {/* Онлайн-оплата не настроена — ссылку не создать, кнопку не показываем. */}
          {account.payLinkEnabled && (
            <Button variant="outlined" startIcon={<LinkOutlined />} onClick={() => setAction("payLink")}>
              {t("actions.payLink")}
            </Button>
          )}
          <Button variant="outlined" disabled={autopay.isPending} onClick={() => autopay.mutate(!account.autopay)}>
            {account.autopay ? t("actions.autopayDisable") : t("actions.autopayEnable")}
          </Button>
          {account.state !== "completed" && (
            <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setAction("payment")}>
              {t("actions.accept")}
            </Button>
          )}
        </Box>
      )}

      {account && (
        <>
          <PaymentDialog open={action === "payment"} account={account} onClose={() => setAction(null)} onDone={refresh} />
          <RemindDialog open={action === "remind"} account={account} onClose={() => setAction(null)} onDone={refresh} />
          <PayLinkDialog open={action === "payLink"} account={account} onClose={() => setAction(null)} />
        </>
      )}
    </>
  );
}

const boxSx = { border: 1, borderColor: "divider", borderRadius: "12px", bgcolor: "background.paper" } as const;

function AccountBody({ account }: { account: BillingAccount }) {
  const { t } = useT("billing");
  const facts = [
    { label: t("account.price"), value: formatKGS(account.total) },
    {
      label: t("account.downPayment"),
      value: formatKGS(account.downPayment),
      hint: account.downPaymentDue > 0 ? t("account.downPaymentDue", { sum: formatKGS(account.downPaymentDue) }) : null,
    },
    { label: t("account.paidBySchedule"), value: formatKGS(account.paidAmount) },
    { label: t("account.outstanding"), value: formatKGS(account.outstanding) },
  ];
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" } }}>
        {facts.map((fact) => (
          <Box key={fact.label} sx={{ ...boxSx, p: 1.25, minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
              {fact.label}
            </Typography>
            <Typography noWrap sx={{ fontWeight: 700, fontSize: "0.9rem", fontVariantNumeric: "tabular-nums" }}>
              {fact.value}
            </Typography>
            {fact.hint && <Typography sx={{ fontSize: "0.7rem", color: "warning.onSurface" }}>{fact.hint}</Typography>}
          </Box>
        ))}
      </Box>

      <Box sx={(th) => ({ p: 1.5, borderRadius: "12px", bgcolor: subtleBg(th) })}>
        <Box sx={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
          <span>{t("account.progress", { pct: account.progress })}</span>
          <Box component="span" sx={{ fontWeight: 600 }}>
            {t("account.progressCount", { paid: account.paidCount, term: account.term })}
          </Box>
        </Box>
        <LinearProgress
          variant="determinate"
          value={account.progress}
          color={account.state === "overdue" ? "error" : account.state === "completed" ? "success" : "primary"}
          sx={{ my: 1, height: 6, borderRadius: 99 }}
        />
        {account.next && (
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
            {t("account.nextLine", { sum: formatKGS(account.next.balance || account.next.amount), date: formatDateRu(account.next.dueDate) })}
            {account.overdue > 0 && t("account.nextOverdue", { sum: formatKGS(account.overdue) })}
          </Typography>
        )}
      </Box>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 1.6fr) minmax(0, 1fr)" }, alignItems: "start" }}>
        <Box sx={{ ...boxSx, p: 1.5 }}>
          <Typography sx={{ fontWeight: 700 }}>{t("account.schedule")}</Typography>
          <Typography sx={{ mb: 1, fontSize: "0.75rem", color: "text.secondary" }}>{t("account.scheduleHint", { count: account.term })}</Typography>
          <ScheduleTable rows={account.schedule} />
        </Box>
        <Box sx={{ display: "grid", gap: 1.5 }}>
          <Box sx={{ ...boxSx, p: 1.5 }}>
            <Typography sx={{ fontWeight: 700 }}>{t("account.payments")}</Typography>
            <Typography sx={{ mb: 1, fontSize: "0.75rem", color: "text.secondary" }}>{t("account.paymentsHint")}</Typography>
            {account.payments.length === 0 ? (
              <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("account.paymentsEmpty")}</Typography>
            ) : (
              account.payments.map((payment) => (
                <Box key={payment.id} sx={{ py: 0.75, borderBottom: 1, borderColor: "divider", "&:last-of-type": { borderBottom: 0 } }}>
                  <Typography sx={{ fontWeight: 700, fontSize: "0.8125rem" }}>
                    {formatKGS(payment.amount)}
                    {payment.kind === "down_payment" && (
                      <Box component="span" sx={{ ml: 0.75, fontWeight: 400, color: "text.secondary" }}>
                        · {t("account.downPaymentKind")}
                      </Box>
                    )}
                  </Typography>
                  <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                    {payment.number} · {t("account.paymentLine", { date: formatDateRu(payment.date), method: payment.methodLabel })}
                  </Typography>
                </Box>
              ))
            )}
          </Box>
          <Box sx={(th) => ({ p: 1.5, borderRadius: "12px", bgcolor: subtleBg(th) })}>
            <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{t("account.buyer")}</Typography>
            <Typography sx={{ fontWeight: 700 }}>{account.phone ? formatPhoneDisplay(account.phone) : "—"}</Typography>
            {account.manager && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{t("account.manager", { name: account.manager })}</Typography>}
            {account.lastReminder && (
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{t("account.lastReminder", { date: formatDateRu(account.lastReminder) })}</Typography>
            )}
          </Box>
          {account.reminders.length > 0 && (
            <Box sx={{ ...boxSx, p: 1.5 }}>
              <Typography sx={{ mb: 0.5, fontWeight: 700 }}>{t("account.reminders")}</Typography>
              {account.reminders.map((reminder) => (
                <Typography key={reminder.id} sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                  {t("account.reminderLine", {
                    date: formatDateRu(reminder.sentAt),
                    channel: t(`channel.${reminder.channel}`, { defaultValue: reminder.channel }),
                  })}
                  {reminder.sentBy ? ` · ${reminder.sentBy}` : ""}
                </Typography>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

const rowState = (row: ScheduleRow) => (row.state !== "paid" && isPartiallyPaid(row) ? "partial" : row.state);

function ScheduleTable({ rows }: { rows: ScheduleRow[] }) {
  const { t } = useT("billing");
  const head = ["number", "date", "amount", "paid", "status"] as const;
  return (
    <Box sx={{ maxHeight: 420, overflowY: "auto" }}>
      <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr>
            {head.map((key) => (
              <Box
                component="th"
                key={key}
                sx={(th) => ({
                  position: "sticky",
                  top: 0,
                  py: 0.75,
                  px: 1,
                  textAlign: "left",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  color: "text.secondary",
                  bgcolor: th.palette.background.paper,
                  borderBottom: 1,
                  borderColor: "divider",
                })}
              >
                {t(`account.col.${key}`)}
              </Box>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const state = rowState(row);
            return (
              <Box
                component="tr"
                key={row.number}
                sx={(th) => ({
                  bgcolor: state === "overdue" ? alpha(th.palette.error.main, th.palette.mode === "dark" ? 0.14 : 0.06) : undefined,
                  "& td": { py: 0.75, px: 1, borderBottom: 1, borderColor: "divider" },
                })}
              >
                <td>{row.number}</td>
                <td>{formatDateRu(row.dueDate)}</td>
                <Box component="td" sx={{ fontWeight: 700 }}>
                  {formatKGS(row.amount)}
                </Box>
                <td>{formatKGS(row.paid)}</td>
                <Box component="td" sx={(th) => ({ fontWeight: 600, color: stateColor(th, state === "upcoming" ? "upcoming" : state).main })}>
                  {t(`account.row.${state}`)}
                </Box>
              </Box>
            );
          })}
        </tbody>
      </Box>
    </Box>
  );
}

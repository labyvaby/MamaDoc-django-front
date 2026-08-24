/**
 * RegistryRowDetails — раскрытие строки журнала на месте.
 *
 * Прежний реестр держал детали в правой колонке, которая половину времени
 * показывала «Выберите приём». Здесь строка разворачивается вниз: состав
 * визита, деньги и действия рядом с самой записью, соседние строки остаются
 * перед глазами. Полная карточка приёма (прививки, история цен, отзыв,
 * быстрые просмотры) открывается кнопкой — она никуда не делась.
 */
import React from "react";
import { Box, Button, Divider, Paper, Stack, Typography } from "@mui/material";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import OpenInFullOutlined from "@mui/icons-material/OpenInFullOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import dayjs from "dayjs";

import type { DjangoAppointment, AppointmentServiceLine } from "../../../../api/appointments";
import { formatQuantity } from "../../../../utility/format";
import { formatPhoneDisplay } from "../../../../utility/phone";
import { useT } from "../../../../i18n/VerticalProvider";
import { serviceLineTotal } from "../listFilters";
import { formatSom } from "./registryFormat";
import { moneyOf } from "./registryStats";

export interface RegistryRowActions {
  onPay: (appt: DjangoAppointment) => void;
  onEdit: (appt: DjangoAppointment) => void;
  onConclusion: (appt: DjangoAppointment) => void;
  onPrintInvoice: (appt: DjangoAppointment) => void;
  onOpenCard: (appt: DjangoAppointment) => void;
}

interface Props extends RegistryRowActions {
  appointment: DjangoAppointment;
  lines: AppointmentServiceLine[];
  canUpdate: boolean;
  canViewFinance: boolean;
  canManageFinance: boolean;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Paper elevation={0} variant="outlined" sx={{ p: 1.5, borderRadius: "10px", alignSelf: "start" }}>
    <Typography
      variant="caption"
      sx={{
        display: "block",
        mb: 1,
        color: "text.disabled",
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        fontWeight: 600,
        fontSize: "0.68rem",
      }}
    >
      {title}
    </Typography>
    {children}
  </Paper>
);

const MoneyRow: React.FC<{ label: string; value: string; strong?: boolean; accent?: string }> = ({
  label,
  value,
  strong,
  accent,
}) => (
  <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ py: 0.5 }}>
    <Typography variant={strong ? "body2" : "caption"} color={strong ? "text.primary" : "text.secondary"}>
      {label}
    </Typography>
    <Typography
      variant="body2"
      sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", color: accent ?? "text.primary" }}
    >
      {value}
    </Typography>
  </Stack>
);

export const RegistryRowDetails: React.FC<Props> = ({
  appointment: appt,
  lines,
  canUpdate,
  canViewFinance,
  canManageFinance,
  onPay,
  onEdit,
  onConclusion,
  onPrintInvoice,
  onOpenCard,
}) => {
  const { t } = useT("appointments");

  const money = moneyOf(appt, lines);
  const charged = parseFloat(appt.totalAmount ?? "") || 0;
  const discount = parseFloat(appt.discountAmount ?? "") || 0;
  const paid = parseFloat(appt.paidTotal ?? "") || 0;
  const payable = parseFloat(appt.payableAmount ?? "") || charged - discount;
  const rest = Math.max(0, payable - paid);

  const consumptions = lines.flatMap((line) => line.consumptions ?? []);
  const hasConclusion =
    appt.hasMedicalConclusion === true ||
    lines.some((line) => line.conclusionState === "draft" || line.conclusionState === "completed");
  const needsConclusion = lines.some((line) => line.requiresConclusion);

  return (
    <Box
      sx={{
        px: 2,
        pb: 2,
        pt: 0.5,
        bgcolor: "background.default",
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 0.9fr)" },
          gap: 1.5,
          mt: 1.5,
        }}
      >
        <Section title={t("journal.details.composition")}>
          {lines.map((line) => (
            <Stack
              key={line.id}
              direction="row"
              alignItems="baseline"
              gap={1.5}
              sx={{ py: 0.75, borderBottom: "1px dashed", borderColor: "divider", "&:last-of-type": { borderBottom: 0 } }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2">
                  {line.service?.name ?? "—"}
                  {line.quantity > 1 && (
                    <Box component="span" sx={{ color: "text.disabled" }}> × {line.quantity}</Box>
                  )}
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  {line.employee?.fullName ?? t("journal.details.noPerformer")}
                </Typography>
              </Box>
              {canViewFinance && (
                <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {formatSom(serviceLineTotal(line))}
                </Typography>
              )}
            </Stack>
          ))}

          {appt.productLines.length > 0 && (
            <>
              <Divider sx={{ my: 1 }} />
              <Typography variant="caption" color="text.disabled" display="block" sx={{ mb: 0.5 }}>
                {t("journal.details.products")}
              </Typography>
              {appt.productLines.map((product) => (
                <Stack key={product.id} direction="row" justifyContent="space-between" sx={{ py: 0.25 }}>
                  <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }}>
                    {product.product?.name ?? "—"}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    ×{formatQuantity(product.quantity)}
                  </Typography>
                </Stack>
              ))}
            </>
          )}

          {consumptions.length > 0 && (
            <>
              <Divider sx={{ my: 1 }} />
              <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 0.5 }}>
                <Inventory2Outlined sx={{ fontSize: 15, color: "text.disabled" }} />
                <Typography variant="caption" color="text.disabled">
                  {t("journal.details.consumptions")}
                </Typography>
              </Stack>
              {consumptions.map((item) => (
                <Stack key={item.id} direction="row" justifyContent="space-between" sx={{ py: 0.25 }}>
                  <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }}>
                    {item.name}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    {formatQuantity(item.quantity)} {item.unit}
                  </Typography>
                </Stack>
              ))}
            </>
          )}

          {(appt.complaints || appt.adminComment) && (
            <>
              <Divider sx={{ my: 1 }} />
              <Typography variant="body2" color="text.secondary">
                {appt.complaints || appt.adminComment}
              </Typography>
            </>
          )}

          <Stack direction="row" gap={1.5} flexWrap="wrap" sx={{ mt: 1.5, pt: 1, borderTop: 1, borderColor: "divider" }}>
            <Typography variant="caption" color="text.disabled">
              {t("journal.details.createdAt", { at: dayjs(appt.createdAt).format("DD.MM.YY HH:mm") })}
            </Typography>
            {appt.patient?.phone && (
              <Typography variant="caption" color="text.disabled">
                {formatPhoneDisplay(appt.patient.phone)}
              </Typography>
            )}
            {appt.branchName && (
              <Typography variant="caption" color="text.disabled">
                {appt.branchName}
              </Typography>
            )}
          </Stack>
        </Section>

        {canViewFinance && (
          <Section title={t("journal.details.money")}>
            <MoneyRow label={t("journal.details.charged")} value={formatSom(charged)} />
            {discount > 0 && (
              <MoneyRow label={t("journal.details.discount")} value={`−${formatSom(discount)}`} />
            )}
            <MoneyRow label={t("journal.details.paid")} value={formatSom(paid)} />
            <Divider sx={{ my: 0.5 }} />
            <MoneyRow
              label={rest > 0 ? t("journal.details.rest") : t("journal.details.total")}
              value={formatSom(rest > 0 ? rest : payable)}
              strong
              accent={rest > 0 ? "warning.main" : undefined}
            />
            {money.accrued > 0 && lines.length < appt.services.length && (
              <Typography variant="caption" color="text.disabled" display="block" sx={{ mt: 0.5 }}>
                {t("journal.details.sliceShare", { amount: formatSom(money.accrued) })}
              </Typography>
            )}
          </Section>
        )}

        <Section title={t("journal.details.actions")}>
          <Stack gap={0.75}>
            {canManageFinance && rest > 0 && (
              <Button
                variant="contained"
                size="small"
                startIcon={<PaymentsOutlined />}
                onClick={() => onPay(appt)}
                sx={{ justifyContent: "flex-start" }}
              >
                {t("journal.actions.pay")}
              </Button>
            )}
            {(hasConclusion || needsConclusion) && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<DescriptionOutlined />}
                onClick={() => onConclusion(appt)}
                sx={{ justifyContent: "flex-start" }}
              >
                {hasConclusion ? t("journal.actions.openConclusion") : t("journal.actions.fillConclusion")}
              </Button>
            )}
            {canUpdate && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<EditOutlined />}
                onClick={() => onEdit(appt)}
                sx={{ justifyContent: "flex-start" }}
              >
                {t("journal.actions.edit")}
              </Button>
            )}
            {canViewFinance && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<ReceiptLongOutlined />}
                onClick={() => onPrintInvoice(appt)}
                sx={{ justifyContent: "flex-start" }}
              >
                {t("journal.actions.printInvoice")}
              </Button>
            )}
            <Button
              variant="outlined"
              size="small"
              startIcon={<OpenInFullOutlined />}
              onClick={() => onOpenCard(appt)}
              sx={{ justifyContent: "flex-start" }}
            >
              {t("journal.actions.openCard")}
            </Button>
          </Stack>
        </Section>
      </Box>
    </Box>
  );
};

export default RegistryRowDetails;

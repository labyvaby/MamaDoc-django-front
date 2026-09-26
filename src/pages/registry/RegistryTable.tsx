import React from "react";
import {
  Box,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import MoreVertOutlined from "@mui/icons-material/MoreVertOutlined";
import dayjs from "dayjs";

import type { PaymentState, RegistryRow } from "../../api/registry";
import { termDue } from "../../api/registry";
import { TonedChip, type ToneName } from "../../components/ui";
import { useT } from "../../i18n/VerticalProvider";
import { formatPhoneDisplay } from "../../utility/phone";
import { actionsForRow, type RowAction } from "./registryActions";
import { formatAge, formatMoney } from "./registryTabs";

export type { RowAction } from "./registryActions";

const PAYMENT_TONE: Record<PaymentState, ToneName> = {
  none: "error",
  unpaid: "warning",
  partial: "warning",
  paid: "success",
};

interface RegistryTableProps {
  rows: RegistryRow[];
  canManage: boolean;
  onAction: (action: RowAction, row: RegistryRow) => void;
}

function isLapsed(row: RegistryRow): boolean {
  return row.expiresAt != null && dayjs(row.expiresAt).isBefore(dayjs());
}

const StatusChips: React.FC<{ row: RegistryRow }> = ({ row }) => {
  const { t } = useT("registry");
  const chips: React.ReactNode[] = [];
  if (row.status === "cancelled") {
    chips.push(
      <Chip
        key="cancelled"
        size="small"
        label={t("status.cancelled", { reason: t(`cancelReasons.${row.cancelReason || "other"}`) })}
      />,
    );
  } else {
    if (row.status === "paused") chips.push(<Chip key="paused" size="small" label={t("status.paused")} />);
    if (isLapsed(row)) chips.push(<Chip key="lapsed" size="small" color="error" label={t("status.lapsed")} />);
    if (!row.onboardingCompletedAt) {
      chips.push(<Chip key="onboarding" size="small" color="warning" label={t("status.onboardingPending")} />);
    }
  }
  if (!chips.length) return null;
  return (
    <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
      {chips}
    </Stack>
  );
};

const PaymentCell: React.FC<{ row: RegistryRow }> = ({ row }) => {
  const { t } = useT("registry");
  const due = row.currentTerm ? termDue(row.currentTerm) : 0;
  return (
    <Stack gap={0.25} alignItems="flex-start">
      <TonedChip toneName={PAYMENT_TONE[row.paymentState]} label={t(`payment.${row.paymentState}`)} />
      {due > 0 && (
        <Typography variant="caption" color="text.secondary">
          {t("payment.due", { amount: formatMoney(due) })}
        </Typography>
      )}
    </Stack>
  );
};

function termLabel(row: RegistryRow): string {
  if (!row.currentTerm) return "—";
  return `${dayjs(row.currentTerm.startsOn).format("DD.MM.YY")} – ${dayjs(row.currentTerm.endsOn).format("DD.MM.YY")}`;
}

function programLabel(row: RegistryRow): string {
  const pkg = row.currentTerm?.package;
  return pkg ? `${row.program.name} · ${pkg.name}` : row.program.name;
}

export const RegistryTable: React.FC<RegistryTableProps> = ({ rows, canManage, onAction }) => {
  const { t } = useT("registry");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [menu, setMenu] = React.useState<{ anchor: HTMLElement; row: RegistryRow } | null>(null);

  const menuButton = (row: RegistryRow) => (
    <IconButton
      size="small"
      aria-label={t("actions.menu")}
      onClick={(event) => setMenu({ anchor: event.currentTarget, row })}
    >
      <MoreVertOutlined fontSize="small" />
    </IconButton>
  );

  const contact = (row: RegistryRow) =>
    row.primaryContact ? (
      <>
        <Typography variant="body2">
          {t(`relations.${row.primaryContact.relation}`)} · {row.primaryContact.fullName}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatPhoneDisplay(row.primaryContact.phone)}
        </Typography>
      </>
    ) : (
      <Typography variant="caption" color="text.secondary">
        {formatPhoneDisplay(row.patient.phone)}
      </Typography>
    );

  const patientTitle = (row: RegistryRow) => (
    <>
      <Typography variant="body2" fontWeight={600}>
        {row.patient.fullName}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {formatAge(row.patient.birthDate)}
        {row.patient.cardNumber ? ` · № ${row.patient.cardNumber}` : ""}
      </Typography>
      <StatusChips row={row} />
    </>
  );

  const lastVisit = (row: RegistryRow) =>
    row.lastVisitAt
      ? t("columns.lastVisit", { date: dayjs(row.lastVisitAt).format("DD.MM.YY") })
      : t("columns.noVisits");

  const lastTouch = (row: RegistryRow) => (
    <Stack gap={0.25}>
      <Typography variant="caption">
        {row.lastInteraction
          ? `${dayjs(row.lastInteraction.occurredAt).format("DD.MM.YY")} · ${t(`channels.${row.lastInteraction.channel}`)}`
          : "—"}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {lastVisit(row)}
      </Typography>
    </Stack>
  );

  return (
    <>
      {isMobile ? (
        <Stack gap={1}>
          {rows.map((row) => (
            <Paper key={row.enrollmentId} variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" alignItems="flex-start" gap={1}>
                <Box sx={{ flex: 1, minWidth: 0 }}>{patientTitle(row)}</Box>
                {menuButton(row)}
              </Stack>
              <Box sx={{ mt: 1 }}>{contact(row)}</Box>
              <Stack direction="row" gap={1.5} alignItems="center" flexWrap="wrap" sx={{ mt: 1 }}>
                <PaymentCell row={row} />
                <Typography variant="caption" color="text.secondary">
                  {termLabel(row)}
                </Typography>
                {row.currentTerm?.package && (
                  <Typography variant="caption" color="text.secondary">
                    {row.currentTerm.package.name}
                  </Typography>
                )}
                {row.responsibleEmployee && (
                  <Typography variant="caption" color="text.secondary">
                    {row.responsibleEmployee.fullName}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  {lastVisit(row)}
                </Typography>
              </Stack>
            </Paper>
          ))}
        </Stack>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t("columns.patient")}</TableCell>
              <TableCell>{t("columns.contact")}</TableCell>
              <TableCell>{t("columns.program")}</TableCell>
              <TableCell>{t("columns.doctor")}</TableCell>
              <TableCell>{t("columns.term")}</TableCell>
              <TableCell>{t("columns.payment")}</TableCell>
              <TableCell>{t("columns.lastTouch")}</TableCell>
              <TableCell align="right" aria-label={t("columns.actions")} />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.enrollmentId} hover>
                <TableCell sx={{ verticalAlign: "top" }}>{patientTitle(row)}</TableCell>
                <TableCell sx={{ verticalAlign: "top" }}>{contact(row)}</TableCell>
                <TableCell sx={{ verticalAlign: "top" }}>{programLabel(row)}</TableCell>
                <TableCell sx={{ verticalAlign: "top" }}>{row.responsibleEmployee?.fullName ?? "—"}</TableCell>
                <TableCell sx={{ verticalAlign: "top", whiteSpace: "nowrap" }}>{termLabel(row)}</TableCell>
                <TableCell sx={{ verticalAlign: "top" }}>
                  <PaymentCell row={row} />
                </TableCell>
                <TableCell sx={{ verticalAlign: "top" }}>{lastTouch(row)}</TableCell>
                <TableCell align="right" sx={{ verticalAlign: "top" }}>
                  {menuButton(row)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Menu open={menu !== null} anchorEl={menu?.anchor ?? null} onClose={() => setMenu(null)}>
        {menu &&
          actionsForRow(menu.row, canManage).map((action) => (
            <MenuItem
              key={action}
              onClick={() => {
                onAction(action, menu.row);
                setMenu(null);
              }}
            >
              {t(`actions.${action}`)}
            </MenuItem>
          ))}
      </Menu>
    </>
  );
};

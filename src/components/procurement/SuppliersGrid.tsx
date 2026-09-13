import React from "react";
import { Box, Button, Chip, IconButton, Paper, Stack, Tooltip, Typography, alpha } from "@mui/material";
import StorefrontOutlined from "@mui/icons-material/StorefrontOutlined";
import PersonOutlined from "@mui/icons-material/PersonOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import MailOutlined from "@mui/icons-material/MailOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";

import type { ProcurementSupplier } from "../../api/procurement";
import { subtleBg } from "../../theme/uiHelpers";
import { ListEmptyState, ListLoadingSkeleton } from "../ui";
import { StatusChip, formatMoney, formatShortDateTime, initialOf } from "./meta";

type SupplierFilter = "all" | "debt" | "clear" | "inactive";

export interface SuppliersGridProps {
  suppliers: ProcurementSupplier[];
  loading: boolean;
  errorMessage?: string | null;
  canManage: boolean;
  canPay: boolean;
  onAdd?: () => void;
  onEdit: (supplier: ProcurementSupplier) => void;
  onPay: (supplier: ProcurementSupplier) => void;
  onShowReceipts: (supplier: ProcurementSupplier) => void;
}

const Line: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0, color: "text.secondary" }}>
    <Box sx={{ display: "flex", color: "text.disabled", "& .MuiSvgIcon-root": { fontSize: 16 } }}>{icon}</Box>
    <Typography variant="body2" color="text.secondary" noWrap>
      {children}
    </Typography>
  </Stack>
);

/** Справочник поставщиков карточками: реквизиты, контакт, долг и действия. */
export const SuppliersGrid: React.FC<SuppliersGridProps> = ({ suppliers, loading, errorMessage, canManage, canPay, onAdd, onEdit, onPay, onShowReceipts }) => {
  const [filter, setFilter] = React.useState<SupplierFilter>("all");
  const withDebt = suppliers.filter((s) => Number(s.payable ?? 0) > 0);
  const inactive = suppliers.filter((s) => !s.isActive);
  const visible = suppliers.filter((s) => {
    if (filter === "debt") return Number(s.payable ?? 0) > 0;
    if (filter === "clear") return s.isActive && Number(s.payable ?? 0) <= 0;
    if (filter === "inactive") return !s.isActive;
    return true;
  });
  const options: { value: SupplierFilter; label: string; count: number }[] = [
    { value: "all", label: "Все", count: suppliers.length },
    { value: "debt", label: "С задолженностью", count: withDebt.length },
    { value: "clear", label: "Без долга", count: suppliers.length - withDebt.length - inactive.filter((s) => Number(s.payable ?? 0) <= 0).length },
    { value: "inactive", label: "Неактивные", count: inactive.length },
  ];

  return (
    <Paper elevation={0} variant="outlined" sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 1.5, borderBottom: 1, borderColor: "divider", gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Поставщики{" "}
            <Typography component="span" variant="subtitle1" color="text.secondary" sx={{ fontWeight: 400 }}>
              ({suppliers.length})
            </Typography>
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            Справочник организации · долг = приёмки − возвраты − оплаты
          </Typography>
        </Box>
      </Stack>
      <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: "divider" }}>
        {options.map((o) => {
          const active = filter === o.value;
          return (
            <Chip
              key={o.value}
              size="small"
              clickable
              label={`${o.label} · ${o.count}`}
              onClick={() => setFilter(o.value)}
              sx={(t) => ({
                height: 26,
                borderRadius: "8px",
                fontWeight: 500,
                border: 1,
                borderColor: active ? alpha(t.palette.primary.main, 0.4) : "divider",
                color: active ? "primary.onSurface" : "text.secondary",
                bgcolor: active ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.08) : "transparent",
                "&:hover": { bgcolor: active ? alpha(t.palette.primary.main, 0.12) : subtleBg(t, true) },
              })}
            />
          );
        })}
      </Stack>

      <Box sx={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
        {loading ? (
          <ListLoadingSkeleton rows={4} />
        ) : errorMessage ? (
          <ListEmptyState icon={<StorefrontOutlined />} title="Не удалось загрузить поставщиков" description={errorMessage} />
        ) : visible.length === 0 ? (
          <ListEmptyState
            icon={<StorefrontOutlined />}
            title={suppliers.length === 0 ? "Поставщиков пока нет" : "Ничего не найдено"}
            description={suppliers.length === 0 ? "Добавьте поставщика — или он появится сам при первой накладной." : "Под выбранный фильтр поставщиков нет."}
            action={
              suppliers.length === 0 && onAdd ? (
                <Button variant="contained" size="small" startIcon={<AddOutlined />} onClick={onAdd}>
                  Новый поставщик
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" }, gap: 1.5, p: 1.5 }}>
            {visible.map((supplier) => {
              const payable = Number(supplier.payable ?? 0);
              return (
                <Box
                  key={supplier.id}
                  sx={(t) => ({
                    display: "flex",
                    flexDirection: "column",
                    gap: 1.25,
                    p: 1.75,
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                    bgcolor: "background.paper",
                    opacity: supplier.isActive ? 1 : 0.6,
                    transition: "border-color .15s ease",
                    "&:hover": { borderColor: alpha(t.palette.primary.main, 0.28) },
                  })}
                >
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    <Box
                      sx={(t) => ({
                        width: 40,
                        height: 40,
                        borderRadius: "10px",
                        flexShrink: 0,
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 600,
                        bgcolor: alpha(t.palette.primary.main, 0.1),
                        color: "primary.onSurface",
                      })}
                    >
                      {initialOf(supplier.name)}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {supplier.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace", letterSpacing: 0.3 }} noWrap>
                        {supplier.taxId ? `ИНН ${supplier.taxId}` : "ИНН не указан"}
                      </Typography>
                    </Box>
                    <StatusChip tone={supplier.isActive ? "success" : "neutral"} label={supplier.isActive ? "Активен" : "Неактивен"} />
                  </Stack>

                  <Stack spacing={0.5}>
                    <Line icon={<PersonOutlined />}>{supplier.contactPerson || "—"}</Line>
                    <Line icon={<PhoneOutlined />}>{supplier.phone || "—"}</Line>
                    <Line icon={<MailOutlined />}>{supplier.email || "—"}</Line>
                    <Line icon={<ScheduleOutlined />}>
                      {[supplier.paymentTerms, supplier.defaultCurrency].filter(Boolean).join(" · ") || "—"}
                    </Line>
                  </Stack>

                  <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} sx={{ pt: 1.25, borderTop: 1, borderColor: "divider" }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Задолженность
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: payable > 0 ? "error.onSurface" : payable < 0 ? "info.onSurface" : "success.onSurface", fontVariantNumeric: "tabular-nums" }}>
                        {formatMoney(payable)} сом
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Накладных
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {supplier.receiptsCount ?? 0}
                        {supplier.lastReceivedAt && (
                          <Typography component="span" variant="caption" color="text.secondary">
                            {" "}
                            · {formatShortDateTime(supplier.lastReceivedAt).split(",")[0]}
                          </Typography>
                        )}
                      </Typography>
                    </Box>
                    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ ml: "auto" }}>
                      {canPay && payable > 0 ? (
                        <Button size="small" variant="text" onClick={() => onPay(supplier)}>
                          Оплатить
                        </Button>
                      ) : (
                        <Button size="small" variant="text" onClick={() => onShowReceipts(supplier)}>
                          Накладные
                        </Button>
                      )}
                      {canManage && (
                        <Tooltip title="Изменить">
                          <IconButton size="small" onClick={() => onEdit(supplier)} aria-label="Изменить поставщика">
                            <EditOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </Stack>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Paper>
  );
};

export default SuppliersGrid;

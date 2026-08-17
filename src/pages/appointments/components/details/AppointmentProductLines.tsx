import React from "react";
import { Avatar, Box, Chip, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import VaccinesOutlined from "@mui/icons-material/VaccinesOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";

import type { AppointmentProductLine } from "../../../../api/appointments";
import { subtleBg } from "../../../../theme";
import { useT } from "../../../../i18n/VerticalProvider";

/** Вакцина, к которой привязан товар склада (метка «вакцина» в карточке товара). */
export interface ProductVaccineRef {
  vaccineId: number;
  vaccineName: string;
}

export interface AppointmentProductLinesProps {
  lines: AppointmentProductLine[];
  /** Форматирование суммы строки (валюта настроена в вызывающем). */
  formatAmount: (value: string | number | null | undefined) => string;
  /** Есть право на справочник товаров — тогда строка открывает карточку. */
  clickable?: boolean;
  onProductClick?: (productId: number, productName: string) => void;
  /** productId → вакцина справочника (товар с меткой «вакцина»). */
  vaccineByProductId?: Map<number, ProductVaccineRef>;
  /** vaccineId → сколько прививок этой вакцины уже внесено по этому приёму. */
  recordedByVaccineId?: Map<number, number>;
}

/** Товары, проданные в рамках визита (списываются со склада). */
const AppointmentProductLines: React.FC<AppointmentProductLinesProps> = ({
  lines,
  formatAmount,
  clickable,
  onProductClick,
  vaccineByProductId,
  recordedByVaccineId,
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();

  const visible = React.useMemo(
    () => lines.filter((pl) => pl.status !== "canceled"),
    [lines],
  );

  /**
   * Сколько доз каждой вакцины уже покрыто записями в карте. Идём по строкам и
   * «расходуем» счётчик: две строки одной вакцины при одной записи не должны
   * обе показывать «внесена».
   */
  const coverage = React.useMemo(() => {
    const left = new Map(recordedByVaccineId ?? []);
    return visible.map((pl) => {
      const vaccine = vaccineByProductId?.get(pl.product?.id ?? -1);
      if (!vaccine) return null;
      const qty = Number(pl.quantity) || 1;
      const available = left.get(vaccine.vaccineId) ?? 0;
      const covered = Math.min(qty, available);
      left.set(vaccine.vaccineId, available - covered);
      return { vaccine, recorded: covered >= qty };
    });
  }, [visible, vaccineByProductId, recordedByVaccineId]);

  if (visible.length === 0) return null;

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" gutterBottom display="block">
        {t("details.products")}
      </Typography>
      <Stack spacing={1}>
        {visible.map((pl, i) => {
          const canOpen = Boolean(clickable && pl.product?.id != null && onProductClick);
          const vaccineInfo = coverage[i];
          return (
            <Paper
              key={pl.id}
              variant="outlined"
              onClick={canOpen ? () => onProductClick!(pl.product.id, pl.product.name) : undefined}
              sx={{
                p: 1.5,
                pl: 2,
                bgcolor: "background.paper",
                borderRadius: 1.5,
                // Клик открывает карточку товара — как у услуг; без права на
                // справочник строка остаётся некликабельной.
                cursor: canOpen ? "pointer" : "default",
                transition: "background-color 0.2s",
                ...(canOpen && { "&:hover": { bgcolor: subtleBg(theme) } }),
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Avatar
                  variant="rounded"
                  sx={{
                    width: 40,
                    height: 40,
                    bgcolor: "action.selected",
                    color: "text.secondary",
                    flexShrink: 0,
                  }}
                >
                  {vaccineInfo ? (
                    <VaccinesOutlined fontSize="small" />
                  ) : (
                    <Inventory2Outlined fontSize="small" />
                  )}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {pl.product?.name ?? "—"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    × {pl.quantity}
                    {pl.product?.unit ? ` ${pl.product.unit}` : ""}
                    {vaccineInfo ? ` · ${t("details.vaccineLine")}` : ""}
                  </Typography>
                </Box>
                <Typography variant="body2" fontWeight={700} sx={{ flexShrink: 0 }}>
                  {formatAmount(pl.lineTotal)}
                </Typography>
              </Box>

              {/* Товар помечен как вакцина: видно, внесена ли прививка в карту.
                  Оформить её отсюда нельзя — createRecord всегда добавляет в счёт
                  СВОЮ строку и списывает партию, так что по уже проданному товару
                  получился бы дубль денег и минус две дозы вместо одной (проверено
                  на живом API 17.08.2026). Поэтому здесь только индикация. */}
              {vaccineInfo && (
                <Stack
                  direction="row"
                  alignItems="center"
                  gap={1}
                  sx={{ mt: 1, ml: 7, flexWrap: "wrap" }}
                >
                  {vaccineInfo.recorded ? (
                    <Tooltip title={t("details.vaccineRecordedHint")}>
                      <Chip
                        size="small"
                        variant="outlined"
                        color="success"
                        icon={<CheckCircleOutlined sx={{ fontSize: 16 }} />}
                        label={t("details.vaccineRecorded")}
                        sx={{ borderRadius: "7px" }}
                      />
                    </Tooltip>
                  ) : (
                    <Tooltip title={t("details.vaccineNotRecordedHint")}>
                      <Chip
                        size="small"
                        variant="outlined"
                        color="warning"
                        icon={<WarningAmberOutlined sx={{ fontSize: 16 }} />}
                        label={t("details.vaccineNotRecorded")}
                        sx={{ borderRadius: "7px" }}
                      />
                    </Tooltip>
                  )}
                </Stack>
              )}
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
};

export default AppointmentProductLines;

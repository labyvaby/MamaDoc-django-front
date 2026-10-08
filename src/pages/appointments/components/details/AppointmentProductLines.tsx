import React from "react";
import { Chip, Stack, Tooltip } from "@mui/material";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import VaccinesOutlined from "@mui/icons-material/VaccinesOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";

import type { AppointmentProductLine } from "../../../../api/appointments";
import { useT } from "../../../../i18n/VerticalProvider";
import { BILL_INDENT, BillGroupHeader, BillRow } from "./AppointmentBill";

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
  /** vaccineId → сколько доз этой вакцины уже внесено по этому приёму. */
  recordedByVaccineId?: Map<number, number>;
  /** id строк счёта, уже закрытых записью о вакцине (точная привязка). */
  recordedLineIds?: Set<number>;
  /** Оформить вакцину по этой строке; не задан — только индикация. */
  onRecordVaccine?: (vaccineId: number, line: AppointmentProductLine) => void;
}

/**
 * Товары, проданные в рамках визита (списываются со склада), — группа строк
 * внутри чека `AppointmentBill`.
 */
const AppointmentProductLines: React.FC<AppointmentProductLinesProps> = ({
  lines,
  formatAmount,
  clickable,
  onProductClick,
  vaccineByProductId,
  recordedByVaccineId,
  recordedLineIds,
  onRecordVaccine,
}) => {
  const { t } = useT("appointments");

  const visible = React.useMemo(
    () => lines.filter((pl) => pl.status !== "canceled"),
    [lines],
  );

  /**
   * Закрыта ли строка записью в карте. Приоритет у точной привязки
   * (record.productLineId), счётчик по вакцине — только для старых записей без
   * неё: две строки одной вакцины при одной записи не должны обе показывать
   * «внесена». Строка-вакцина без карточки в справочнике опознаётся по
   * product.isVaccine — оформить её нельзя (нет vaccineId), но предупредить надо.
   */
  const coverage = React.useMemo(() => {
    const left = new Map(recordedByVaccineId ?? []);
    return visible.map((pl) => {
      const vaccine = vaccineByProductId?.get(pl.product?.id ?? -1);
      if (!vaccine) return pl.product?.isVaccine ? { vaccine: null, recorded: false } : null;
      if (recordedLineIds?.has(pl.id)) return { vaccine, recorded: true };
      const qty = Number(pl.quantity) || 1;
      const available = left.get(vaccine.vaccineId) ?? 0;
      const covered = Math.min(qty, available);
      left.set(vaccine.vaccineId, available - covered);
      return { vaccine, recorded: covered >= qty };
    });
  }, [visible, vaccineByProductId, recordedByVaccineId, recordedLineIds]);

  if (visible.length === 0) return null;

  return (
    <Stack spacing={1.25}>
      <BillGroupHeader
        avatar={<Inventory2Outlined sx={{ fontSize: 14 }} />}
        label={t("details.products")}
      />
      {visible.map((pl, i) => {
        const canOpen = Boolean(clickable && pl.product?.id != null && onProductClick);
        const vaccineInfo = coverage[i];
        return (
          <Stack key={pl.id} spacing={1}>
            {/* Клик открывает карточку товара — как у услуг; без права на
                справочник строка остаётся некликабельной. */}
            <BillRow
              thumb={
                vaccineInfo ? (
                  <VaccinesOutlined sx={{ fontSize: 18 }} />
                ) : (
                  <Inventory2Outlined sx={{ fontSize: 18 }} />
                )
              }
              title={pl.product?.name ?? "—"}
              subtitle={`× ${pl.quantity}${pl.product?.unit ? ` ${pl.product.unit}` : ""}${
                vaccineInfo ? ` · ${t("details.vaccineLine")}` : ""
              }`}
              amount={formatAmount(pl.lineTotal)}
              onClick={canOpen ? () => onProductClick!(pl.product.id, pl.product.name) : undefined}
            />

            {/* Товар помечен как вакцина: видно, внесена ли запись в карту.
                С 21.08.2026 оформить можно прямо отсюда — запись привязывается
                к этой строке счёта (productLineId), повторного биллинга и
                списания партии не будет. */}
            {vaccineInfo && (
              <Stack direction="row" alignItems="center" gap={1} sx={{ pl: BILL_INDENT, flexWrap: "wrap" }}>
                {vaccineInfo.recorded ? (
                  <Tooltip title={t("details.vaccineRecordedHint")}>
                    <Chip
                      size="small"
                      variant="outlined"
                      color="success"
                      icon={<CheckCircleOutlined sx={{ fontSize: 16 }} />}
                      label={t("details.vaccineRecorded")}
                      sx={{ borderRadius: "8px" }}
                    />
                  </Tooltip>
                ) : (
                  <>
                    <Tooltip title={t("details.vaccineNotRecordedHint")}>
                      <Chip
                        size="small"
                        variant="outlined"
                        color="warning"
                        icon={<WarningAmberOutlined sx={{ fontSize: 16 }} />}
                        label={t("details.vaccineNotRecorded")}
                        sx={{ borderRadius: "8px" }}
                      />
                    </Tooltip>
                    {vaccineInfo.vaccine && onRecordVaccine && (
                      <Chip
                        size="small"
                        color="primary"
                        icon={<VaccinesOutlined sx={{ fontSize: 16 }} />}
                        label="Оформить"
                        onClick={() => onRecordVaccine(vaccineInfo.vaccine!.vaccineId, pl)}
                        sx={{ borderRadius: "8px" }}
                      />
                    )}
                  </>
                )}
              </Stack>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
};

export default AppointmentProductLines;

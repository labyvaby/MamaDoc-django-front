/**
 * Период отчёта: «С — По» и быстрые кнопки, как в «Собственнику». Обе даты
 * включительно; отчётам с исключающим концом (reports/properties/) день
 * добавляет вызывающий код. Период живёт в адресе (?from=&to=).
 */
import React from "react";
import { Button, Stack } from "@mui/material";
import dayjs from "dayjs";

import { CustomDatePicker } from "../components/ui";

const D = (d: dayjs.Dayjs) => d.format("YYYY-MM-DD");

export const ReportPeriodPicker: React.FC<{ from: string; to: string; onChange: (from: string, to: string) => void }> = ({ from, to, onChange }) => {
  const today = dayjs();
  const presets = [
    { label: "Этот месяц", from: D(today.startOf("month")), to: D(today) },
    { label: "Прошлый месяц", from: D(today.subtract(1, "month").startOf("month")), to: D(today.subtract(1, "month").endOf("month")) },
    { label: "30 дней", from: D(today.subtract(29, "day")), to: D(today) },
    { label: "Год", from: D(today.startOf("year")), to: D(today) },
  ];
  return (
    <Stack direction={{ xs: "column", md: "row" }} gap={1.5} alignItems={{ md: "center" }} flexWrap="wrap">
      <Stack direction="row" alignItems="center" gap={1}>
        <CustomDatePicker label="С" value={dayjs(from)} onChange={(v) => v && onChange(D(v), D(v) > to ? D(v) : to)} slotProps={{ textField: { size: "small" } }} sx={{ width: 150 }} />
        <CustomDatePicker label="По" value={dayjs(to)} minDate={dayjs(from)} onChange={(v) => v && onChange(from, D(v))} slotProps={{ textField: { size: "small" } }} sx={{ width: 150 }} />
      </Stack>
      <Stack direction="row" gap={0.5} flexWrap="wrap">
        {presets.map((p) => (
          <Button key={p.label} size="small" variant={p.from === from && p.to === to ? "contained" : "text"} disableElevation onClick={() => onChange(p.from, p.to)} sx={{ borderRadius: "8px" }}>
            {p.label}
          </Button>
        ))}
      </Stack>
    </Stack>
  );
};

export default ReportPeriodPicker;

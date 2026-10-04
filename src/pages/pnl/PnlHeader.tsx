import { Box, IconButton, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";

import { AppButton } from "../../components/ui/AppButton";
import { DateRangeField } from "../../components/ui";
import {
  customPeriod, periodFor, periodTitle, shiftPeriod, type PnlPeriod, type PnlPeriodMode,
} from "../../features/pnl/period";

const MODES: { value: PnlPeriodMode; label: string }[] = [
  { value: "month", label: "Месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "year", label: "Год" },
  { value: "custom", label: "Период" },
];

interface Props {
  period: PnlPeriod;
  onPeriod: (period: PnlPeriod) => void;
  branchLabel: string;
  exporting: "excel" | "form2" | null;
  canExport: boolean;
  onExcel: () => void;
  onForm2: () => void;
}

/** Шапка: заголовок, филиал, период (месяц / квартал / год / свои даты), выгрузки. */
export function PnlHeader({ period, onPeriod, branchLabel, exporting, canExport, onExcel, onForm2 }: Props) {
  const changeMode = (_: unknown, mode: PnlPeriodMode | null) => {
    if (!mode || mode === period.mode) return;
    onPeriod(mode === "custom" ? customPeriod(period.from, period.to) : periodFor(mode, period.to));
  };
  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }}>
      <Box sx={{ mr: { md: "auto" } }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Прибыли и убытки</Typography>
        <Typography variant="caption" color="text.secondary">{branchLabel}</Typography>
      </Box>
      <ToggleButtonGroup size="small" exclusive value={period.mode} onChange={changeMode}>
        {MODES.map((mode) => (
          <ToggleButton key={mode.value} value={mode.value} sx={{ px: 1.5 }}>{mode.label}</ToggleButton>
        ))}
      </ToggleButtonGroup>
      {period.mode === "custom" ? (
        <DateRangeField
          value={{ from: period.from, to: period.to }}
          onChange={(range) => onPeriod(customPeriod(range.from, range.to))}
          presets={[]}
          dense
        />
      ) : (
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <IconButton size="small" aria-label="Предыдущий период" onClick={() => onPeriod(shiftPeriod(period, -1))}>
            <ChevronLeftIcon />
          </IconButton>
          <Typography sx={{ minWidth: 170, textAlign: "center", fontWeight: 600 }}>{periodTitle(period)}</Typography>
          <IconButton size="small" aria-label="Следующий период" onClick={() => onPeriod(shiftPeriod(period, 1))}>
            <ChevronRightIcon />
          </IconButton>
        </Stack>
      )}
      <Stack direction="row" spacing={1}>
        <AppButton
          variant="outlined"
          startIcon={<FileDownloadOutlinedIcon />}
          disabled={!canExport}
          loading={exporting === "excel"}
          onClick={onExcel}
        >
          Excel
        </AppButton>
        <AppButton
          variant="contained"
          color="success"
          startIcon={<FileDownloadOutlinedIcon />}
          disabled={!canExport}
          loading={exporting === "form2"}
          onClick={onForm2}
        >
          Форма №2
        </AppButton>
      </Stack>
    </Stack>
  );
}

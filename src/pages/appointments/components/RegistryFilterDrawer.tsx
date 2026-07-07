import React from "react";
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Divider,
  Stack,
  TextField,
  MenuItem,
  Button,
  Autocomplete,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import dayjs from "dayjs";

export const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

export type RegistryFilters = {
  year: string;
  /** "YYYY-MM"; пустая строка — весь год. */
  month: string;
  serviceName: string | null;
};

export const defaultRegistryFilters = (): RegistryFilters => ({
  year: dayjs().year().toString(),
  month: dayjs().format("YYYY-MM"),
  serviceName: null,
});

type Props = {
  open: boolean;
  onClose: () => void;
  filters: RegistryFilters;
  onApply: (newFilters: RegistryFilters) => void;
  onReset: () => void;
  availableYears: string[];
  availableServices: string[];
};

/**
 * Drawer фильтров реестра приёмов/процедур — период (год/месяц) и услуга.
 * Оформление и поведение (локальное состояние + «Применить») — как
 * ProductFilterDrawer на странице товаров.
 */
const RegistryFilterDrawer: React.FC<Props> = ({
  open,
  onClose,
  filters,
  onApply,
  onReset,
  availableYears,
  availableServices,
}) => {
  const [local, setLocal] = React.useState<RegistryFilters>(filters);

  React.useEffect(() => {
    if (open) setLocal(filters);
  }, [open, filters]);

  const months = React.useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        value: `${local.year}-${String(i + 1).padStart(2, "0")}`,
        monthIndex: i,
      })).reverse(),
    [local.year],
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: 320, sm: 480, md: 520 }, maxWidth: "100vw" } }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 2 }}>
        <Typography variant="h6">Фильтры</Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>
      <Divider />

      <Box
        sx={{
          p: 2,
          flex: 1,
          overflowY: "auto",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        <Stack spacing={3}>
          <TextField
            select
            label="Год"
            value={local.year}
            onChange={(e) =>
              // При смене года месяц сбрасываем на «весь год», иначе остался бы
              // месяц другого года.
              setLocal((p) => ({ ...p, year: e.target.value, month: "" }))
            }
            fullWidth
          >
            {availableYears.map((y) => (
              <MenuItem key={y} value={y}>{y}</MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Месяц"
            value={local.month}
            onChange={(e) => setLocal((p) => ({ ...p, month: e.target.value }))}
            fullWidth
            SelectProps={{ displayEmpty: true }}
          >
            <MenuItem value="">Весь год</MenuItem>
            {months.map((m) => (
              <MenuItem key={m.value} value={m.value}>{MONTH_NAMES[m.monthIndex]}</MenuItem>
            ))}
          </TextField>

          <Autocomplete
            options={availableServices}
            value={local.serviceName}
            onChange={(_, v) => setLocal((p) => ({ ...p, serviceName: v }))}
            renderInput={(params) => (
              <TextField {...params} label="Услуга" placeholder="Все услуги" />
            )}
            noOptionsText="Нет услуг за период"
            isOptionEqualToValue={(option, value) => option === value}
          />
        </Stack>
      </Box>

      <Divider />
      <Box sx={{ p: 2, display: "flex", gap: 2 }}>
        <Button
          variant="outlined"
          fullWidth
          onClick={() => {
            onReset();
            onClose();
          }}
        >
          Сбросить
        </Button>
        <Button
          variant="contained"
          fullWidth
          onClick={() => {
            onApply(local);
            onClose();
          }}
        >
          Применить
        </Button>
      </Box>
    </Drawer>
  );
};

export default RegistryFilterDrawer;

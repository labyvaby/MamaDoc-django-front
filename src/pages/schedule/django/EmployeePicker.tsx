import React from "react";
import {
  Autocomplete,
  Box,
  ButtonBase,
  CircularProgress,
  Dialog,
  IconButton,
  InputAdornment,
  InputBase,
  Stack,
  TextField,
  Typography,
  createFilterOptions,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";

import type { DjangoEmployeeListItem } from "../../../api/staff";
import { UserAvatar } from "../../../components/ui";
import { useAllActiveEmployees } from "../../../hooks/useAllActiveEmployees";
import { subtleBg } from "../../../theme/uiHelpers";

/**
 * Фильтр опций пикера — локальный, по всему справочнику. Стрингифай включает
 * специализацию: серверный поиск знал только ФИО/телефон/почту, поэтому набрать
 * «офтальмолог» и найти врача было нельзя ни при каком вводе. matchFrom по
 * умолчанию (`any`) — иначе подстрока в середине строки не совпадёт.
 */
const employeeFilter = createFilterOptions<DjangoEmployeeListItem>({
  stringify: (o) =>
    [o.fullName, o.nickname, o.phone, (o.specializations ?? []).map((s) => s.name).join(" ")]
      .filter(Boolean)
      .join(" "),
});

const specsOf = (o: DjangoEmployeeListItem) => (o.specializations ?? []).map((s) => s.name).join(", ");

type PickerProps = {
  value: DjangoEmployeeListItem | null;
  onChange: (v: DjangoEmployeeListItem | null) => void;
  disabled?: boolean;
};

/**
 * Телефон: поле открывает полноэкранный поиск с аватарами — выпадающий список
 * Autocomplete на телефоне прятался под клавиатурой и резал ФИО.
 */
const MobileEmployeePicker: React.FC<PickerProps & { options: DjangoEmployeeListItem[]; loading: boolean }> = ({
  value,
  onChange,
  disabled,
  options,
  loading,
}) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const filtered = React.useMemo(
    () => employeeFilter(options, { inputValue: query, getOptionLabel: (o) => o.fullName }),
    [options, query],
  );
  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <ButtonBase
        disabled={disabled}
        onClick={() => setOpen(true)}
        sx={(t) => ({
          width: "100%",
          minHeight: 40,
          px: 1.5,
          justifyContent: "space-between",
          border: 1,
          // Та же грань, что у OutlinedInput, — поле не выделяется среди соседних.
          borderColor: alpha(t.palette.text.primary, 0.23),
          borderRadius: "10px",
          fontSize: 14,
          color: value ? "text.primary" : "text.disabled",
          opacity: disabled ? 0.6 : 1,
        })}
      >
        <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value?.fullName ?? "Имя или специализация..."}
        </Box>
        <ExpandMoreOutlined sx={{ color: "text.secondary", flexShrink: 0 }} />
      </ButtonBase>

      <Dialog fullScreen open={open} onClose={close}>
        <Stack
          direction="row"
          alignItems="center"
          gap={1}
          sx={{ px: 1, py: 1, borderBottom: 1, borderColor: "divider", flexShrink: 0 }}
        >
          <IconButton onClick={close} aria-label="Назад">
            <ArrowBackOutlined />
          </IconButton>
          <InputBase
            autoFocus
            fullWidth
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Имя или специализация"
            startAdornment={
              <InputAdornment position="start">
                <SearchOutlined fontSize="small" />
              </InputAdornment>
            }
            sx={{ fontSize: 16 }}
          />
        </Stack>
        <Box sx={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <Stack alignItems="center" sx={{ py: 4 }}>
              <CircularProgress size={24} />
            </Stack>
          ) : filtered.length === 0 ? (
            <Typography sx={{ p: 3, textAlign: "center", color: "text.secondary", fontSize: 14 }}>
              Сотрудники не найдены
            </Typography>
          ) : (
            filtered.map((o) => {
              const selected = value?.id === o.id;
              const specs = specsOf(o);
              return (
                <ButtonBase
                  key={o.id}
                  onClick={() => {
                    onChange(o);
                    close();
                  }}
                  sx={(t) => ({
                    width: "100%",
                    justifyContent: "flex-start",
                    gap: 1.5,
                    px: 2,
                    py: 1.25,
                    minHeight: 56,
                    textAlign: "left",
                    bgcolor: selected ? subtleBg(t, true) : "transparent",
                  })}
                >
                  <UserAvatar name={o.fullName} size={36} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 500 }} noWrap>
                      {o.fullName}
                    </Typography>
                    {specs && (
                      <Typography sx={{ fontSize: 12, color: "text.secondary" }} noWrap>
                        {specs}
                      </Typography>
                    )}
                  </Box>
                  {selected && <CheckOutlined sx={{ color: "primary.onSurface" }} />}
                </ButtonBase>
              );
            })
          )}
        </Box>
      </Dialog>
    </>
  );
};

export const EmployeePicker: React.FC<PickerProps> = ({ value, onChange, disabled }) => {
  const theme = useTheme();
  // Брейкпоинт md: sm в теме = 360px, и телефон попадает в sm.
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  // Весь справочник активных сотрудников разом (см. useAllActiveEmployees):
  // список больше не обрезается на 20 первых по алфавиту и не перезапрашивается
  // на каждую набранную букву.
  const { employees, isLoading } = useAllActiveEmployees();
  // При редактировании известны только id+ФИО сотрудника, а сам он может быть
  // уже не активен (или из другого филиала) и в справочник не попасть — держим
  // его в опциях, иначе Autocomplete сбросит value.
  const options = React.useMemo(
    () =>
      value && !employees.some((o) => o.id === value.id) ? [value, ...employees] : employees,
    [employees, value],
  );

  if (isMobile) {
    return (
      <MobileEmployeePicker
        value={value}
        onChange={onChange}
        disabled={disabled}
        options={options}
        loading={isLoading}
      />
    );
  }

  return (
    <Autocomplete
      options={options}
      loading={isLoading}
      value={value}
      getOptionLabel={(o) => o.fullName}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      onChange={(_, v) => onChange(v)}
      filterOptions={employeeFilter}
      disabled={disabled}
      renderOption={(props, o) => {
        const specs = specsOf(o);
        return (
          <li {...props} key={o.id}>
            <Stack sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap>
                {o.fullName}
              </Typography>
              {specs && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  {specs}
                </Typography>
              )}
            </Stack>
          </li>
        );
      }}
      renderInput={(params) => (
        <TextField {...params} size="small" placeholder="Имя или специализация..." />
      )}
      loadingText="Загрузка сотрудников…"
      noOptionsText="Сотрудники не найдены"
    />
  );
};

export default EmployeePicker;

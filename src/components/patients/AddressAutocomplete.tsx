/**
 * AddressAutocomplete
 *
 * Поле ввода адреса с опциональными подсказками Geoapify или собственного
 * геокодера (см. api/geo). freeSolo — можно ввести любой адрес, даже которого нет в
 * подсказках. Без настроенного сервиса сетевые запросы не выполняются.
 */

import React from "react";
import {
  Autocomplete,
  Box,
  CircularProgress,
  TextField,
  Typography,
} from "@mui/material";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import {
  suggestAddresses,
  isAddressSuggestEnabled,
  ADDRESS_SUGGEST_MIN_LEN,
  type AddressSuggestion,
} from "../../api/geo";
import { isAbortError } from "../../api/client";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

const AddressAutocomplete: React.FC<Props> = ({
  value,
  onChange,
  disabled,
  placeholder,
}) => {
  const enabled = isAddressSuggestEnabled();
  const [options, setOptions] = React.useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = React.useState(false);
  // Текст, набранный пользователем (в отличие от программной установки value).
  const [query, setQuery] = React.useState("");

  // ── debounced fetch подсказок ───────────────────────────────────────────
  React.useEffect(() => {
    if (!enabled) return;
    const q = query.trim();
    if (q.length < ADDRESS_SUGGEST_MIN_LEN) {
      setOptions([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const res = await suggestAddresses(q, ctrl.signal);
        if (!ctrl.signal.aborted) setOptions(res);
      } catch (err) {
        if (!isAbortError(err)) setOptions([]);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 750);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [query, enabled]);

  return (
    <Autocomplete<AddressSuggestion, false, false, true>
      freeSolo
      disabled={disabled}
      options={options}
      loading={loading}
      filterOptions={(x) => x}
      autoComplete
      includeInputInList
      noOptionsText="Ничего не найдено"
      inputValue={value}
      getOptionLabel={(o) => (typeof o === "string" ? o : o.value)}
      isOptionEqualToValue={(o, v) =>
        (typeof o === "string" ? o : o.value) ===
        (typeof v === "string" ? v : v.value)
      }
      onInputChange={(_, v, reason) => {
        if (reason === "input") {
          onChange(v);
          setQuery(v);
        } else if (reason === "clear") {
          onChange("");
          setQuery("");
          setOptions([]);
        }
      }}
      onChange={(_, v) => {
        const next = v == null ? "" : typeof v === "string" ? v : v.value;
        onChange(next);
        setQuery(""); // вариант выбран — новые запросы не нужны
        setOptions([]);
      }}
      renderOption={(props, o) => {
        const opt = o as AddressSuggestion;
        return (
          <li {...props} key={opt.value}>
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, minWidth: 0 }}>
              <PlaceOutlined
                fontSize="small"
                sx={{ mt: "2px", color: "text.secondary", flexShrink: 0 }}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" noWrap>
                  {opt.title}
                </Typography>
                {opt.subtitle && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    noWrap
                    sx={{ display: "block" }}
                  >
                    {opt.subtitle}
                  </Typography>
                )}
              </Box>
            </Box>
          </li>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          fullWidth
          disabled={disabled}
          placeholder={placeholder ?? "Город, улица, дом"}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={16} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
};

export default AddressAutocomplete;

import React from "react";
import {
  Box,
  Dialog,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";

import type { DjangoCatalogServiceWithEmployees } from "../../hooks/useDjangoAppointmentData";
import { SERVICE_CATEGORY_LABELS } from "../../api/catalog";
import { formatKGS } from "../../utility/format";
import { useT } from "../../i18n/VerticalProvider";

interface Props {
  options: DjangoCatalogServiceWithEmployees[];
  value: DjangoCatalogServiceWithEmployees | null;
  onChange: (value: DjangoCatalogServiceWithEmployees | null) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder: string;
  error?: boolean;
  helperText?: React.ReactNode;
  /** Список вариантов пуст не из-за поиска — например у исполнителя нет назначенных услуг. */
  noOptionsText: string;
}

/**
 * Крупный диалог выбора услуги вместо строчного Autocomplete-дропдауна: при
 * паре сотен позиций в каталоге узкое выпадающее меню неудобно листать,
 * особенно с телефона, где клавиатура закрывает половину списка. Диалог —
 * полноэкранный на телефоне и по центру на десктопе (граница по md: телефон
 * попадает в брейкпоинт sm 360px), поиск закреплён сверху, строки крупные.
 *
 * Логику совместимости услуга/исполнитель и побочные эффекты выбора (сброс
 * цены, расходников и т.п.) держит вызывающий код в onChange — здесь только
 * поиск и сам выбор из списка.
 */
const ServicePickerField: React.FC<Props> = ({
  options,
  value,
  onChange,
  disabled,
  loading,
  placeholder,
  error,
  helperText,
  noOptionsText,
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((s) => s.name.toLowerCase().includes(q));
  }, [options, search]);

  const handleOpen = () => {
    if (disabled) return;
    setSearch("");
    setOpen(true);
  };

  const handleSelect = (service: DjangoCatalogServiceWithEmployees) => {
    onChange(service);
    setOpen(false);
  };

  return (
    <>
      <TextField
        fullWidth
        size="small"
        placeholder={placeholder}
        value={value?.name ?? ""}
        onClick={handleOpen}
        disabled={disabled}
        error={error}
        helperText={helperText}
        inputProps={{ readOnly: true }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <SearchOutlined fontSize="small" color="disabled" />
            </InputAdornment>
          ),
        }}
        sx={{ "& .MuiInputBase-input": { cursor: disabled ? "default" : "pointer" } }}
      />

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullScreen={fullScreen}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: fullScreen ? {} : { height: "min(72vh, 640px)", borderRadius: "12px" },
        }}
      >
        <Stack sx={{ height: "100%", minHeight: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ pl: 2, pr: 1, py: 1 }}>
            <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 600 }}>
              {placeholder}
            </Typography>
            <IconButton size="small" onClick={() => setOpen(false)}>
              <CloseOutlined fontSize="small" />
            </IconButton>
          </Stack>

          <Box sx={{ px: 2, pb: 1 }}>
            <TextField
              autoFocus
              fullWidth
              size="small"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("addDrawer.servicePickerSearch")}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined fontSize="small" color="disabled" />
                  </InputAdornment>
                ),
              }}
            />
          </Box>

          <List sx={{ flex: 1, overflowY: "auto", py: 0, minHeight: 0 }}>
            {loading && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                {t("addDrawer.loadingDicts")}
              </Typography>
            )}
            {!loading && filtered.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                {search ? t("serviceRow.noServiceMatches") : noOptionsText}
              </Typography>
            )}
            {!loading &&
              filtered.map((service) => {
                const selected = service.id === value?.id;
                const categoryLabel = service.category
                  ? SERVICE_CATEGORY_LABELS[service.category]
                  : undefined;
                return (
                  <ListItemButton
                    key={service.id}
                    selected={selected}
                    onClick={() => handleSelect(service)}
                    sx={{ py: 1.25, px: 2, alignItems: "flex-start", gap: 1 }}
                  >
                    <ListItemText
                      primary={service.name}
                      secondary={categoryLabel || undefined}
                      sx={{ my: 0 }}
                    />
                    <Stack alignItems="flex-end" spacing={0.25} sx={{ flexShrink: 0, pt: 0.25 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {formatKGS(service.basePrice)}
                      </Typography>
                      {service.durationMinutes ? (
                        <Typography variant="caption" color="text.secondary">
                          {t("addDrawer.minutesValue", { minutes: service.durationMinutes })}
                        </Typography>
                      ) : null}
                    </Stack>
                    {selected && (
                      <CheckOutlined fontSize="small" color="primary" sx={{ flexShrink: 0, mt: 0.5 }} />
                    )}
                  </ListItemButton>
                );
              })}
          </List>
        </Stack>
      </Dialog>
    </>
  );
};

export default ServicePickerField;

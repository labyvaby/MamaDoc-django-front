import React from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import CheckBoxIcon from "@mui/icons-material/CheckBox";

import { SERVICE_CATEGORY_LABELS, type Service } from "../../api/catalog";
import { formatKGS } from "../../utility/format";

interface Props {
  options: Service[];
  value: Service[];
  onChange: (value: Service[]) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder: string;
  /** Сколько чипов показывать в свёрнутом поле до «+N». */
  limitTags?: number;
}

/**
 * Крупный диалог множественного выбора услуг вместо Autocomplete с
 * чекбоксами в узком выпадающем меню: у врача бывает 30+ услуг, и листать
 * такой список в маленькой попап-панели неудобно, особенно с телефона.
 * Отмеченные строки не закрывают диалог — можно отметить сразу несколько,
 * закрыть либо крестиком/подложкой, либо кнопкой «Готово».
 */
const ServiceMultiPickerField: React.FC<Props> = ({
  options,
  value,
  onChange,
  disabled,
  loading,
  placeholder,
  limitTags = 3,
}) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const selectedIds = React.useMemo(() => new Set(value.map((s) => s.id)), [value]);

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

  const toggle = (service: Service) => {
    if (selectedIds.has(service.id)) {
      onChange(value.filter((s) => s.id !== service.id));
    } else {
      onChange([...value, service]);
    }
  };

  const remove = (id: number) => onChange(value.filter((s) => s.id !== id));

  return (
    <>
      <TextField
        fullWidth
        size="small"
        placeholder={value.length === 0 ? placeholder : undefined}
        value=""
        onClick={handleOpen}
        disabled={disabled}
        inputProps={{ readOnly: true }}
        InputProps={{
          startAdornment:
            value.length > 0 ? (
              <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ py: 0.5 }}>
                {value.slice(0, limitTags).map((s) => (
                  <Chip
                    key={s.id}
                    size="small"
                    label={s.name}
                    onMouseDown={(e) => e.stopPropagation()}
                    onDelete={disabled ? undefined : () => remove(s.id)}
                  />
                ))}
                {value.length > limitTags && (
                  <Chip size="small" label={`+${value.length - limitTags}`} />
                )}
              </Stack>
            ) : undefined,
          endAdornment: (
            <InputAdornment position="end">
              <SearchOutlined fontSize="small" color="disabled" />
            </InputAdornment>
          ),
        }}
        sx={{
          "& .MuiInputBase-root": {
            flexWrap: "wrap",
            height: "auto",
            py: 0.25,
            cursor: disabled ? "default" : "pointer",
          },
          "& .MuiInputBase-input": { minWidth: 40, flex: "1 0 40px" },
        }}
      />

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullScreen={fullScreen}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: fullScreen ? {} : { height: "min(76vh, 680px)", borderRadius: "12px" },
        }}
      >
        <Stack sx={{ height: "100%", minHeight: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ pl: 2, pr: 1, py: 1 }}>
            <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 600 }}>
              {placeholder}
            </Typography>
            {value.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                Выбрано: {value.length}
              </Typography>
            )}
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
              placeholder="Поиск услуги"
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
                Загрузка…
              </Typography>
            )}
            {!loading && filtered.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                Ничего не найдено
              </Typography>
            )}
            {!loading &&
              filtered.map((service) => {
                const checked = selectedIds.has(service.id);
                const categoryLabel = service.category
                  ? SERVICE_CATEGORY_LABELS[service.category]
                  : undefined;
                return (
                  <ListItemButton
                    key={service.id}
                    onClick={() => toggle(service)}
                    sx={{ py: 1, px: 2 }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Checkbox
                        edge="start"
                        checked={checked}
                        tabIndex={-1}
                        disableRipple
                        icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
                        checkedIcon={<CheckBoxIcon fontSize="small" />}
                      />
                    </ListItemIcon>
                    <ListItemText primary={service.name} secondary={categoryLabel || undefined} />
                    <Typography variant="body2" fontWeight={600} sx={{ flexShrink: 0, pl: 1 }} noWrap>
                      {formatKGS(service.basePrice)}
                    </Typography>
                  </ListItemButton>
                );
              })}
          </List>

          <Stack
            direction="row"
            justifyContent="flex-end"
            sx={{ px: 2, py: 1.25, borderTop: 1, borderColor: "divider" }}
          >
            <Button size="small" variant="contained" onClick={() => setOpen(false)}>
              Готово
            </Button>
          </Stack>
        </Stack>
      </Dialog>
    </>
  );
};

export default ServiceMultiPickerField;

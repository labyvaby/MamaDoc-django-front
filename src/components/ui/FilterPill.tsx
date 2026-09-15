import React from "react";
import { Box, ButtonBase, Menu, MenuItem } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";

import { subtleBg } from "../../theme/uiHelpers";

/**
 * Единая геометрия элементов ряда фильтров: чипы, селекты-пилюли, поля периода
 * и кнопки сортировки имеют одну высоту и радиус, поэтому ряд читается как одна
 * линия, а не как случайный набор контролов разного размера.
 */
export const FILTER_PILL_HEIGHT = 30;

export const pillSx = (t: Theme, active = false, tone?: "error") => {
  const accent = tone === "error" ? t.palette.error : t.palette.primary;
  const activeColor = t.palette.mode === "dark" ? accent.light : accent.dark;
  return {
    height: FILTER_PILL_HEIGHT,
    // Тема задаёт кнопкам minHeight = controls.buttonHeight (40px) — без явного
    // сброса Button в ряду оказывается выше чипов на 10px.
    minHeight: FILTER_PILL_HEIGHT,
    px: 1.25,
    borderRadius: "9px",
    // Отступ иконки у Button больше, чем у Chip: выравниваем, иначе элементы
    // ряда «дышат» по-разному.
    "& .MuiButton-startIcon": { mr: 0.75, ml: 0 },
    border: 1,
    borderColor: active ? alpha(accent.main, 0.45) : "divider",
    bgcolor: active ? alpha(accent.main, t.palette.mode === "dark" ? 0.18 : 0.1) : "transparent",
    color: active ? activeColor : "text.secondary",
    fontSize: "0.8125rem",
    fontWeight: 500,
    textTransform: "none" as const,
    flexShrink: 0,
    transition: "border-color .15s ease, background-color .15s ease, color .15s ease",
    "&:hover": {
      bgcolor: active
        ? alpha(accent.main, t.palette.mode === "dark" ? 0.24 : 0.14)
        : subtleBg(t, true),
      borderColor: alpha(accent.main, 0.35),
      color: active ? activeColor : "text.primary",
    },
  };
};

export interface FilterPillProps {
  label: string;
  icon: React.ReactElement<{ sx?: object }>;
  value: string;
  options: { value: string; label: string }[];
  allLabel: string;
  onChange: (value: string) => void;
}

/**
 * Селект-пилюля с выпадающим меню — замена TextField(select) в ряду фильтров.
 * Пока значение не выбрано, показывает название фильтра; после выбора —
 * «Название: значение», чтобы по ряду было видно, что именно включено.
 */
export const FilterPill: React.FC<FilterPillProps> = ({
  label,
  icon,
  value,
  options,
  allLabel,
  onChange,
}) => {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const active = value !== "";
  const selected = options.find((o) => o.value === value);

  const pick = (next: string) => {
    onChange(next);
    setAnchorEl(null);
  };

  return (
    <>
      <ButtonBase
        focusRipple
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={(t) => ({
          ...pillSx(t, active),
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          maxWidth: 240,
          ...(open ? { borderColor: alpha(t.palette.primary.main, 0.45) } : null),
        })}
      >
        {React.cloneElement(icon, { sx: { fontSize: 15, color: "inherit" } })}
        <Box component="span" sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {active && selected ? `${label}: ${selected.label}` : label}
        </Box>
        <ExpandMoreOutlined
          sx={{
            fontSize: 15,
            color: "inherit",
            transition: "transform .15s ease",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </ButtonBase>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { mt: 0.5, borderRadius: "12px", minWidth: 200, maxHeight: 360 } } }}
      >
        <MenuItem selected={!active} onClick={() => pick("")} sx={{ fontSize: "0.875rem" }}>
          {allLabel}
        </MenuItem>
        {options.map((o) => (
          <MenuItem
            key={o.value}
            selected={o.value === value}
            onClick={() => pick(o.value)}
            sx={{ fontSize: "0.875rem" }}
          >
            {o.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default FilterPill;

import React from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import ClickAwayListener from "@mui/material/ClickAwayListener";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

import AddOutlined from "@mui/icons-material/AddOutlined";
import ClearOutlined from "@mui/icons-material/ClearOutlined";
import PauseCircleOutlineOutlined from "@mui/icons-material/PauseCircleOutlineOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import ShoppingCartOutlined from "@mui/icons-material/ShoppingCartOutlined";

import { POS_RADIUS, posColors } from "./layout";

type Props = {
  canSell?: boolean;
  canHold?: boolean;
  onScan?: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
  search: string;
  onSearchChange: (value: string) => void;
  /** Стрелки и Enter для выпадающего списка; `true` — событие обработано. */
  onSearchKeyDown?: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => boolean;
  onSearchFocus?: () => void;
  /** Выпадающий список найденных товаров под полем поиска. */
  dropdown?: React.ReactNode;
  onDropdownClose?: () => void;
  categories?: Array<{ id: number; name: string }>;
  categoryId?: number | null;
  onCategoryChange?: (categoryId: number | null) => void;
  /** Kept for compatibility with the legacy mock POS page. */
  cashierDesk?: string;
  cashierName?: string;
  onNewReceipt: () => void;
  onOpenHeldReceipts: () => void;
};

/** Кнопка шапки: «Новый чек», «Отложенные». На телефоне — только иконка. */
const TopBarButton: React.FC<{ label: string; icon: React.ReactNode; onClick: () => void }> = ({ label, icon, onClick }) => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <ButtonBase
      onClick={onClick}
      aria-label={label}
      title={label}
      sx={{
        height: 40,
        minWidth: 40,
        px: { xs: "10px", md: "14px" },
        gap: "6px",
        borderRadius: `${POS_RADIUS.control}px`,
        bgcolor: c.card,
        border: `1px solid ${c.outline}`,
        color: c.textSoft,
        fontSize: 13,
        fontWeight: 700,
        whiteSpace: "nowrap",
        "&:hover": { bgcolor: c.tile, borderColor: c.accent },
        "& svg": { fontSize: 18 },
      }}
    >
      {icon}
      <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>{label}</Box>
    </ButtonBase>
  );
};

/** Верхняя полоса кассы: поиск товара с выпадающим списком и действия с чеком. */
export const PosTopBar: React.FC<Props> = ({
  search,
  onSearchChange,
  onSearchKeyDown,
  onSearchFocus,
  dropdown,
  onDropdownClose,
  inputRef,
  categories,
  categoryId = null,
  onCategoryChange,
  onNewReceipt,
  onOpenHeldReceipts,
  canSell = false,
  canHold = false,
  onScan,
}) => {
  const theme = useTheme();
  const c = posColors(theme);

  return (
    <Box
      sx={{
        position: "relative",
        zIndex: 5,
        flexShrink: 0,
        px: { xs: "12px", md: "16px" },
        py: "10px",
        bgcolor: c.page,
        borderBottom: `1px solid ${c.outline}`,
        display: "flex",
        flexWrap: { xs: "wrap", md: "nowrap" },
        alignItems: "center",
        gap: { xs: "10px", md: "16px" },
      }}
    >
      <Stack direction="row" alignItems="center" gap="8px" sx={{ flexShrink: 0, mr: { xs: "auto", md: 0 } }}>
        <Box sx={{ width: 30, height: 30, display: "grid", placeItems: "center", borderRadius: `${POS_RADIUS.tile}px`, bgcolor: c.tile }}>
          <ShoppingCartOutlined sx={{ fontSize: 17, color: c.accentText }} />
        </Box>
        <Typography sx={{ fontSize: 17, fontWeight: 800, color: c.text, whiteSpace: "nowrap" }}>Касса</Typography>
      </Stack>

      <ClickAwayListener onClickAway={() => onDropdownClose?.()}>
        <Box sx={{ position: "relative", order: { xs: 3, md: 0 }, flex: { xs: "1 1 100%", md: "1 1 auto" }, maxWidth: { md: 720 }, minWidth: 0 }}>
          <Box
            sx={{
              height: 42,
              pl: "12px",
              pr: "6px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              bgcolor: c.tile,
              border: `1px solid ${dropdown ? c.accent : c.outline}`,
              borderRadius: `${POS_RADIUS.control}px`,
              transition: "border-color .15s",
              "&:focus-within": { borderColor: c.accent },
            }}
          >
            <SearchOutlined sx={{ fontSize: 19, color: c.textDim, flexShrink: 0 }} />
            <InputBase
              inputRef={inputRef}
              autoFocus
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              onFocus={onSearchFocus}
              onKeyDown={(event) => {
                if (onSearchKeyDown?.(event)) return;
                if (event.key === "Enter") {
                  event.preventDefault();
                  onScan?.();
                }
              }}
              placeholder="Название, артикул или штрихкод (F2)"
              inputProps={{ "aria-label": "Поиск товара", autoComplete: "off" }}
              sx={{
                flex: 1,
                minWidth: 0,
                fontSize: 14,
                color: c.text,
                "& input::placeholder": { color: c.textDim, opacity: 1 },
              }}
            />
            {search ? (
              <IconButton size="small" aria-label="Очистить поиск" onClick={() => onSearchChange("")} sx={{ color: c.textDim }}>
                <ClearOutlined sx={{ fontSize: 18 }} />
              </IconButton>
            ) : null}
            {categories && categories.length > 0 && onCategoryChange && (
              <Select
                value={categoryId == null ? "" : String(categoryId)}
                onChange={(event) => {
                  const value = event.target.value;
                  onCategoryChange(value ? Number(value) : null);
                }}
                displayEmpty
                variant="standard"
                disableUnderline
                aria-label="Фильтр по категории"
                renderValue={(value) => categories.find((item) => String(item.id) === String(value))?.name ?? "Категория"}
                sx={{
                  flexShrink: 0,
                  width: { xs: 118, md: 150 },
                  pl: 1.25,
                  borderLeft: `1px solid ${c.outline}`,
                  color: categoryId == null ? c.textDim : c.accentText,
                  fontSize: 13,
                  fontWeight: categoryId == null ? 400 : 700,
                  "& .MuiSelect-select": { py: 0.5, pr: "24px !important", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
                  "& .MuiSelect-icon": { color: c.textDim },
                }}
              >
                <MenuItem value="">Все категории</MenuItem>
                {categories.map((item) => (
                  <MenuItem key={item.id} value={String(item.id)}>
                    {item.name}
                  </MenuItem>
                ))}
              </Select>
            )}
          </Box>

          {dropdown ? (
            <Box
              sx={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0,
                right: 0,
                maxHeight: { xs: "min(60vh, 420px)", md: "min(56vh, 460px)" },
                overflowY: "auto",
                px: "4px",
                bgcolor: c.card,
                border: `1px solid ${c.outline}`,
                borderRadius: `${POS_RADIUS.card}px`,
                boxShadow: theme.shadows[12],
              }}
            >
              {dropdown}
            </Box>
          ) : null}
        </Box>
      </ClickAwayListener>

      <Stack direction="row" alignItems="center" gap="8px" sx={{ flexShrink: 0, ml: { md: "auto" } }}>
        {canSell && <TopBarButton label="Новый чек" icon={<AddOutlined />} onClick={onNewReceipt} />}
        {canHold && <TopBarButton label="Отложенные" icon={<PauseCircleOutlineOutlined />} onClick={onOpenHeldReceipts} />}
      </Stack>
    </Box>
  );
};

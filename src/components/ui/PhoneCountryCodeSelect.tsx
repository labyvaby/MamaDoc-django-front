import React from "react";
import { Box, ButtonBase, Divider, Menu, MenuItem, TextField, Typography } from "@mui/material";
import KeyboardArrowDownOutlined from "@mui/icons-material/KeyboardArrowDownOutlined";
import PublicOutlined from "@mui/icons-material/PublicOutlined";

import {
  PHONE_COUNTRIES,
  PRIMARY_PHONE_COUNTRY_COUNT,
  type PhoneCountryCode,
  type PhoneCountryInfo,
} from "../../utility/phone";
import { CountryFlag } from "./CountryFlag";

export interface PhoneCountryCodeSelectProps {
  value: PhoneCountryCode;
  onChange: (code: PhoneCountryCode) => void;
  disabled?: boolean;
}

/**
 * Единый селект кода страны для телефонных полей — и в CRM, и на витрине.
 *
 * Сразу показываем три страны, откуда пациенты приходят почти всегда; остальные
 * прячем за пунктом «Другие страны». Короткий список без такого пункта выглядел
 * бы ограниченным: человек с турецким номером решил бы, что его страны нет.
 *
 * Собран на `Menu`, а не на `TextField select`: внутри `Select` кликабельным
 * считается только `MenuItem` с value, поэтому «Другие страны» либо закрывали
 * список как выбор значения, либо (как `ListSubheader`) не реагировали вовсе.
 */
export const PhoneCountryCodeSelect: React.FC<PhoneCountryCodeSelectProps> = ({
  value,
  onChange,
  disabled,
}) => {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const [showAll, setShowAll] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const visible: PhoneCountryInfo[] = React.useMemo(() => {
    if (!showAll) return PHONE_COUNTRIES.slice(0, PRIMARY_PHONE_COUNTRY_COUNT);
    const q = query.trim().toLowerCase();
    if (!q) return PHONE_COUNTRIES;
    return PHONE_COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dialCode.includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [showAll, query]);

  // У «+7» два владельца (Россия и Казахстан) — для флага берём первого:
  // длина и формат номера у них совпадают, различать незачем.
  const selected = PHONE_COUNTRIES.find((c) => c.dialCode === value);

  const close = () => {
    setAnchor(null);
    setShowAll(false);
    setQuery("");
  };

  return (
    <>
      <ButtonBase
        disabled={disabled}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          height: 40,
          minWidth: 104,
          px: 1.5,
          gap: 0.75,
          justifyContent: "flex-start",
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          color: "text.primary",
          transition: "border-color .2s",
          "&:hover": { borderColor: "text.primary" },
          "&.Mui-disabled": { opacity: 0.6 },
        }}
      >
        {selected && <CountryFlag code={selected.code} size={20} />}
        <Typography sx={{ fontSize: 14 }}>{value}</Typography>
        <KeyboardArrowDownOutlined sx={{ fontSize: 18, color: "text.secondary", ml: "auto" }} />
      </ButtonBase>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        slotProps={{ paper: { sx: { width: 264, maxHeight: 340 } } }}
      >
        {showAll && (
          <Box sx={{ px: 1.5, pb: 1 }} onKeyDown={(e) => e.stopPropagation()}>
            <TextField
              autoFocus
              fullWidth
              size="small"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск страны"
            />
          </Box>
        )}

        {visible.map((c) => (
          <MenuItem
            key={`${c.code}-${c.dialCode}`}
            selected={c.dialCode === value}
            onClick={() => {
              onChange(c.dialCode);
              close();
            }}
          >
            <Box sx={{ mr: 1.5, display: "flex" }}>
              <CountryFlag code={c.code} size={20} />
            </Box>
            <Typography sx={{ fontSize: 14, flexGrow: 1 }}>{c.name}</Typography>
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{c.dialCode}</Typography>
          </MenuItem>
        ))}

        {!showAll && <Divider sx={{ my: 0.5 }} />}
        {!showAll && (
          <MenuItem onClick={() => setShowAll(true)}>
            <PublicOutlined sx={{ mr: 1.5, fontSize: 20, color: "text.secondary" }} />
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Другие страны…</Typography>
          </MenuItem>
        )}

        {visible.length === 0 && (
          <Typography sx={{ px: 2, py: 1, fontSize: 13, color: "text.secondary" }}>
            Ничего не найдено
          </Typography>
        )}
      </Menu>
    </>
  );
};

export default PhoneCountryCodeSelect;

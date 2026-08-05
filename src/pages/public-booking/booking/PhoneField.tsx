import React from "react";
import { Box, Menu, MenuItem, Stack, Typography } from "@mui/material";
import KeyboardArrowDownOutlined from "@mui/icons-material/KeyboardArrowDownOutlined";
import PublicOutlined from "@mui/icons-material/PublicOutlined";

import { CountryFlag } from "../../../components/ui/CountryFlag";
import {
  PHONE_COUNTRIES,
  PRIMARY_PHONE_COUNTRY_COUNT,
  normalizePhoneLocal,
  parsePastedPhone,
  phonePlaceholder,
  type PhoneCountryInfo,
} from "../../../utility/phone";
import { useT } from "../../../i18n/VerticalProvider";
import { BOOKING_PRIMARY, BORDER, MUTED } from "../theme";
import { FIELD_SX, INPUT_SX } from "./fieldStyles";

/**
 * Ввод телефона на витрине: флаг страны, код и номер. Общий для гостевой записи
 * и входа в кабинет — оба шлют номер в международном формате.
 *
 * Состояние страны и номера держит родитель: гостевой диалог подставляет
 * контакты прошлой записи, вход — номер из сессии.
 */

export const PhoneField: React.FC<{
  country: PhoneCountryInfo;
  phone: string;
  error?: boolean;
  disabled?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  onCountryChange: (country: PhoneCountryInfo) => void;
  onPhoneChange: (phone: string) => void;
  onEnter?: () => void;
}> = ({
  country,
  phone,
  error,
  disabled,
  inputRef,
  onCountryChange,
  onPhoneChange,
  onEnter,
}) => {
  const { t } = useT("publicBooking");
  const list = PHONE_COUNTRIES;
  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [countryQuery, setCountryQuery] = React.useState("");
  const [showAllCountries, setShowAllCountries] = React.useState(false);

  // Обычному пациенту нужны три страны; остальные прячем за «Другие страны»,
  // чтобы список не превращался в простыню, но и не выглядел ограниченным.
  const primaryCountries = React.useMemo(
    () => list.slice(0, PRIMARY_PHONE_COUNTRY_COUNT),
    [list],
  );
  const visibleCountries = React.useMemo(() => {
    if (!showAllCountries) return primaryCountries;
    const q = countryQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dialCode.includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [list, primaryCountries, showAllCountries, countryQuery]);

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{ ...FIELD_SX, ...(error ? { borderColor: "error.main" } : null) }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.5}
        onClick={disabled ? undefined : (e) => setMenuAnchor(e.currentTarget)}
        sx={{ cursor: disabled ? "default" : "pointer", flexShrink: 0 }}
      >
        <CountryFlag code={country.code} size={20} />
        <KeyboardArrowDownOutlined sx={{ fontSize: 16, color: MUTED }} />
      </Stack>
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => {
          setMenuAnchor(null);
          setCountryQuery("");
          setShowAllCountries(false);
        }}
        slotProps={{ paper: { sx: { maxHeight: 320, width: 260 } } }}
      >
        {/* Поиск нужен только когда открыт полный список. */}
        {showAllCountries && (
          <Box sx={{ px: 1.5, pb: 1 }} onKeyDown={(e) => e.stopPropagation()}>
            <Box
              component="input"
              autoFocus
              value={countryQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setCountryQuery(e.target.value)
              }
              placeholder={t("searchShort")}
              sx={{
                width: "100%",
                p: 1,
                border: `1px solid ${BORDER}`,
                borderRadius: "8px",
                outline: "none",
                fontFamily: "inherit",
                fontSize: 14,
              }}
            />
          </Box>
        )}
        {visibleCountries.map((c) => (
          <MenuItem
            key={`${c.code}-${c.dialCode}`}
            onClick={() => {
              onCountryChange(c);
              // Номер длиннее, чем принято в новой стране, обрезаем — иначе он
              // молча уйдёт на бэк в неверном формате.
              onPhoneChange(normalizePhoneLocal(c.dialCode, phone));
              setMenuAnchor(null);
              setCountryQuery("");
            }}
          >
            <Box sx={{ mr: 1.5, display: "flex" }}>
              <CountryFlag code={c.code} size={20} />
            </Box>
            <Typography sx={{ fontSize: 14, flexGrow: 1 }}>{c.name}</Typography>
            <Typography sx={{ fontSize: 13, color: MUTED }}>{c.dialCode}</Typography>
          </MenuItem>
        ))}
        {!showAllCountries && (
          <MenuItem
            onClick={() => setShowAllCountries(true)}
            sx={{ borderTop: `1px solid ${BORDER}`, mt: 0.5, pt: 1 }}
          >
            <PublicOutlined sx={{ mr: 1.5, fontSize: 20, color: MUTED }} />
            <Typography sx={{ fontSize: 14, color: BOOKING_PRIMARY, fontWeight: 500 }}>
              {t("otherCountries")}
            </Typography>
          </MenuItem>
        )}
        {visibleCountries.length === 0 && (
          <Typography sx={{ px: 2, py: 1, fontSize: 13, color: MUTED }}>
            {t("noSpecialistsFoundHint")}
          </Typography>
        )}
      </Menu>

      <Typography sx={{ fontSize: 16, fontWeight: 500, flexShrink: 0 }}>
        {country.dialCode}
      </Typography>

      <Box
        component="input"
        ref={inputRef}
        type="tel"
        name="phone"
        autoComplete="tel"
        disabled={disabled}
        value={phone}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          // Ввод сразу приводим к формату страны: лишние цифры не влезут,
          // местный trunk-префикс (0 или 8) снимается.
          onPhoneChange(normalizePhoneLocal(country.dialCode, e.target.value));
        }}
        onPaste={(e: React.ClipboardEvent<HTMLInputElement>) => {
          // Вставленный номер может прийти с кодом страны («+996 700…»,
          // «996700123456») или чужой страны — тогда переключаем и её.
          e.preventDefault();
          const parsed = parsePastedPhone(country.dialCode, e.clipboardData.getData("text"));
          const nextCountry = list.find((c) => c.dialCode === parsed.countryCode);
          if (nextCountry) onCountryChange(nextCountry);
          onPhoneChange(parsed.local);
        }}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "Enter") onEnter?.();
        }}
        placeholder={phonePlaceholder(country.dialCode)}
        sx={{ ...INPUT_SX, flexGrow: 1, minWidth: 0 }}
      />
    </Stack>
  );
};


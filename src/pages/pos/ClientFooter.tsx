import React from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

import ClearOutlined from "@mui/icons-material/ClearOutlined";
import PersonAddAlt1Outlined from "@mui/icons-material/PersonAddAlt1Outlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";

import { POS_RADIUS, posColors } from "./layout";
import type { PosClient, PosClientSearchResult } from "./types";
import { formatPosAmount } from "./format";

type Props = {
  canRegister?: boolean;
  canHistory?: boolean;
  client: PosClient | null;
  query: string;
  onQueryChange: (value: string) => void;
  /** Оставляем Enter совместимым со старым сценарием; поиск запускается и автоматически. */
  onSearch?: () => void;
  /** null — поиск ещё не запускали; пустой массив — клиент не найден. */
  results: PosClientSearchResult[] | null;
  /** Идёт запрос поиска — показываем индикатор в поле. */
  searching?: boolean;
  onSelectClient: (client: PosClientSearchResult) => void;
  /**
   * Регистрация клиента. Промис с `false` — не получилось (ошибку показывает
   * страница), форма остаётся открытой; иначе форма закрывается.
   */
  onRegister: (name: string, phone: string) => void | Promise<boolean | void>;
  onChangeClient: () => void;
  onOpenHistory: () => void;
};

const initials = (name: string): string =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

/** Похоже на номер телефона — тогда подставляем запрос в поле телефона, а не имени. */
const looksLikePhone = (value: string) => /^[+\d][\d\s()-]*$/.test(value.trim());

const Avatar: React.FC<{ name: string; size?: number }> = ({ name, size = 36 }) => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <Box
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        bgcolor: c.accent,
        color: c.onAccent,
        display: "grid",
        placeItems: "center",
        fontSize: Math.round(size * 0.38),
        fontWeight: 800,
      }}
    >
      {initials(name) || "?"}
    </Box>
  );
};

/** Кнопка футера: «История», «Сменить», «Новый клиент». */
const FooterButton: React.FC<{
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  accent?: boolean;
  disabled?: boolean;
}> = ({ label, onClick, icon, accent, disabled }) => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <ButtonBase
      onClick={onClick}
      disabled={disabled}
      sx={{
        height: 38,
        px: "12px",
        gap: "6px",
        flexShrink: 0,
        borderRadius: `${POS_RADIUS.tile}px`,
        bgcolor: accent ? c.accentBg : c.card,
        border: `1px solid ${accent ? c.accent : c.hairline}`,
        color: accent ? c.accentText : c.textSoft,
        fontSize: 13,
        fontWeight: 700,
        whiteSpace: "nowrap",
        "&:hover": { borderColor: c.accent },
        "&.Mui-disabled": { opacity: 0.45 },
        "& svg": { fontSize: 18 },
      }}
    >
      {icon}
      {label}
    </ButtonBase>
  );
};

/** Метрика выбранного клиента: «Скидка 5%», «Бонусы 350 сом». */
const ClientMetric: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <Stack sx={{ px: "10px", py: "5px", borderRadius: `${POS_RADIUS.tile}px`, bgcolor: c.card, border: `1px solid ${c.hairline}` }}>
      <Typography sx={{ fontSize: 10, lineHeight: 1.2, letterSpacing: ".04em", textTransform: "uppercase", color: c.textDim }}>{label}</Typography>
      <Typography sx={{ fontSize: 14, fontWeight: 800, lineHeight: 1.3, color: c.text, whiteSpace: "nowrap" }}>{value}</Typography>
    </Stack>
  );
};

/** Найденный клиент — компактная строка-кнопка. */
const ClientOption: React.FC<{ client: PosClientSearchResult; onClick: () => void }> = ({ client, onClick }) => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        px: "10px",
        py: "7px",
        gap: "10px",
        justifyContent: "flex-start",
        textAlign: "left",
        borderRadius: `${POS_RADIUS.tile}px`,
        bgcolor: c.card,
        border: `1px solid ${c.hairline}`,
        minWidth: 0,
        "&:hover": { borderColor: c.accent },
      }}
    >
      <Avatar name={client.name} size={30} />
      <Stack gap="2px" sx={{ minWidth: 0, flex: 1 }}>
        <Typography noWrap sx={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2, color: c.text }}>{client.name}</Typography>
        <Typography noWrap sx={{ fontSize: 12, lineHeight: 1.2, color: c.textDim }}>
          {client.phone}
          {client.bonuses ? ` · ${formatPosAmount(client.bonuses)} Б` : ""}
        </Typography>
      </Stack>
    </ButtonBase>
  );
};

/** Форма быстрого создания клиента: имя + телефон, после создания он сразу выбран. */
const RegisterForm: React.FC<{
  initialQuery: string;
  onSubmit: (name: string, phone: string) => void | Promise<boolean | void>;
  onCancel: () => void;
}> = ({ initialQuery, onSubmit, onCancel }) => {
  const theme = useTheme();
  const c = posColors(theme);
  const phoneFirst = looksLikePhone(initialQuery);
  const [name, setName] = React.useState(phoneFirst ? "" : initialQuery.trim());
  const [phone, setPhone] = React.useState(phoneFirst ? initialQuery.trim() : "");
  const [sending, setSending] = React.useState(false);
  const valid = name.trim().length > 0 && phone.replace(/\D/g, "").length >= 6;

  const submit = async () => {
    if (!valid || sending) return;
    setSending(true);
    try {
      const result = await onSubmit(name.trim(), phone.trim());
      if (result !== false) onCancel();
    } finally {
      setSending(false);
    }
  };

  const field = {
    height: 38,
    px: "12px",
    bgcolor: c.card,
    border: `1px solid ${c.hairline}`,
    borderRadius: `${POS_RADIUS.tile}px`,
    fontSize: 14,
    color: c.text,
    "&.Mui-focused": { borderColor: c.accent },
    "& input::placeholder": { color: c.textDim, opacity: 1 },
  } as const;

  return (
    <Box
      component="form"
      onSubmit={(event: React.FormEvent) => {
        event.preventDefault();
        void submit();
      }}
      sx={{ p: "10px", borderRadius: `${POS_RADIUS.card}px`, border: `1px dashed ${c.accent}`, bgcolor: c.page }}
    >
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: c.accentText, mb: "8px" }}>Новый клиент</Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1.2fr) minmax(0, 1fr) auto" },
          gap: "8px",
        }}
      >
        <InputBase autoFocus={!phoneFirst} value={name} onChange={(event) => setName(event.target.value)} placeholder="Имя и фамилия" inputProps={{ "aria-label": "Имя клиента" }} sx={field} />
        <InputBase
          autoFocus={phoneFirst}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+996 700 000 000"
          inputProps={{ inputMode: "tel", "aria-label": "Телефон клиента" }}
          sx={field}
        />
        <Stack direction="row" gap="6px">
          <ButtonBase
            onClick={onCancel}
            disabled={sending}
            sx={{ flex: { xs: 1, md: "none" }, height: 38, px: "12px", borderRadius: `${POS_RADIUS.tile}px`, border: `1px solid ${c.hairline}`, color: c.textSoft, fontSize: 13, fontWeight: 600 }}
          >
            Отмена
          </ButtonBase>
          <ButtonBase
            type="submit"
            disabled={!valid || sending}
            sx={{
              flex: { xs: 2, md: "none" },
              height: 38,
              px: "14px",
              gap: "6px",
              borderRadius: `${POS_RADIUS.tile}px`,
              bgcolor: c.accent,
              color: c.onAccent,
              fontSize: 13,
              fontWeight: 800,
              whiteSpace: "nowrap",
              "&.Mui-disabled": { opacity: 0.45 },
            }}
          >
            {sending ? <CircularProgress size={14} color="inherit" /> : null}
            Создать и выбрать
          </ButtonBase>
        </Stack>
      </Box>
    </Box>
  );
};

/** Футер чека: выбранный клиент либо его поиск и быстрое создание. */
export const PosClientFooter: React.FC<Props> = ({
  client,
  query,
  onQueryChange,
  onSearch,
  results,
  searching = false,
  onSelectClient,
  onRegister,
  onChangeClient,
  onOpenHistory,
  canRegister = false,
  canHistory = false,
}) => {
  const theme = useTheme();
  const c = posColors(theme);
  const [registerOpen, setRegisterOpen] = React.useState(false);
  const [registerSeed, setRegisterSeed] = React.useState("");

  React.useEffect(() => {
    if (client) setRegisterOpen(false);
  }, [client]);

  const shell = {
    flexShrink: 0,
    p: { xs: "10px", md: "12px" },
    bgcolor: c.tile,
    border: `1px solid ${c.outline}`,
    borderRadius: `${POS_RADIUS.card}px`,
  } as const;

  if (client) {
    return (
      <Box sx={{ ...shell, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 16px" }}>
        <Stack direction="row" alignItems="center" gap="10px" sx={{ minWidth: 0, flex: "1 1 220px" }}>
          <Avatar name={client.name} />
          <Stack gap="3px" sx={{ minWidth: 0 }}>
            <Stack direction="row" alignItems="center" gap="6px" sx={{ minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: 15, fontWeight: 800, lineHeight: 1.2, color: c.text }}>{client.name}</Typography>
              {client.tier && (
                <Box sx={{ px: "7px", py: "2px", borderRadius: `${POS_RADIUS.pill}px`, bgcolor: c.accentBg, color: c.accentText, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                  {client.tier}
                </Box>
              )}
            </Stack>
            <Typography noWrap sx={{ fontSize: 12, lineHeight: 1.2, color: c.textDim }}>
              {client.phone}
              {client.nextTier ? ` · до «${client.nextTier}» ${formatPosAmount(client.nextTierAmount)} с` : ""}
            </Typography>
          </Stack>
        </Stack>

        <Stack direction="row" alignItems="center" gap="6px">
          {client.discountPercent > 0 && <ClientMetric label="Скидка" value={`${client.discountPercent}%`} />}
          <ClientMetric label="Бонусы" value={`${formatPosAmount(client.bonuses)} с`} />
        </Stack>

        <Stack direction="row" alignItems="center" gap="6px" sx={{ ml: { md: "auto" } }}>
          {canHistory && <FooterButton label="История" onClick={onOpenHistory} />}
          <FooterButton label="Сменить" onClick={onChangeClient} />
        </Stack>
      </Box>
    );
  }

  const trimmed = query.trim();
  const notFound = results !== null && results.length === 0;
  const openRegister = (seed: string) => {
    setRegisterSeed(seed);
    setRegisterOpen(true);
  };

  return (
    <Stack gap="10px" sx={shell}>
      <Stack direction="row" alignItems="center" gap="8px">
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            height: 38,
            pl: "10px",
            pr: "4px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            bgcolor: c.card,
            border: `1px solid ${c.hairline}`,
            borderRadius: `${POS_RADIUS.tile}px`,
            "&:focus-within": { borderColor: c.accent },
          }}
        >
          <PersonOutlineOutlined sx={{ fontSize: 19, color: c.textDim, flexShrink: 0 }} />
          <InputBase
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSearch?.();
            }}
            placeholder="Клиент: телефон или имя"
            inputProps={{ "aria-label": "Поиск клиента", autoComplete: "off" }}
            sx={{ flex: 1, minWidth: 0, fontSize: 14, color: c.text, "& input::placeholder": { color: c.textDim, opacity: 1 } }}
          />
          {searching ? <CircularProgress size={16} sx={{ color: c.textDim, mr: "6px" }} /> : null}
          {query ? (
            <IconButton aria-label="Очистить поиск клиента" size="small" onClick={() => onQueryChange("")} sx={{ color: c.textDim }}>
              <ClearOutlined sx={{ fontSize: 18 }} />
            </IconButton>
          ) : null}
        </Box>
        {canRegister && (
          <FooterButton
            label="Новый"
            icon={<PersonAddAlt1Outlined />}
            accent={registerOpen}
            onClick={() => (registerOpen ? setRegisterOpen(false) : openRegister(trimmed))}
          />
        )}
      </Stack>

      {!registerOpen && results !== null && (
        notFound ? (
          <Stack direction="row" alignItems="center" flexWrap="wrap" gap="8px">
            <Typography sx={{ fontSize: 13, color: c.textDim }}>
              Клиент «{trimmed}» не найден.
            </Typography>
            {canRegister && (
              <ButtonBase
                onClick={() => openRegister(trimmed)}
                sx={{ fontSize: 13, fontWeight: 700, color: c.accentText, textDecoration: "underline", textUnderlineOffset: 3 }}
              >
                Создать клиента
              </ButtonBase>
            )}
          </Stack>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(auto-fill, minmax(220px, 1fr))" },
              gap: "6px",
              maxHeight: 176,
              overflowY: "auto",
            }}
          >
            {results.map((item) => (
              <ClientOption key={item.id} client={item} onClick={() => onSelectClient(item)} />
            ))}
          </Box>
        )
      )}

      <Collapse in={registerOpen} unmountOnExit>
        <RegisterForm
          key={registerSeed}
          initialQuery={registerSeed}
          onSubmit={onRegister}
          onCancel={() => setRegisterOpen(false)}
        />
      </Collapse>
    </Stack>
  );
};

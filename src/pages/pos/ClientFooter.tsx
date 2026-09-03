import React from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import InputBase from "@mui/material/InputBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

import { POS_RADIUS, posColors } from "./layout";
import type { PosClient, PosClientSearchResult } from "./types";
import { formatPosAmount } from "./format";

type Props = {
  client: PosClient | null;
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  /** null — поиск ещё не запускали; пустой массив — клиент не найден. */
  results: PosClientSearchResult[] | null;
  recent: PosClientSearchResult[];
  onSelectClient: (client: PosClientSearchResult) => void;
  onRegister: (name: string, phone: string) => void;
  onChangeClient: () => void;
  onOpenHistory: () => void;
};

const initials = (name: string): string =>
  name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

/** Кнопка футера: «История покупок», «Сменить клиента», «Найти». */
const FooterButton: React.FC<{ label: string; onClick: () => void; muted?: boolean; height?: number }> = ({
  label,
  onClick,
  muted,
  height,
}) => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        height,
        px: "12px",
        py: height ? 0 : "8px",
        borderRadius: `${height ? POS_RADIUS.control : POS_RADIUS.tile}px`,
        bgcolor: muted ? c.page : c.card,
        border: `1px solid ${c.hairline}`,
        color: c.textSoft,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </ButtonBase>
  );
};

/** Карточка найденного или недавнего клиента. */
const ClientCard: React.FC<{ client: PosClientSearchResult; onClick: () => void }> = ({ client, onClick }) => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        px: "11px",
        py: "7px",
        gap: "10px",
        justifyContent: "flex-start",
        borderRadius: `${POS_RADIUS.card}px`,
        bgcolor: c.card,
        border: `1px solid ${c.hairline}`,
        "&:hover": { borderColor: c.accent },
      }}
    >
      <Box
        sx={{
          width: 34,
          height: 34,
          flexShrink: 0,
          borderRadius: `${POS_RADIUS.pill}px`,
          bgcolor: c.accent,
          color: c.onAccent,
          display: "grid",
          placeItems: "center",
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        {initials(client.name)}
      </Box>
      <Stack gap="4px" alignItems="flex-start" sx={{ minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: 14, lineHeight: 1, color: c.text }}>
          {client.name}
        </Typography>
        <Typography noWrap sx={{ fontSize: 14, lineHeight: 1, color: c.textDim }}>
          {client.phone}
        </Typography>
      </Stack>
      <Stack gap="4px" alignItems="flex-end" sx={{ ml: "16px" }}>
        <Typography sx={{ fontSize: 12, lineHeight: 1, color: c.accentText }}>{client.tier}</Typography>
        <Typography sx={{ fontSize: 12, lineHeight: 1, color: c.textDim, whiteSpace: "nowrap" }}>
          {client.discountPercent}% · {client.bonuses} Б
        </Typography>
      </Stack>
    </ButtonBase>
  );
};

/** Метрика клиента в футере: «СКИДКА 5%», «БОНУСЫ 350 сом». */
const ClientMetric: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const theme = useTheme();
  const c = posColors(theme);
  return (
    <Stack gap="2px">
      <Typography sx={{ fontSize: 12, lineHeight: 1.2, textTransform: "uppercase", color: c.textDim }}>{label}</Typography>
      <Typography sx={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2, color: c.text }}>{value}</Typography>
    </Stack>
  );
};

/** Форма регистрации — показывается, когда поиск ничего не нашёл. */
const RegisterClient: React.FC<{ phone: string; onRegister: (name: string, phone: string) => void }> = ({ phone, onRegister }) => {
  const theme = useTheme();
  const c = posColors(theme);
  const [name, setName] = React.useState("");
  const [phoneValue, setPhoneValue] = React.useState(phone);

  React.useEffect(() => setPhoneValue(phone), [phone]);

  const field = {
    height: 42,
    px: "14px",
    display: "flex",
    alignItems: "center",
    bgcolor: c.card,
    border: `1px solid ${c.hairline}`,
    borderRadius: `${POS_RADIUS.tile}px`,
    fontSize: 14,
    color: c.text,
  } as const;

  return (
    <Box
      sx={{
        p: "12px",
        borderRadius: `${POS_RADIUS.card}px`,
        border: `1px dashed ${c.accent}`,
      }}
    >
      <Stack direction="row" alignItems="center" gap="8px" sx={{ mb: "10px" }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: c.accentText }}>Клиент не найден</Typography>
        <Typography sx={{ fontSize: 14, color: c.textSoft }}>Зарегистрируйте клиента</Typography>
      </Stack>
      <Stack direction="row" alignItems="center" gap="10px">
        <ButtonBase sx={{ ...field, width: 52, justifyContent: "center", fontSize: 12, color: c.textDim }}>Фото</ButtonBase>
        <InputBase
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="ФИО"
          sx={{ ...field, flex: 1, "& input::placeholder": { color: c.textDim, opacity: 1 } }}
        />
        <InputBase value={phoneValue} onChange={(event) => setPhoneValue(event.target.value)} sx={{ ...field, width: 360 }} />
        <ButtonBase
          onClick={() => onRegister(name, phoneValue)}
          sx={{
            height: 42,
            px: "20px",
            borderRadius: `${POS_RADIUS.tile}px`,
            bgcolor: c.tile,
            border: `1px solid ${c.hairline}`,
            color: c.textSoft,
            fontSize: 14,
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          Зарегистрировать
        </ButtonBase>
      </Stack>
    </Box>
  );
};

/** Футер чека: карточка клиента либо его поиск и регистрация. */
export const PosClientFooter: React.FC<Props> = ({
  client,
  query,
  onQueryChange,
  onSearch,
  results,
  recent,
  onSelectClient,
  onRegister,
  onChangeClient,
  onOpenHistory,
}) => {
  const theme = useTheme();
  const c = posColors(theme);

  const shell = {
    flexShrink: 0,
    p: "16px",
    bgcolor: c.tile,
    borderRadius: `${POS_RADIUS.card}px`,
  } as const;

  if (client) {
    return (
      <Box sx={{ ...shell, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "24px" }}>
        <Stack direction="row" alignItems="center" gap="24px" sx={{ minWidth: 0 }}>
          <Stack gap="8px" sx={{ width: 268, flexShrink: 0 }}>
            <Stack direction="row" alignItems="center" gap="12px">
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  flexShrink: 0,
                  borderRadius: `${POS_RADIUS.pill}px`,
                  bgcolor: c.accent,
                  color: c.onAccent,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                {initials(client.name)}
              </Box>
              <Stack gap="6px" sx={{ minWidth: 0 }}>
                <Stack direction="row" alignItems="center" gap="6px">
                  <Typography noWrap sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2, color: c.text }}>
                    {client.name}
                  </Typography>
                  <Box
                    sx={{
                      px: "8px",
                      py: "2px",
                      borderRadius: `${POS_RADIUS.pill}px`,
                      bgcolor: c.accentBg,
                      color: c.accentText,
                      fontSize: 12,
                      fontWeight: 700,
                      lineHeight: 1.2,
                    }}
                  >
                    {client.tier}
                  </Box>
                </Stack>
                <Typography sx={{ fontSize: 14, lineHeight: 1.2, color: c.textDim }}>{client.phone}</Typography>
              </Stack>
            </Stack>

            <Box sx={{ height: "1px", bgcolor: c.outline }} />

            <Stack direction="row" alignItems="center" gap="11px">
              <Box sx={{ flex: 1, height: 4, borderRadius: `${POS_RADIUS.pill}px`, bgcolor: c.card, overflow: "hidden" }}>
                <Box sx={{ width: `${Math.round(client.tierProgress * 100)}%`, height: "100%", bgcolor: c.accent }} />
              </Box>
              <Typography sx={{ fontSize: 14, lineHeight: 1.2, color: c.textDim, whiteSpace: "nowrap" }}>
                до «{client.nextTier}» {formatPosAmount(client.nextTierAmount)} с
              </Typography>
            </Stack>
          </Stack>

          <Box sx={{ width: "1px", alignSelf: "stretch", bgcolor: c.outline }} />

          <Stack direction="row" alignItems="center" gap="24px">
            <ClientMetric label="Скидка" value={`${client.discountPercent}%`} />
            <ClientMetric label="Бонусы" value={`${formatPosAmount(client.bonuses)} сом`} />
            <ClientMetric label="Кешбэк" value={`${formatPosAmount(client.cashback)} сом`} />
          </Stack>
        </Stack>

        <Stack direction="row" alignItems="center" gap="6px" sx={{ flexShrink: 0 }}>
          <FooterButton label="История покупок" onClick={onOpenHistory} />
          <FooterButton label="Сменить клиента" onClick={onChangeClient} muted />
        </Stack>
      </Box>
    );
  }

  const notFound = results !== null && results.length === 0;
  const cards = results ?? recent;

  return (
    <Box sx={{ ...shell, display: "flex", flexDirection: "column", gap: "16px" }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap="24px">
        <Stack gap="2px" sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2, color: c.text }}>Клиент не указан</Typography>
          <Typography sx={{ fontSize: 14, lineHeight: 1.2, color: c.textDim }}>Найдите клиента, чтобы применить бонусы</Typography>
        </Stack>
        <Stack direction="row" alignItems="center" gap="8px" sx={{ flexShrink: 0 }}>
          <Box
            sx={{
              width: 348,
              height: 42,
              px: "17px",
              display: "flex",
              alignItems: "center",
              bgcolor: c.card,
              border: `1px solid ${c.hairline}`,
              borderRadius: `${POS_RADIUS.control}px`,
            }}
          >
            <InputBase
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSearch();
              }}
              placeholder="Телефон или имя"
              sx={{ flex: 1, fontSize: 14, color: c.text, "& input::placeholder": { color: c.textDim, opacity: 1 } }}
            />
          </Box>
          <FooterButton label="Найти" onClick={onSearch} height={42} />
        </Stack>
      </Stack>

      <Box sx={{ height: "1px", bgcolor: c.outline }} />

      {notFound ? (
        <RegisterClient phone={query} onRegister={onRegister} />
      ) : (
        <Stack gap="8px">
          <Typography sx={{ fontSize: 12, lineHeight: 1.2, textTransform: "uppercase", color: c.textDim }}>
            {results ? `Найдено: ${results.length}` : "Недавние клиенты"}
          </Typography>
          <Stack direction="row" gap="10px" sx={{ overflowX: "auto" }}>
            {cards.map((item) => (
              <ClientCard key={item.id} client={item} onClick={() => onSelectClient(item)} />
            ))}
          </Stack>
        </Stack>
      )}
    </Box>
  );
};

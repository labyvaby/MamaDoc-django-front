import React from "react";
import { Box, LinearProgress, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import PeopleOutlineOutlined from "@mui/icons-material/PeopleOutlineOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";
import CakeOutlined from "@mui/icons-material/CakeOutlined";
import { AppCard, ListEmptyState, ListLoadingSkeleton, UserAvatar } from "../../components/ui";
import { subtleBg } from "../../theme/uiHelpers";
import { birthdayCountdownLabel, daysUntilBirthday } from "../../utility/age";
import type { DjangoClient } from "../../api/clients";

/** Совпадает с порогом баннера в карточке клиента. */
const BIRTHDAY_SOON_DAYS = 7;

type Props = {
  clients: DjangoClient[];
  selectedId: number | null;
  loading: boolean;
  fetching?: boolean;
  error: string | null;
  /** Активен фильтр — пустой список значит «никого не нашли», а не «клиентов нет». */
  filtered?: boolean;
  onSelect: (client: DjangoClient) => void;
};

export default function ClientListPanel({ clients, selectedId, loading, fetching = false, error, filtered = false, onSelect }: Props) {
  return (
    <AppCard
      variant="outlined"
      disableContentPadding
      sx={{ height: "100%", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}
      header={
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, pt: 2, pb: 1.5 }}>
          <Stack direction="row" alignItems="center" gap={1.25}>
            <PeopleOutlineOutlined color="primary" />
            <Typography variant="h6">Клиенты</Typography>
          </Stack>
          {!error && clients.length > 0 && (
            <Box sx={(t) => ({ px: 1, py: 0.25, borderRadius: "999px", bgcolor: subtleBg(t, true) })}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                {clients.length}{clients.length >= 100 ? "+" : ""}
              </Typography>
            </Box>
          )}
        </Stack>
      }
    >
      {fetching && !loading && <LinearProgress sx={{ position: "absolute", top: 0, left: 0, right: 0, height: 2 }} />}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", borderTop: 1, borderColor: "divider" }}>
        {error ? (
          <ListEmptyState icon={<ErrorOutlineOutlined />} title="Не удалось загрузить клиентов" description={error} />
        ) : loading ? (
          <ListLoadingSkeleton rows={8} />
        ) : clients.length === 0 ? (
          <ListEmptyState
            icon={<PeopleOutlineOutlined />}
            title="Клиенты не найдены"
            description={filtered ? "Измените поиск или месяц рождения" : "Добавьте первого клиента"}
          />
        ) : (
          <Stack spacing={0.5} sx={{ p: 1 }}>
            {clients.map((client) => (
              <ClientRow key={client.id} client={client} active={selectedId === client.id} onSelect={onSelect} />
            ))}
          </Stack>
        )}
      </Box>
    </AppCard>
  );
}

function ClientRow({ client, active, onSelect }: { client: DjangoClient; active: boolean; onSelect: (client: DjangoClient) => void }) {
  const days = client.clientType === "company" ? null : daysUntilBirthday(client.dob);
  const soon = days != null && days <= BIRTHDAY_SOON_DAYS;
  return (
    <Box
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={() => onSelect(client)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(client);
        }
      }}
      sx={(theme) => ({
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        p: 1.25,
        borderRadius: "10px",
        cursor: "pointer",
        border: 1,
        borderColor: active ? alpha(theme.palette.primary.main, 0.45) : "transparent",
        bgcolor: active ? alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.16 : 0.09) : "transparent",
        transition: "background-color .15s ease, border-color .15s ease",
        "&:hover": { bgcolor: active ? undefined : subtleBg(theme) },
        "&:focus-visible": { outline: "none", borderColor: alpha(theme.palette.primary.main, 0.55) },
      })}
    >
      <UserAvatar src={client.photoUrl} name={client.fullName} size={40} sx={{ borderRadius: "10px", fontSize: 13, flexShrink: 0 }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" alignItems="center" gap={0.75} minWidth={0}>
          <Typography variant="body2" fontWeight={600} noWrap>{client.fullName || "Без имени"}</Typography>
          {client.customerStatus && (
            <Tooltip title={client.customerStatus.name}>
              <Box component="span" sx={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, bgcolor: client.customerStatus.color }} />
            </Tooltip>
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
          {client.phone || client.email || "Контакты не указаны"}
        </Typography>
      </Box>
      {client.dob && days != null && (
        <Tooltip title={soon ? `День рождения ${birthdayCountdownLabel(days)}` : "День рождения"}>
          <Stack
            direction="row"
            alignItems="center"
            gap={0.5}
            sx={(t) => ({
              flexShrink: 0,
              px: 0.75,
              py: 0.25,
              borderRadius: "999px",
              color: soon ? (t.palette.mode === "dark" ? t.palette.warning.light : t.palette.warning.dark) : "text.secondary",
              bgcolor: soon ? alpha(t.palette.warning.main, t.palette.mode === "dark" ? 0.18 : 0.12) : "transparent",
              "& .MuiSvgIcon-root": { fontSize: 14 },
            })}
          >
            <CakeOutlined />
            <Typography variant="caption" fontWeight={soon ? 700 : 500} sx={{ whiteSpace: "nowrap" }}>
              {days === 0 ? "сегодня" : dayjs(client.dob).locale("ru").format("D MMM")}
            </Typography>
          </Stack>
        </Tooltip>
      )}
    </Box>
  );
}

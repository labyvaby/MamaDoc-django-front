/**
 * «Гости» — тот же экран, что «Все пациенты» (DjangoPatientsPage), той же
 * компоновкой (список слева + карточка + история проживаний) и теми же
 * общими UI-примитивами (PageHeader/AppCard/UserAvatar/InfoTile/subtleBg —
 * не копии, а прямой импорт из components/ui и theme/uiHelpers), но поля и
 * подписи — отельные, чтобы сразу было видно, что это не картотека
 * пациентов. Подключена вместо DjangoPatientsPage в src/pages/patients/index.tsx.
 *
 * Реальные гости — GET /hotel/guests/?q= (см. src/api/hotel.ts), поиск на
 * бэкенде с debounce, без клиентской фильтрации и без бесконечной подгрузки
 * (гостей от силы пара десятков, не тысячи, см. hotel-viva-frontend-api.md).
 * Кнопка «Добавить» открывает AddGuestDrawer (та же Drawer-форма и логика
 * черновика, что реальный DjangoAddPatientDrawer) — гость заводится
 * независимо от брони, как пациент независимо от приёма; создание/выбор
 * номера остаётся на «Расписании» (CreateBookingButton).
 */
import React from "react";
import { Box, Button, InputAdornment, TextField, useMediaQuery, useTheme } from "@mui/material";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import PersonAddAltOutlined from "@mui/icons-material/PersonAddAltOutlined";
import PersonSearchOutlined from "@mui/icons-material/PersonSearchOutlined";
import IconButton from "@mui/material/IconButton";
import { useQuery } from "@tanstack/react-query";

import { usePageTitle } from "../hooks/usePageTitle";
import { EmptyState, HotelPageHeader, plural, Surface } from "./hotelUi";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { listGuests } from "../api/hotel";
import { GuestListPanel } from "./GuestListPanel";
import { GuestCardPanel } from "./GuestCardPanel";
import { GuestHistoryPanel } from "./GuestHistoryPanel";
import { GuestPaymentDialog } from "./GuestPaymentDialog";
import { useGuestDetails } from "./useGuestDetails";
import { AddGuestDrawer } from "./AddGuestDrawer";

export const HotelGuestsPage: React.FC = () => {
  usePageTitle("Гости");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search.trim());
  const [selectedClientId, setSelectedClientId] = React.useState<number | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);

  const guestsQuery = useQuery({
    queryKey: ["hotel", "guests", debouncedSearch],
    queryFn: ({ signal }) => listGuests({ q: debouncedSearch || undefined }, signal),
  });
  const guests = guestsQuery.data ?? [];

  // Общее состояние карточки+истории — один хук на обе колонки, тот же
  // приём, что связывает GuestCardPanel и GuestHistoryPanel в GuestDetailsDialog.
  const state = useGuestDetails(selectedClientId);

  const listNode = (
    <GuestListPanel
      guests={guests}
      totalCount={guests.length}
      selectedClientId={selectedClientId}
      onSelect={setSelectedClientId}
      loading={guestsQuery.isPending}
    />
  );
  const cardNode = <GuestCardPanel clientId={selectedClientId} state={state} onDeleted={() => setSelectedClientId(null)} />;
  const historyNode = <GuestHistoryPanel state={state} />;

  const blacklisted = guests.filter((g) => g.isBlacklisted).length;

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={(t) => ({ px: t.appLayout.page.paddingX, pt: { xs: 2, md: 3 }, pb: 2.5 })}>
        <HotelPageHeader
          title="Гости"
          subtitle={
            guestsQuery.isSuccess
              ? debouncedSearch
                ? `Найдено: ${guests.length}`
                : `${guests.length} ${plural(guests.length, "гость", "гостя", "гостей")} в базе` +
                  (blacklisted > 0 ? ` · ${blacklisted} в чёрном списке` : "")
              : undefined
          }
          actions={
            <>
              <TextField
                size="small"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Имя, телефон, документ, ИНН"
                sx={{ width: { xs: "100%", sm: 300 } }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchOutlined fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <Button variant="contained" disableElevation startIcon={<PersonAddAltOutlined />} onClick={() => setAddOpen(true)}>
                Добавить гостя
              </Button>
            </>
          }
        />
      </Box>
      <AddGuestDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(clientId) => {
          setAddOpen(false);
          void guestsQuery.refetch();
          setSelectedClientId(clientId);
        }}
      />
      {/* «Оплата» в GuestHistoryPanel (historyNode ниже) только взводит paymentEdit
          в useGuestDetails — сам диалог общий, рендерим его здесь же, как
          GuestDetailsDialog делает у себя для модалки с шахматки. */}
      <GuestPaymentDialog state={state} />

      <Box
        sx={(t) => ({
          px: t.appLayout.page.paddingX,
          pb: 2,
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "row",
          gap: 2,
          overflow: "hidden",
        })}
      >
        {isMobile ? (
          selectedClientId != null ? (
            <Box sx={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", gap: 1.5, overflowY: "auto" }}>
              <IconButton size="small" onClick={() => setSelectedClientId(null)} sx={{ alignSelf: "flex-start" }}>
                <ArrowBackOutlined fontSize="small" />
              </IconButton>
              <Box sx={{ minHeight: 320 }}>{cardNode}</Box>
              <Box sx={{ minHeight: 320 }}>{historyNode}</Box>
            </Box>
          ) : (
            <Box sx={{ flex: 1, minWidth: 0, height: "100%" }}>{listNode}</Box>
          )
        ) : (
          <>
            <Box sx={{ flex: "4.5 1 0", minWidth: 0, height: "100%" }}>{listNode}</Box>
            {selectedClientId == null ? (
              // Две одинаковые заглушки «Гость не выбран» рядом — шум; одна на обе колонки.
              <Surface sx={{ flex: "7.5 1 0", minWidth: 0, height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <EmptyState
                  icon={<PersonSearchOutlined />}
                  title="Выберите гостя"
                  description="Слева — все гости отеля. Карточка с документами и история проживаний с оплатами откроются здесь."
                />
              </Surface>
            ) : (
              <>
                <Box sx={{ flex: "3.5 1 0", minWidth: 0, height: "100%" }}>{cardNode}</Box>
                <Box sx={{ flex: "4 1 0", minWidth: 0, height: "100%" }}>{historyNode}</Box>
              </>
            )}
          </>
        )}
      </Box>
    </Box>
  );
};

export default HotelGuestsPage;

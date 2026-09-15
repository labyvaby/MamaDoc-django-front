/**
 * «Гости» — тот же экран, что «Все пациенты» (DjangoPatientsPage), той же
 * компоновкой (список слева + карточка + история проживаний) и теми же
 * общими UI-примитивами (PageHeader/AppCard/UserAvatar/InfoTile/subtleBg —
 * не копии, а прямой импорт из components/ui и theme/uiHelpers), но поля и
 * подписи — отельные, чтобы сразу было видно, что это не картотека
 * пациентов. Подключена вместо DjangoPatientsPage в src/pages/patients/index.tsx.
 *
 * Отличия неизбежны там, где у гостя просто нет аналога сущности: нет
 * отдельной картотеки (гость — это имя внутри брони, getHotelGuests в
 * mockDemoData.ts), поэтому нет бесконечной подгрузки с сервера (гостей от
 * силы пара десятков, не тысячи), нет счёта/бонусов/семьи/объединения
 * дублей/фото лица — реальных данных для этого в сторе нет, а выдумывать
 * рабочие с виду, но ничего не делающие кнопки хуже, чем не рисовать их
 * вовсе. Кнопка «Добавить» открывает создание брони (requestQuickBooking
 * без аргументов) — гость у отеля и появляется только через бронь.
 */
import React from "react";
import { Box, useMediaQuery, useTheme } from "@mui/material";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import IconButton from "@mui/material/IconButton";

import { PageHeader } from "../components/ui";
import { usePageTitle } from "../hooks/usePageTitle";
import { getHotelGuests, requestQuickBooking, subscribeGuestBlacklist, getGuestBlacklistSnapshot } from "./mockDemoData";
import { GuestListPanel } from "./GuestListPanel";
import { GuestCardPanel } from "./GuestCardPanel";
import { GuestHistoryPanel } from "./GuestHistoryPanel";
import { useGuestDetails } from "./useGuestDetails";
import { CreateBookingButton } from "./CreateBookingButton";

export const HotelGuestsPage: React.FC = () => {
  usePageTitle("Гости");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  // Снимок в зависимостях — без него пометка «в чёрный список» не обновит
  // список слева сразу же (getHotelGuests сам не подписан на этот стор).
  const blacklistSnapshot = React.useSyncExternalStore(subscribeGuestBlacklist, getGuestBlacklistSnapshot);
  const guests = React.useMemo(
    () => getHotelGuests(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blacklistSnapshot],
  );
  const [search, setSearch] = React.useState("");
  const [selectedName, setSelectedName] = React.useState<string | null>(null);

  const query = search.trim().toLowerCase();
  const filtered = query
    ? guests.filter((g) => g.name.toLowerCase().includes(query) || g.phone.includes(query))
    : guests;

  // Общее состояние карточки+истории — один хук на обе колонки, тот же
  // приём, что связывает GuestCardPanel и GuestHistoryPanel в GuestDetailsDialog.
  const state = useGuestDetails(selectedName);

  const listNode = <GuestListPanel guests={filtered} totalCount={guests.length} selectedName={selectedName} onSelect={setSelectedName} />;
  const cardNode = <GuestCardPanel guestName={selectedName} state={state} />;
  const historyNode = <GuestHistoryPanel state={state} />;

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <PageHeader
        title="Гости"
        showTitle={false}
        addButtonText="Добавить"
        onAdd={() => requestQuickBooking()}
        showSearch
        searchVal={search}
        onSearchChange={setSearch}
        searchPlaceholder="Поиск по имени или телефону"
      />
      {/* Слушает requestQuickBooking() из onAdd выше — своей кнопки не рисует. */}
      <CreateBookingButton hideTrigger />

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
          selectedName ? (
            <Box sx={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", gap: 1.5, overflowY: "auto" }}>
              <IconButton size="small" onClick={() => setSelectedName(null)} sx={{ alignSelf: "flex-start" }}>
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
            <Box sx={{ flex: "3 1 0", minWidth: 0, height: "100%" }}>{listNode}</Box>
            <Box sx={{ flex: "3.5 1 0", minWidth: 0, height: "100%" }}>{cardNode}</Box>
            <Box sx={{ flex: "5.5 1 0", minWidth: 0, height: "100%" }}>{historyNode}</Box>
          </>
        )}
      </Box>
    </Box>
  );
};

export default HotelGuestsPage;

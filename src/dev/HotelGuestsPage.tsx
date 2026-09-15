/**
 * «Гости» — список гостей отеля для Viva. Подключена вместо DjangoPatientsPage
 * в src/pages/patients/index.tsx: та страница ходит на настоящий бэкенд, а у
 * Viva там нет ни организации, ни картотеки. Гости собраны из тех же броней,
 * что и RoomBookingGrid/HotelOccupancyBanner (getHotelGuests, mockDemoData.ts)
 * — отдельной сущности «гость» в API нет, это имя внутри брони.
 *
 * Паритет с «Все пациенты» (DjangoPatientsPage) в той мере, в какой это
 * осмысленно для гостя-без-картотеки: фото документа вместо аватара-заглушки
 * (как photoUrl у пациента), бейдж чёрного списка на аватаре (как у
 * заблокированного пациента) и кнопка «Добавить» — здесь она открывает
 * создание брони (CreateBookingButton), потому что гость и появляется только
 * через бронь, отдельной формы «просто гость» не существует.
 */
import React from "react";
import {
  Alert,
  Avatar,
  Badge,
  Box,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";

import { usePageTitle } from "../hooks/usePageTitle";
import {
  getHotelGuests,
  initialsOf,
  subscribeGuestBlacklist,
  getGuestBlacklistSnapshot,
} from "./mockDemoData";
import { GuestDetailsDialog } from "./GuestDetailsDialog";
import { CreateBookingButton } from "./CreateBookingButton";

export const HotelGuestsPage: React.FC = () => {
  usePageTitle("Гости");
  const theme = useTheme();
  // Снимок в зависимостях — без него пометка «в чёрный список» не обновит
  // бейджи в списке сразу же (getHotelGuests сам не подписан на этот стор).
  const blacklistSnapshot = React.useSyncExternalStore(subscribeGuestBlacklist, getGuestBlacklistSnapshot);
  const guests = React.useMemo(
    () => getHotelGuests(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blacklistSnapshot],
  );
  const [search, setSearch] = React.useState("");
  const [selectedGuest, setSelectedGuest] = React.useState<string | null>(null);

  const query = search.trim().toLowerCase();
  const filtered = query
    ? guests.filter((g) => g.name.toLowerCase().includes(query) || g.phone.includes(query))
    : guests;

  const blacklistedCount = guests.filter((g) => g.isBlacklisted).length;

  return (
    <Box sx={{ height: "100%", overflow: "auto", px: theme.appLayout.page.paddingX, py: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap" sx={{ mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>
          Гости
        </Typography>
        <Stack direction="row" alignItems="center" gap={2}>
          <Typography variant="body2" color="text.secondary">
            Всего: {guests.length}
            {blacklistedCount > 0 && ` · В чёрном списке: ${blacklistedCount}`}
          </Typography>
          <CreateBookingButton />
        </Stack>
      </Stack>

      <Alert severity="info" variant="outlined" sx={{ mb: 2, fontSize: "0.8rem" }}>
        Список собран из броней Viva — отдельной картотеки гостей в системе нет. Новый гость появляется
        через создание брони.
      </Alert>

      <TextField
        placeholder="Поиск по имени или телефону"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small"
        fullWidth
        sx={{ mb: 2, maxWidth: 420 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlined fontSize="small" sx={{ color: "text.secondary" }} />
              </InputAdornment>
            ),
          },
        }}
      />

      {filtered.length === 0 ? (
        <Typography variant="body2" color="text.disabled">
          {guests.length === 0 ? "Гостей пока нет." : "Ничего не найдено."}
        </Typography>
      ) : (
        <Stack gap={1}>
          {filtered.map((g) => (
            <Box
              key={g.name}
              component="button"
              type="button"
              onClick={() => setSelectedGuest(g.name)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                px: 1.75,
                py: 1.25,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: "12px",
                bgcolor: "background.paper",
                font: "inherit",
                color: "inherit",
                textAlign: "left",
                cursor: "pointer",
                width: "100%",
                maxWidth: 560,
                "&:hover": { borderColor: "primary.main" },
              }}
            >
              <Badge
                overlap="circular"
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                badgeContent={
                  g.isBlacklisted ? (
                    <Tooltip title={g.blacklistReason ? `Чёрный список: ${g.blacklistReason}` : "В чёрном списке"}>
                      <Box
                        sx={{
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          bgcolor: "error.main",
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "2px solid",
                          borderColor: "background.paper",
                        }}
                      >
                        <WarningAmberOutlined sx={{ fontSize: 10 }} />
                      </Box>
                    </Tooltip>
                  ) : null
                }
              >
                <Avatar
                  src={g.photoDataUrl}
                  sx={{ bgcolor: "primary.main", fontWeight: 700, flexShrink: 0 }}
                >
                  {initialsOf(g.name)}
                </Avatar>
              </Badge>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} noWrap>
                  {g.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {g.phone}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                {g.bookings.length} {g.bookings.length === 1 ? "проживание" : "проживаний"}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}

      <GuestDetailsDialog guestName={selectedGuest} onClose={() => setSelectedGuest(null)} />
    </Box>
  );
};

export default HotelGuestsPage;

/**
 * «Гости» — список гостей отеля для Viva. Подключена вместо DjangoPatientsPage
 * в src/pages/patients/index.tsx: та страница ходит на настоящий бэкенд, а у
 * Viva там нет ни организации, ни картотеки. Гости собраны из тех же броней,
 * что и RoomBookingGrid/HotelOccupancyBanner (getHotelGuests, mockDemoData.ts)
 * — отдельной сущности «гость» в API нет, это имя внутри брони.
 */
import React from "react";
import {
  Alert,
  Avatar,
  Box,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import SearchOutlined from "@mui/icons-material/SearchOutlined";

import { usePageTitle } from "../hooks/usePageTitle";
import { getHotelGuests, initialsOf } from "./mockDemoData";
import { GuestDetailsDialog } from "./GuestDetailsDialog";

export const HotelGuestsPage: React.FC = () => {
  usePageTitle("Гости");
  const theme = useTheme();
  const guests = React.useMemo(() => getHotelGuests(), []);
  const [search, setSearch] = React.useState("");
  const [selectedGuest, setSelectedGuest] = React.useState<string | null>(null);

  const query = search.trim().toLowerCase();
  const filtered = query
    ? guests.filter((g) => g.name.toLowerCase().includes(query) || g.phone.includes(query))
    : guests;

  return (
    <Box sx={{ height: "100%", overflow: "auto", px: theme.appLayout.page.paddingX, py: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>
          Гости
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Всего: {guests.length}
        </Typography>
      </Stack>

      <Alert severity="info" variant="outlined" sx={{ mb: 2, fontSize: "0.8rem" }}>
        Список собран из броней Viva — отдельной картотеки гостей в системе нет.
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
              <Avatar sx={{ bgcolor: "primary.main", fontWeight: 700, flexShrink: 0 }}>
                {initialsOf(g.name)}
              </Avatar>
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

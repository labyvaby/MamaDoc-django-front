/**
 * «Настройки» для Viva — переключатель между «Роли и права»
 * (HotelRolesSettingsPage) и «Номера» (HotelRoomsSettingsPage). Заменяет
 * реальный SettingsIndexPage целиком (см. SettingsRouter.tsx) — у Viva нет
 * ни RBAC, ни клинической специфики реальных вкладок настроек, а два своих
 * хотельных раздела не требуют полноценного левого рельса SettingsLayout.tsx —
 * тот же лёгкий переключатель-пилюля, что «Календарь»/«Настройка» на
 * schedule/django/index.tsx, но без анимации фона (нет смысла тащить
 * framer-motion ради двух вкладок).
 */
import React from "react";
import { Box, ButtonBase, Stack } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AdminPanelSettingsOutlined from "@mui/icons-material/AdminPanelSettingsOutlined";
import MeetingRoomOutlined from "@mui/icons-material/MeetingRoomOutlined";

import { HotelRolesSettingsPage } from "./HotelRolesSettingsPage";
import { HotelRoomsSettingsPage } from "./HotelRoomsSettingsPage";

type HotelSettingsTab = "roles" | "rooms";

const TABS: { id: HotelSettingsTab; label: string; icon: React.ElementType }[] = [
  { id: "roles", label: "Роли и права", icon: AdminPanelSettingsOutlined },
  { id: "rooms", label: "Номера", icon: MeetingRoomOutlined },
];

export const HotelSettingsPage: React.FC = () => {
  const theme = useTheme();
  const [tab, setTab] = React.useState<HotelSettingsTab>("roles");

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Stack
        direction="row"
        sx={{
          mx: theme.appLayout.page.paddingX,
          mt: 2,
          p: 0.5,
          gap: 0.25,
          border: 1,
          borderColor: "divider",
          borderRadius: "10px",
          bgcolor: "background.paper",
          width: "fit-content",
          flexShrink: 0,
        }}
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <ButtonBase
              key={id}
              onClick={() => setTab(id)}
              sx={{
                px: 1.5,
                py: 0.75,
                borderRadius: "7px",
                fontSize: "0.85rem",
                fontWeight: 500,
                color: active ? "primary.contrastText" : "text.secondary",
                bgcolor: active ? "primary.main" : "transparent",
                transition: "background-color .15s ease, color .15s ease",
              }}
            >
              <Stack direction="row" alignItems="center" gap={0.75}>
                <Icon sx={{ fontSize: 17 }} />
                <span>{label}</span>
              </Stack>
            </ButtonBase>
          );
        })}
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0 }}>{tab === "roles" ? <HotelRolesSettingsPage /> : <HotelRoomsSettingsPage />}</Box>
    </Box>
  );
};

export default HotelSettingsPage;

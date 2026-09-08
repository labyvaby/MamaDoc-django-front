import React from "react";
import {
  Box,
  CircularProgress,
  Card,
  Stack,
  Typography,
} from "@mui/material";
import PeopleOutlineOutlined from "@mui/icons-material/PeopleOutlineOutlined";
import { alpha } from "@mui/material/styles";
import { UserAvatar } from "../../components/ui";
import { subtleBg } from "../../theme/uiHelpers";
import type { DjangoClient } from "../../api/clients";

type Props = {
  clients: DjangoClient[];
  selectedId: number | null;
  loading: boolean;
  error: string | null;
  onSelect: (client: DjangoClient) => void;
};

export default function ClientListPanel({ clients, selectedId, loading, error, onSelect }: Props) {
  return (
    <Card variant="outlined" sx={{ height: "100%", overflow: "hidden", display: "flex", flexDirection: "column", borderRadius: 2 }}>
      {loading && <LinearProgressCompat />}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, pt: 2, pb: 1.5 }}>
        <Stack direction="row" alignItems="center" gap={1.25}>
          <PeopleOutlineOutlined color="primary" />
          <Typography variant="h6">Клиенты</Typography>
        </Stack>
        {!error && clients.length > 0 && <Typography variant="caption" color="text.secondary">{clients.length}{clients.length >= 100 ? "+" : ""}</Typography>}
      </Stack>
      <Box sx={{ flex: 1, overflowY: "auto" }}>
        {error && <Typography color="error" sx={{ p: 2 }}>{error}</Typography>}
        {!loading && !error && clients.length === 0 && (
          <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 220, px: 3, textAlign: "center" }}>
            <PeopleOutlineOutlined color="disabled" sx={{ fontSize: 34, mb: 1 }} />
            <Typography color="text.secondary">Клиенты не найдены</Typography>
          </Stack>
        )}
        <Stack spacing={0.5} sx={{ px: 1, pb: 1 }}>
          {clients.map((client) => {
            const active = selectedId === client.id;
            return <Box
              key={client.id}
              role="button"
              tabIndex={0}
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
                borderRadius: 1.5,
                cursor: "pointer",
                border: 1,
                borderColor: active ? alpha(theme.palette.primary.main, 0.45) : "transparent",
                bgcolor: active ? alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.16 : 0.09) : "transparent",
                transition: "background-color .15s ease, border-color .15s ease",
                "&:hover": { bgcolor: active ? undefined : subtleBg(theme) },
                "&:focus-visible": { outline: "none", borderColor: alpha(theme.palette.primary.main, 0.55) },
              })}
            >
              <UserAvatar src={client.photoUrl} name={client.fullName} size={38} sx={{ borderRadius: "10px", fontSize: 13, flexShrink: 0 }} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" fontWeight={600} noWrap>{client.fullName || "Без имени"}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>{client.phone || client.email || "Контакты не указаны"}</Typography>
              </Box>
            </Box>;
          })}
        </Stack>
      </Box>
    </Card>
  );
}

function LinearProgressCompat() {
  return <Box sx={{ height: 3, bgcolor: "action.hover", position: "relative", overflow: "hidden" }}><CircularProgress size={16} sx={{ position: "absolute", left: "50%", top: -7 }} /></Box>;
}

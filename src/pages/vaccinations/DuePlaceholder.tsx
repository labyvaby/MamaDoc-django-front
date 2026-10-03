import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import UpcomingOutlined from "@mui/icons-material/UpcomingOutlined";

/**
 * «Кому пора» до модуля учёта детей: список будет строиться только по детям,
 * состоящим на учёте в клинике, — пока учёта нет, вкладка честно пустая.
 */
const DuePlaceholder: React.FC = () => (
  <Box
    sx={(th) => ({
      flex: 1,
      minHeight: 260,
      display: "grid",
      placeItems: "center",
      border: 1,
      borderStyle: "dashed",
      borderColor: "divider",
      borderRadius: "12px",
      bgcolor: alpha(th.palette.primary.main, 0.03),
      p: 3,
    })}
  >
    <Stack spacing={1.5} alignItems="center" sx={{ maxWidth: 460, textAlign: "center" }}>
      <Box
        sx={(th) => ({
          width: 52,
          height: 52,
          borderRadius: "14px",
          display: "grid",
          placeItems: "center",
          color: "primary.main",
          bgcolor: alpha(th.palette.primary.main, 0.12),
        })}
      >
        <UpcomingOutlined />
      </Box>
      <Typography variant="subtitle1" fontWeight={700}>
        Здесь будут дети, состоящие на учёте
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Список «кому пора» строится только по детям, которых клиника ведёт на учёте: у каждого — ближайшая
        положенная прививка по календарю КР, срок и кнопки «записать», «медотвод», «отказ».
      </Typography>
      <Typography variant="caption" color="text.disabled">
        Появится вместе с модулем «Учёт детей». Календарь каждого ребёнка уже есть в карточке пациента.
      </Typography>
    </Stack>
  </Box>
);

export default DuePlaceholder;

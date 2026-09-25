import React from "react";
import { Box, Card, CardActionArea, Chip, Collapse, Stack, Typography } from "@mui/material";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";

import type { CatalogModule } from "../../../api/tenancy";

/**
 * «Уже в вашем пакете»: подключённые базовые модули, свёрнуто.
 * Card, а не Box: мобильный SettingsLayout растягивает кнопки в последнем Box корня.
 */
export const BasePackageBlock: React.FC<{ modules: CatalogModule[] }> = ({ modules }) => {
  const [open, setOpen] = React.useState(false);
  if (modules.length === 0) return null;
  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardActionArea onClick={() => setOpen((v) => !v)} aria-expanded={open} sx={{ px: 2, py: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Inventory2Outlined color="action" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={700}>
              Уже в вашем пакете · {modules.length}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Входит в базовый пакет — отдельно не оплачивается
            </Typography>
          </Box>
          <ExpandMoreOutlined sx={{ transition: "transform .2s", transform: open ? "rotate(180deg)" : "none" }} />
        </Stack>
      </CardActionArea>
      <Collapse in={open} unmountOnExit>
        <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1} sx={{ px: 2, pb: 2 }}>
          {modules.map((m) => (
            <Chip key={m.code} size="small" variant="outlined" icon={<CheckOutlined />} label={m.name} />
          ))}
        </Stack>
      </Collapse>
    </Card>
  );
};

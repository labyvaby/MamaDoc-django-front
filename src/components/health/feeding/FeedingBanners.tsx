import React from "react";
import { Box, Stack, Typography, alpha, useTheme } from "@mui/material";

import type { FoodIntroduction } from "../../../api/health";
import { AppButton } from "../../ui";
import type { FeedingBanner } from "./feedingAdvice";
import { bannerTone, toneColor } from "./feedingUi";

interface FeedingBannersProps {
  banners: ReadonlyArray<FeedingBanner>;
  canManage: boolean;
  /** «Записать как аллергию» у нерешённой реакции. */
  onRecordAllergy: (food: FoodIntroduction) => void;
}

/** Баннеры §3.9: сначала красные, потом жёлтые, последним — синий «риск аллергии». */
export const FeedingBanners: React.FC<FeedingBannersProps> = ({ banners, canManage, onRecordAllergy }) => {
  const theme = useTheme();
  if (!banners.length) return null;
  return (
    <Stack gap={1}>
      {banners.map((banner) => {
        const color = toneColor(theme, bannerTone(banner.tone));
        return (
          <Box
            key={banner.key}
            role={banner.tone === "info" ? "status" : "alert"}
            sx={{
              display: "flex",
              gap: 1.25,
              alignItems: "flex-start",
              flexWrap: "wrap",
              px: 1.75,
              py: 1.25,
              borderRadius: "12px",
              bgcolor: alpha(color, theme.palette.mode === "dark" ? 0.16 : 0.09),
            }}
          >
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color, mt: "7px", flexShrink: 0 }} />
            <Box sx={{ flex: "1 1 240px", minWidth: 0 }}>
              <Typography variant="body2" fontWeight={700}>
                {banner.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {banner.text}
              </Typography>
            </Box>
            {banner.reaction && canManage && (
              <AppButton
                size="small"
                variant="outlined"
                color="error"
                onClick={() => onRecordAllergy(banner.reaction as FoodIntroduction)}
                sx={{ bgcolor: "background.paper", flexShrink: 0, ml: { xs: 2.25, md: 0 } }}
              >
                Записать как аллергию
              </AppButton>
            )}
          </Box>
        );
      })}
    </Stack>
  );
};

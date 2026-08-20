import React from "react";
import { Box, Button, Stack, Typography, alpha } from "@mui/material";
import ArrowForwardOutlined from "@mui/icons-material/ArrowForwardOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";

import { useT } from "../../../i18n/VerticalProvider";
import { bookPath } from "../../public-booking/orgSlug";
import { telHref } from "../../public-booking/format";
import { SITE_RADIUS } from "../theme";
import { SiteContainer } from "../shell";

/**
 * Финальный призыв. Гость, доскроллевший до конца, уже всё прочитал — здесь
 * нужна одна кнопка, а не ещё один блок информации.
 */
export const Cta: React.FC<{ id: string; orgSlug: string; phone: string | null }> = ({
  id,
  orgSlug,
  phone,
}) => {
  const { t } = useT("landing");

  return (
    <Box component="section" id={id} sx={{ py: { xs: 5, md: 8 } }}>
      <SiteContainer>
        <Box
          sx={{
            p: { xs: 3, md: 6 },
            borderRadius: SITE_RADIUS,
            textAlign: "center",
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
          }}
        >
          <Typography sx={{ fontSize: { xs: 24, md: 34 }, fontWeight: 800, lineHeight: 1.2 }}>
            {t("cta.title")}
          </Typography>
          <Typography sx={{ mt: 1.5, fontSize: { xs: 15, md: 17 }, color: "text.secondary" }}>
            {t("cta.subtitle")}
          </Typography>
          <Stack
            direction="row"
            spacing={1.5}
            justifyContent="center"
            sx={{ mt: 3, flexWrap: "wrap", rowGap: 1.5 }}
          >
            <Button
              href={bookPath("/book", orgSlug)}
              variant="contained"
              size="large"
              disableElevation
              endIcon={<ArrowForwardOutlined />}
              sx={{ borderRadius: 99, px: 3, fontWeight: 700 }}
            >
              {t("cta.button")}
            </Button>
            {phone && (
              <Button
                href={telHref(phone)}
                variant="text"
                size="large"
                startIcon={<PhoneOutlined />}
                sx={{ borderRadius: 99, px: 3, fontWeight: 600, color: "text.primary" }}
              >
                {t("hero.call")}
              </Button>
            )}
          </Stack>
        </Box>
      </SiteContainer>
    </Box>
  );
};

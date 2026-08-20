import React from "react";
import { Box, Typography } from "@mui/material";

import { useT } from "../../../i18n/VerticalProvider";
import { SiteSection } from "../shell";

/**
 * «О нас» — единственный блок, который целиком пишет владелец в настройках CRM.
 * Пустой текст блок не рисует: собрать этот абзац из данных CRM нечем, а рамка
 * с заголовком без содержимого выглядит недоделкой.
 *
 * Текст выводим абзацами по переводам строки и только текстом — никакой разметки
 * из настроек на публичной странице.
 */
export const About: React.FC<{ id: string; text: string; tinted?: boolean }> = ({
  id,
  text,
  tinted,
}) => {
  const { t } = useT("landing");
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (!paragraphs.length) return null;

  return (
    <SiteSection id={id} title={t("about.title")} tinted={tinted}>
      <Box sx={{ maxWidth: 820 }}>
        {paragraphs.map((paragraph, i) => (
          <Typography
            key={i}
            sx={{
              fontSize: { xs: 15, md: 17 },
              lineHeight: 1.7,
              mb: i === paragraphs.length - 1 ? 0 : 2,
            }}
          >
            {paragraph}
          </Typography>
        ))}
      </Box>
    </SiteSection>
  );
};

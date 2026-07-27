import React from "react";
import { Box, Typography } from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";

import ArticleOutlined from "@mui/icons-material/ArticleOutlined";

/** Палитра обложек — только семантические цвета темы (без хардкода rgba). */
const COVER_COLOR_KEYS = ["primary", "success", "info", "warning", "secondary"] as const;

/** Детерминированный цвет по разделу: у материалов одного раздела — одна обложка. */
const coverColorKey = (seed: string): (typeof COVER_COLOR_KEYS)[number] => {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return COVER_COLOR_KEYS[Math.abs(h) % COVER_COLOR_KEYS.length];
};

interface FeedCoverProps {
  /** Семя цвета заглушки — обычно название раздела. */
  seed: string;
  /** Текст, из которого берётся крупная буква заглушки. */
  title: string;
  coverUrl: string | null;
  /** Иконка в углу заглушки (у серии своя). */
  icon?: React.ReactNode;
  /** Плашки поверх обложки — например «3 части». */
  overlay?: React.ReactNode;
}

/**
 * Обложка карточки ленты: картинка статьи, а если её нет — крупная первая
 * буква на плоской подложке (без градиентов и теней, гайд §5.2).
 * Общая для карточки статьи и карточки серии, чтобы лента выглядела единой.
 */
const FeedCover: React.FC<FeedCoverProps> = ({ seed, title, coverUrl, icon, overlay }) => {
  const theme = useTheme();
  const cover = theme.palette[coverColorKey(seed)];
  // Битая ссылка на обложку — откатываемся на «обложку из буквы».
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => setBroken(false), [coverUrl]);
  const showImage = Boolean(coverUrl) && !broken;

  return (
    <Box
      sx={{
        aspectRatio: "16/9",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        bgcolor: alpha(cover.main, theme.palette.mode === "dark" ? 0.16 : 0.09),
      }}
    >
      {showImage ? (
        <Box
          component="img"
          src={coverUrl ?? undefined}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <>
          <Typography
            component="span"
            sx={{
              fontSize: "3rem",
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: -1,
              color: alpha(cover.main, theme.palette.mode === "dark" ? 0.9 : 0.75),
              userSelect: "none",
            }}
          >
            {(title.trim()[0] ?? "•").toUpperCase()}
          </Typography>
          <Box
            sx={{
              position: "absolute",
              right: 10,
              bottom: 8,
              display: "flex",
              color: alpha(cover.main, 0.55),
              "& .MuiSvgIcon-root": { fontSize: 18 },
            }}
          >
            {icon ?? <ArticleOutlined />}
          </Box>
        </>
      )}
      {overlay}
    </Box>
  );
};

export default FeedCover;

import React from "react";
import { Box, ButtonBase, Stack, Typography } from "@mui/material";
import StarRounded from "@mui/icons-material/StarRounded";
import CheckRounded from "@mui/icons-material/CheckRounded";
import ArrowOutwardRounded from "@mui/icons-material/ArrowOutwardRounded";

import type { MapPlatform } from "../../../api/reviews";
import {
  AMBER,
  CARD,
  CLAY,
  DISPLAY_FONT,
  GRAIN,
  INK,
  LINE,
  MUTED,
  PAPER,
  STAR_EMPTY,
  TEAL,
  TEAL_SOFT,
  medallionIn,
  motion,
  raysSpin,
  riseIn,
  starPop,
} from "./theme";

export const Shell: React.FC<
  React.PropsWithChildren<{ footer?: React.ReactNode }>
> = ({ children, footer }) => (
  <Box
    sx={{
      minHeight: "100dvh",
      bgcolor: PAPER,
      color: INK,
      backgroundImage: `${GRAIN}, radial-gradient(120% 60% at 110% -10%, rgba(233,162,59,0.22), transparent 60%), radial-gradient(90% 55% at -20% 105%, rgba(30,91,85,0.16), transparent 60%)`,
      display: "flex",
      flexDirection: "column",
    }}
  >
    <Box
      component="main"
      sx={{
        flex: 1,
        width: "100%",
        maxWidth: 480,
        mx: "auto",
        px: 2.5,
        pt: { xs: 4, sm: 7 },
        pb: 4,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {children}
    </Box>
    {footer}
  </Box>
);

/** Появление блоков «снизу вверх» с задержкой по порядку. */
export const Reveal: React.FC<React.PropsWithChildren<{ order?: number }>> = ({
  children,
  order = 0,
}) => (
  <Box
    sx={{
      ...motion(`${riseIn} 520ms cubic-bezier(.2,.8,.2,1) both`),
      animationDelay: `${order * 90}ms`,
    }}
  >
    {children}
  </Box>
);

export const Eyebrow: React.FC<React.PropsWithChildren> = ({ children }) => (
  <Typography
    sx={{
      fontSize: 12,
      fontWeight: 600,
      letterSpacing: "0.16em",
      textTransform: "uppercase",
      color: TEAL,
    }}
  >
    {children}
  </Typography>
);

export const Display: React.FC<
  React.PropsWithChildren<{ size?: number; center?: boolean }>
> = ({ children, size = 34, center = false }) => (
  <Typography
    component="h1"
    sx={{
      fontFamily: DISPLAY_FONT,
      fontWeight: 400,
      fontSize: { xs: size, sm: size + 4 },
      lineHeight: 1.12,
      letterSpacing: "-0.01em",
      textAlign: center ? "center" : "left",
      textWrap: "balance",
    }}
  >
    {children}
  </Typography>
);

export const SectionTitle: React.FC<React.PropsWithChildren> = ({
  children,
}) => (
  <Typography
    sx={{ fontFamily: DISPLAY_FONT, fontSize: 21, lineHeight: 1.2, mb: 1.5 }}
  >
    {children}
  </Typography>
);

export const Card: React.FC<React.PropsWithChildren> = ({ children }) => (
  <Box
    sx={{
      bgcolor: CARD,
      border: `1px solid ${LINE}`,
      borderRadius: "20px",
      p: 2,
      boxShadow:
        "0 1px 0 rgba(28,38,36,0.04), 0 12px 32px -18px rgba(28,38,36,0.25)",
    }}
  >
    {children}
  </Box>
);

const WORDS = ["Очень плохо", "Плохо", "Нормально", "Хорошо", "Отлично"];

/** Звёзды-переключатели: radiogroup, наведение подсвечивает, выбор «подпрыгивает». */
export const StarPicker: React.FC<{
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  size?: number;
  showWord?: boolean;
}> = ({ label, value, onChange, size = 30, showWord = false }) => {
  const [hover, setHover] = React.useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <Box>
      <Box
        role="radiogroup"
        aria-label={label}
        onMouseLeave={() => setHover(null)}
        sx={{ display: "flex", gap: size > 40 ? 1 : 0.5 }}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const on = n <= shown;
          const picked = value === n;
          return (
            <ButtonBase
              key={picked ? `${n}-picked` : n}
              role="radio"
              aria-checked={picked}
              aria-label={`${label}: ${n} из 5 — ${WORDS[n - 1]}`}
              onClick={() => onChange(n)}
              onMouseEnter={() => setHover(n)}
              onFocus={() => setHover(n)}
              onBlur={() => setHover(null)}
              sx={{
                borderRadius: "50%",
                p: size > 40 ? 0.25 : 0,
                color: on ? AMBER : STAR_EMPTY,
                transition: "color 140ms ease, transform 140ms ease",
                "&:hover": { transform: "translateY(-2px)" },
                "&.Mui-focusVisible": {
                  outline: `2px solid ${TEAL}`,
                  outlineOffset: 2,
                },
                ...(picked
                  ? motion(`${starPop} 420ms cubic-bezier(.3,1.4,.5,1)`)
                  : {}),
              }}
            >
              <StarRounded
                sx={{
                  fontSize: size,
                  filter: on
                    ? "drop-shadow(0 3px 6px rgba(233,162,59,0.35))"
                    : "none",
                }}
              />
            </ButtonBase>
          );
        })}
      </Box>
      {showWord && (
        <Typography
          aria-live="polite"
          sx={{
            mt: 1,
            minHeight: 24,
            fontWeight: 600,
            color: shown ? INK : MUTED,
            fontSize: 16,
          }}
        >
          {shown ? WORDS[shown - 1] : "Коснитесь звезды"}
        </Typography>
      )}
    </Box>
  );
};

/** Строка «подпись — звёзды» для врача и администратора. */
export const RatingRow: React.FC<{
  title: string;
  caption?: React.ReactNode;
  value: number | null;
  onChange: (v: number) => void;
}> = ({ title, caption, value, onChange }) => (
  <Stack
    direction="row"
    alignItems="center"
    justifyContent="space-between"
    flexWrap="wrap"
    rowGap={1}
    columnGap={2}
    sx={{ py: 1.25 }}
  >
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontWeight: 600, fontSize: 15 }}>{title}</Typography>
      {caption && (
        <Typography sx={{ color: MUTED, fontSize: 13, lineHeight: 1.3 }}>
          {caption}
        </Typography>
      )}
    </Box>
    <StarPicker label={title} value={value} onChange={onChange} size={30} />
  </Stack>
);

export const TagPill: React.FC<{
  label: string;
  on: boolean;
  tone: "good" | "bad";
  onToggle: () => void;
}> = ({ label, on, tone, onToggle }) => {
  const accent = tone === "good" ? TEAL : CLAY;
  return (
    <ButtonBase
      role="checkbox"
      aria-checked={on}
      onClick={onToggle}
      sx={{
        gap: 0.5,
        px: 1.75,
        py: 1,
        borderRadius: 999,
        fontFamily: "inherit",
        fontSize: 14,
        fontWeight: 500,
        border: `1px solid ${on ? accent : LINE}`,
        bgcolor: on ? accent : CARD,
        color: on ? "#FFFFFF" : INK,
        transition: "all 160ms ease",
        "&:hover": { borderColor: accent },
        "&.Mui-focusVisible": {
          outline: `2px solid ${accent}`,
          outlineOffset: 2,
        },
      }}
    >
      {on && <CheckRounded sx={{ fontSize: 16, ml: -0.5 }} />}
      {label}
    </ButtonBase>
  );
};

const MAP_BRANDS: Record<
  MapPlatform,
  { name: string; mark: string; bg: string; fg: string }
> = {
  "2gis": { name: "2ГИС", mark: "2Г", bg: "#19AA1E", fg: "#FFFFFF" },
  yandex: { name: "Яндекс Карты", mark: "Я", bg: "#FC3F1D", fg: "#FFFFFF" },
  google: { name: "Google Maps", mark: "G", bg: "#FFFFFF", fg: "#4285F4" },
};

export const MapCard: React.FC<{
  platform: MapPlatform;
  opened: boolean;
  onOpen: () => void;
}> = ({ platform, opened, onOpen }) => {
  const brand = MAP_BRANDS[platform];
  return (
    <ButtonBase
      onClick={onOpen}
      sx={{
        width: "100%",
        justifyContent: "flex-start",
        gap: 1.75,
        p: 1.5,
        pr: 2,
        textAlign: "left",
        borderRadius: "18px",
        bgcolor: CARD,
        border: `1px solid ${LINE}`,
        boxShadow: "0 10px 24px -18px rgba(28,38,36,0.45)",
        transition:
          "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
        "&:hover": { transform: "translateY(-2px)", borderColor: TEAL },
        "&.Mui-focusVisible": {
          outline: `2px solid ${TEAL}`,
          outlineOffset: 2,
        },
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 48,
          height: 48,
          flexShrink: 0,
          borderRadius: "14px",
          display: "grid",
          placeItems: "center",
          bgcolor: brand.bg,
          color: brand.fg,
          border: brand.bg === "#FFFFFF" ? `1px solid ${LINE}` : "none",
          fontWeight: 800,
          fontSize: 18,
          letterSpacing: "-0.03em",
        }}
      >
        {brand.mark}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 16, color: INK }}>
          {brand.name}
        </Typography>
        <Typography sx={{ fontSize: 13, color: opened ? TEAL : MUTED }}>
          {opened ? "Открыли — спасибо!" : "Оставить отзыв"}
        </Typography>
      </Box>
      {opened ? (
        <CheckRounded sx={{ color: TEAL }} />
      ) : (
        <ArrowOutwardRounded sx={{ color: MUTED }} />
      )}
    </ButtonBase>
  );
};

/** Круглая «медаль» над финальными экранами. */
export const Medallion: React.FC<{
  tone: "happy" | "calm" | "quiet";
  icon: React.ReactNode;
}> = ({ tone, icon }) => {
  const bg = tone === "happy" ? AMBER : tone === "calm" ? TEAL_SOFT : CARD;
  const fg = tone === "happy" ? "#FFFFFF" : TEAL;
  // Внутри Stack margin обнуляется, поэтому центрируем флексом, а не mx: auto.
  return (
    <Box sx={{ display: "flex", justifyContent: "center" }}>
      <Box sx={{ position: "relative", width: 132, height: 132 }}>
        {tone === "happy" && (
          <Box
            aria-hidden
            sx={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: `repeating-conic-gradient(from 0deg, rgba(233,162,59,0.28) 0deg 6deg, transparent 6deg 22.5deg)`,
              maskImage:
                "radial-gradient(circle, transparent 46%, #000 47%, #000 70%, transparent 71%)",
              WebkitMaskImage:
                "radial-gradient(circle, transparent 46%, #000 47%, #000 70%, transparent 71%)",
              ...motion(`${raysSpin} 24s linear infinite`),
            }}
          />
        )}
        <Box
          sx={{
            position: "absolute",
            inset: 26,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            bgcolor: bg,
            color: fg,
            border: tone === "quiet" ? `1px solid ${LINE}` : "none",
            boxShadow:
              tone === "happy"
                ? "0 14px 30px -10px rgba(233,162,59,0.7)"
                : "0 12px 26px -16px rgba(30,91,85,0.5)",
            "& svg": { fontSize: 40 },
            ...motion(`${medallionIn} 700ms cubic-bezier(.2,1.2,.4,1) both`),
          }}
        >
          {icon}
        </Box>
      </Box>
    </Box>
  );
};

export interface ChoiceOption<T extends string> {
  value: T;
  title: string;
  caption: string;
  icon: React.ReactNode;
}

/** Карточки-варианты с одной выбранной (radiogroup). */
export function ChoiceCards<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ChoiceOption<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <Stack role="radiogroup" aria-label={label} spacing={1}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <ButtonBase
            key={o.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            sx={{
              width: "100%",
              justifyContent: "flex-start",
              gap: 1.5,
              p: 1.5,
              pr: 2,
              textAlign: "left",
              borderRadius: "16px",
              border: `1.5px solid ${on ? TEAL : LINE}`,
              bgcolor: on ? TEAL_SOFT : CARD,
              transition: "all 160ms ease",
              "&:hover": { borderColor: TEAL },
              "&.Mui-focusVisible": {
                outline: `2px solid ${TEAL}`,
                outlineOffset: 2,
              },
            }}
          >
            <Box
              aria-hidden
              sx={{
                width: 40,
                height: 40,
                flexShrink: 0,
                borderRadius: "12px",
                display: "grid",
                placeItems: "center",
                bgcolor: on ? TEAL : PAPER,
                color: on ? "#FFFFFF" : MUTED,
                transition: "all 160ms ease",
                "& svg": { fontSize: 22 },
              }}
            >
              {o.icon}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600, fontSize: 15, color: INK }}>
                {o.title}
              </Typography>
              <Typography sx={{ fontSize: 13, color: MUTED, lineHeight: 1.3 }}>
                {o.caption}
              </Typography>
            </Box>
            <Box
              aria-hidden
              sx={{
                width: 20,
                height: 20,
                flexShrink: 0,
                borderRadius: "50%",
                border: `2px solid ${on ? TEAL : STAR_EMPTY}`,
                display: "grid",
                placeItems: "center",
                "&::after": {
                  content: '""',
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  bgcolor: TEAL,
                  transform: on ? "scale(1)" : "scale(0)",
                  transition: "transform 160ms ease",
                },
              }}
            />
          </ButtonBase>
        );
      })}
    </Stack>
  );
}

import React from "react";
import { createTheme, keyframes } from "@mui/material/styles";

/**
 * Своя «бумажная» тема страницы отзыва: пациент приходит по ссылке из
 * WhatsApp/SMS, CRM-тема (в т.ч. тёмная) здесь неуместна.
 */
export const INK = "#1C2624";
export const MUTED = "#5E6B67";
export const PAPER = "#F5EFE6";
export const CARD = "#FFFDF9";
export const LINE = "#E4DACB";
export const TEAL = "#1E5B55";
export const TEAL_SOFT = "#E3EEEA";
export const AMBER = "#E9A23B";
export const STAR_EMPTY = "#D6CAB8";
export const CLAY = "#B4532A";
export const CLAY_SOFT = "#F6E6DC";

export const DISPLAY_FONT = "'Prata', 'Georgia', serif";
export const BODY_FONT =
  "'Onest', system-ui, -apple-system, 'Segoe UI', sans-serif";

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&family=Prata&display=swap";

/** Шрифты грузим только на этой странице, чтобы не тяжелить CRM. */
export function useRateFonts(): void {
  React.useEffect(() => {
    if (document.getElementById("rate-fonts")) return;
    const link = document.createElement("link");
    link.id = "rate-fonts";
    link.rel = "stylesheet";
    link.href = FONTS_HREF;
    document.head.appendChild(link);
  }, []);
}

export const rateTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: TEAL, contrastText: "#FFFFFF" },
    error: { main: CLAY },
    background: { default: PAPER, paper: CARD },
    text: { primary: INK, secondary: MUTED },
    divider: LINE,
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: BODY_FONT,
    button: { textTransform: "none", fontWeight: 600, letterSpacing: 0 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 999 } },
    },
  },
});

export const riseIn = keyframes`
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
`;

export const starPop = keyframes`
  0%   { transform: scale(1); }
  40%  { transform: scale(1.28) rotate(-8deg); }
  70%  { transform: scale(0.94) rotate(3deg); }
  100% { transform: scale(1) rotate(0); }
`;

export const medallionIn = keyframes`
  0%   { opacity: 0; transform: scale(0.4) rotate(-40deg); }
  60%  { opacity: 1; transform: scale(1.08) rotate(6deg); }
  100% { opacity: 1; transform: scale(1) rotate(0); }
`;

export const raysSpin = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;

/** Анимация только для тех, кто не просил уменьшить движение. */
export const motion = (animation: string) => ({
  "@media (prefers-reduced-motion: no-preference)": { animation },
});

/** Лёгкое бумажное зерно поверх фона. */
export const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.35 0 0 0 0 0.28 0 0 0 0 0.2 0 0 0 0.09 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

import React from "react";
import Box from "@mui/material/Box";
import { alpha, keyframes, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";

import { giftCardAmountLabel, giftCardHolderName } from "./certificateCart";

/**
 * Подарочная карта в окне продажи сертификата: как банковская карта
 * (ISO/IEC 7810 ID-1, 85,6 × 53,98 мм → 1,586 : 1), тёмная, с оттенком
 * акцента кассы. Сумма, имя покупателя и срок «заполняются» по мере ввода.
 *
 * Размеры шрифтов — в `cqw` от ширины карты: на телефоне карта во всю ширину,
 * на десктопе ~470 px, и пропорции везде одинаковые.
 */

const GOLD = "linear-gradient(135deg, #f6e4b0 0%, #c9a35c 42%, #f1d79a 62%, #a87f3e 100%)";
const SERIF = '"Cormorant Garamond", "Playfair Display", Georgia, "Times New Roman", serif';
const MONO = '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace';

const shimmer = keyframes`
  from { transform: translateX(-120%) skewX(-18deg); }
  to { transform: translateX(220%) skewX(-18deg); }
`;
const rise = keyframes`
  from { opacity: 0; transform: translateY(10px) scale(.985); }
  to { opacity: 1; transform: none; }
`;

/** Плавный «счётчик» суммы. При prefers-reduced-motion — сразу итог. */
function useAnimatedNumber(target: number, reduced: boolean, duration = 360): number {
  const [value, setValue] = React.useState(target);
  const current = React.useRef(target);
  React.useEffect(() => {
    if (reduced || typeof window === "undefined" || !window.requestAnimationFrame) {
      current.current = target;
      setValue(target);
      return;
    }
    const from = current.current;
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const next = from + (target - from) * eased;
      current.current = next;
      setValue(next);
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [target, reduced, duration]);
  return value;
}

const goldText = {
  backgroundImage: GOLD,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
} as const;

type Props = {
  organizationName: string;
  /** Номинал в копейках; NaN или 0 — карта ещё пустая. */
  amountCents: number;
  holderName?: string | null;
  /** «до 07.10.2027» или «бессрочно». */
  expiryLabel: string;
  /** Номер карты; до оплаты его нет — сервер выдаст при продаже. */
  code?: string | null;
};

export const GiftCard: React.FC<Props> = ({ organizationName, amountCents, holderName, expiryLabel, code }) => {
  const theme = useTheme();
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)", { noSsr: true });
  const target = Number.isFinite(amountCents) && amountCents > 0 ? Math.round(amountCents) : 0;
  const shown = useAnimatedNumber(target, reduced);
  const holder = giftCardHolderName(holderName);
  const brand = organizationName.trim() || "ErkinAI";
  const accent = theme.palette.primary.main;
  const dated = /^до\s+/i.test(expiryLabel);
  const expiry = dated ? expiryLabel.replace(/^до\s+/i, "") : expiryLabel;
  const empty = target === 0;

  return (
    <Box sx={{ containerType: "inline-size", width: "100%" }}>
      <Box
        role="img"
        aria-label={`Подарочный сертификат ${brand} на ${giftCardAmountLabel(target)} сом${holder ? `, владелец ${holder}` : ""}, ${expiryLabel}`}
        sx={{
          position: "relative",
          width: "100%",
          aspectRatio: "1.586 / 1",
          borderRadius: "clamp(14px, 4.6cqw, 22px)",
          overflow: "hidden",
          color: "#f7f3ea",
          isolation: "isolate",
          background: [
            `radial-gradient(115% 85% at 92% -12%, ${alpha(accent, 0.62)} 0%, transparent 56%)`,
            `radial-gradient(80% 70% at -8% 112%, rgba(214, 178, 106, .20) 0%, transparent 62%)`,
            // Гильош: тонкие кольца, как на ценных бумагах.
            "repeating-radial-gradient(circle at 112% 128%, rgba(255,255,255,.055) 0 1px, transparent 1px 9px)",
            "repeating-linear-gradient(118deg, rgba(255,255,255,.022) 0 1px, transparent 1px 6px)",
            "linear-gradient(145deg, #1c1733 0%, #120f22 52%, #07060e 100%)",
          ].join(", "),
          border: "1px solid rgba(255,255,255,.12)",
          boxShadow: `0 28px 60px -24px ${alpha("#000", 0.85)}, 0 10px 24px -12px ${alpha(accent, 0.45)}, inset 0 1px 0 rgba(255,255,255,.14)`,
          animation: `${rise} .5s cubic-bezier(.2,.7,.2,1) both`,
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        }}
      >
        {/* Блик проходит по карте при каждом изменении суммы. */}
        <Box
          key={target}
          aria-hidden
          sx={{
            position: "absolute",
            inset: "-20% auto -20% 0",
            width: "38%",
            zIndex: 1,
            pointerEvents: "none",
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,.16) 50%, transparent 100%)",
            animation: `${shimmer} .9s cubic-bezier(.3,.6,.3,1) both`,
            "@media (prefers-reduced-motion: reduce)": { display: "none" },
          }}
        />

        <Box
          sx={{
            position: "relative",
            zIndex: 2,
            height: "100%",
            boxSizing: "border-box",
            p: "6.4cqw 7cqw 6cqw",
            display: "grid",
            gridTemplateRows: "auto 1fr auto auto",
          }}
        >
          {/* Шапка: бренд организации и тип карты. */}
          <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "3cqw" }}>
            <Box
              sx={{
                ...goldText,
                minWidth: 0,
                fontFamily: SERIF,
                fontWeight: 600,
                fontSize: "6.2cqw",
                lineHeight: 1,
                letterSpacing: ".2em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {brand}
            </Box>
            <Box
              sx={{
                flexShrink: 0,
                textAlign: "right",
                fontSize: "2.5cqw",
                fontWeight: 600,
                lineHeight: 1.35,
                letterSpacing: ".22em",
                textTransform: "uppercase",
                color: "rgba(247,243,234,.62)",
              }}
            >
              Подарочный
              <br />
              сертификат
            </Box>
          </Box>

          {/* Чип и номер — как у банковской карты. */}
          <Box sx={{ alignSelf: "center", display: "flex", alignItems: "center", gap: "4cqw" }}>
            <Box
              aria-hidden
              sx={{
                width: "11.5cqw",
                aspectRatio: "1.3 / 1",
                borderRadius: "1.6cqw",
                backgroundImage: [
                  "linear-gradient(90deg, transparent 32%, rgba(80,58,20,.45) 32% 34%, transparent 34% 66%, rgba(80,58,20,.45) 66% 68%, transparent 68%)",
                  "linear-gradient(0deg, transparent 46%, rgba(80,58,20,.45) 46% 54%, transparent 54%)",
                  GOLD,
                ].join(", "),
                boxShadow: "inset 0 0 0 1px rgba(255,240,200,.35)",
              }}
            />
            <Box
              sx={{
                fontFamily: MONO,
                fontSize: "3.6cqw",
                letterSpacing: ".24em",
                color: code ? "rgba(247,243,234,.9)" : "rgba(247,243,234,.42)",
                whiteSpace: "nowrap",
              }}
            >
              {code || "•••• ••••"}
            </Box>
          </Box>

          {/* Сумма. */}
          <Box
            sx={{
              display: "flex",
              alignItems: "baseline",
              gap: "2cqw",
              mb: "3.2cqw",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <Box
              sx={{
                fontSize: "12.5cqw",
                fontWeight: 700,
                lineHeight: 0.95,
                letterSpacing: "-.02em",
                color: empty ? "rgba(247,243,234,.3)" : "#fbf8f1",
                textShadow: empty ? "none" : "0 2px 18px rgba(0,0,0,.35)",
                transition: "color .25s",
              }}
            >
              {giftCardAmountLabel(Math.round(shown))}
            </Box>
            <Box
              component="span"
              sx={{
                ...goldText,
                fontSize: "6cqw",
                fontWeight: 700,
                lineHeight: 1,
                textDecoration: "underline",
                textDecorationColor: "#c9a35c",
                textUnderlineOffset: "0.6cqw",
              }}
            >
              с
            </Box>
          </Box>

          {/* Владелец и срок. */}
          <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "4cqw" }}>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ fontSize: "2.2cqw", letterSpacing: ".22em", textTransform: "uppercase", color: "rgba(247,243,234,.5)", mb: "1cqw" }}>
                Владелец
              </Box>
              <Box
                sx={{
                  fontSize: "3.9cqw",
                  fontWeight: 600,
                  letterSpacing: ".08em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: holder ? "#f7f3ea" : "rgba(247,243,234,.32)",
                }}
              >
                {holder || "ИМЯ ПОКУПАТЕЛЯ"}
              </Box>
            </Box>
            <Box sx={{ flexShrink: 0, textAlign: "right" }}>
              <Box sx={{ fontSize: "2.2cqw", letterSpacing: ".22em", textTransform: "uppercase", color: "rgba(247,243,234,.5)", mb: "1cqw" }}>
                {dated ? "Действует до" : "Срок действия"}
              </Box>
              <Box sx={{ fontFamily: MONO, fontSize: "3.6cqw", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>
                {expiry}
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

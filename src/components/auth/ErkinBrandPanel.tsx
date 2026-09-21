/**
 * ErkinBrandPanel.tsx
 * Левая (брендовая) панель страниц аутентификации — по макету
 * «erkinai-login-variants/app.html»: тёмный градиент с сине-фиолетовыми
 * свечениями, тонкая сетка, кольцо, «ambient»-картинка с медленным дрейфом,
 * логотип ErkinAI, кикер с пульсирующей точкой, крупный заголовок, лид,
 * мини-доска (неделя + задачи) с каскадным появлением и строка «proof».
 *
 * Цвета здесь — свои, не из темы: панель одинаково тёмная в светлой и тёмной
 * теме, это витрина бренда, а не интерфейс. Правая колонка (форма) — прежняя.
 * Анимации отключаются при prefers-reduced-motion.
 */

import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { keyframes } from "@mui/material/styles";

import logoUrl from "../../assets/brand/erkinai-logo.svg";
import ambientUrl from "../../assets/brand/erkinai-ambient-bg.webp";

const INK = "#f7f8fd";
const MINT = "#08d49f";
const DISPLAY_FONT = '"Manrope", "Inter", system-ui, sans-serif';

const enterSoft = keyframes`
  from { opacity: 0; transform: translate3d(0, 13px, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
`;
const ambientDrift = keyframes`
  0% { transform: scale(1.035) translate3d(-8px, 2px, 0); }
  100% { transform: scale(1.035) translate3d(10px, -3px, 0); }
`;
const statusPulse = keyframes`
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 4px rgba(8, 212, 159, 0.14), 0 0 14px rgba(8, 212, 159, 0.46); }
  35% { transform: scale(1.22); box-shadow: 0 0 0 11px rgba(8, 212, 159, 0.07), 0 0 28px rgba(8, 212, 159, 0.92); }
  58% { transform: scale(1); box-shadow: 0 0 0 17px rgba(8, 212, 159, 0), 0 0 11px rgba(8, 212, 159, 0.34); }
`;
const progressDraw = keyframes`
  from { transform: scaleX(0); opacity: 0.25; }
  to { transform: scaleX(1); opacity: 1; }
`;
const dayEnter = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
`;
const currentDayPulse = keyframes`
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 5px rgba(123, 76, 255, 0.17), 0 0 16px rgba(123, 76, 255, 0.45); }
  50% { transform: scale(1.14); box-shadow: 0 0 0 11px rgba(123, 76, 255, 0.03), 0 0 30px rgba(144, 109, 255, 0.9); }
`;
const taskEnter = keyframes`
  from { opacity: 0; transform: translateX(8px); }
  to { opacity: 1; transform: translateX(0); }
`;

/** Каскадное появление блока: opacity 0 → 1 со сдвигом, задержка в секундах. */
const enter = (delay: number) => ({
  opacity: 0,
  animation: `${enterSoft} 0.82s cubic-bezier(0.22, 0.68, 0.28, 1) ${delay}s forwards`,
  willChange: "transform, opacity",
  "@media (prefers-reduced-motion: reduce)": { opacity: 1, animation: "none" },
});

const REDUCED = { "@media (prefers-reduced-motion: reduce)": { animation: "none" } };

const WEEK: { label: string; state: "done" | "current" | "todo"; mark: string }[] = [
  { label: "ПН", state: "done", mark: "✓" },
  { label: "ВТ", state: "done", mark: "✓" },
  { label: "СР", state: "done", mark: "✓" },
  { label: "ЧТ", state: "current", mark: "4" },
  { label: "ПТ", state: "todo", mark: "•" },
  { label: "СБ", state: "todo", mark: "•" },
  { label: "ВС", state: "todo", mark: "•" },
];

const TASKS: { text: string; done: boolean }[] = [
  { text: "Планёрка команды", done: true },
  { text: "Проверить документы", done: false },
  { text: "Ответить клиенту", done: false },
];

const Logo: React.FC = () => (
  <Stack
    direction="row"
    alignItems="center"
    sx={{
      gap: "13px",
      position: "relative",
      zIndex: 2,
      fontFamily: DISPLAY_FONT,
      fontWeight: 800,
      fontSize: 22,
      letterSpacing: "-0.04em",
      ...enter(0.08),
    }}
  >
    <Box
      component="img"
      src={logoUrl}
      alt=""
      sx={{ width: 38, height: 38, filter: "drop-shadow(0 8px 18px rgba(69, 97, 255, 0.28))" }}
    />
    <span>
      Erkin
      <Box
        component="b"
        sx={{
          background: "linear-gradient(115deg, #a98dff, #56aaff 58%, #4de1bc)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        AI
      </Box>
    </span>
  </Stack>
);

const cardSx = {
  background: "linear-gradient(145deg, rgba(24, 30, 52, 0.88), rgba(13, 18, 33, 0.82))",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "20px",
  p: "20px",
  boxShadow: "0 24px 60px rgba(0, 0, 0, 0.22)",
  backdropFilter: "blur(14px)",
  transition: "border-color .35s ease, transform .35s ease",
  "&:hover": { transform: "translateY(-2px)", borderColor: "rgba(142, 119, 255, 0.23)" },
};

const cardLabelSx = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  color: "#8992aa",
  fontSize: 12,
};

const WeekCard: React.FC = () => (
  <Box sx={cardSx}>
    <Box sx={cardLabelSx}>
      <span>Моя неделя</span>
      <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#66dfbd",
        "&:before": { content: '""', width: 6, height: 6, borderRadius: "50%", bgcolor: "currentColor" } }}>
        71% выполнено
      </Box>
    </Box>
    <Box sx={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.05em", mt: "12px", fontFamily: DISPLAY_FONT }}>
      17 / 24{" "}
      <Box component="small" sx={{ fontSize: 13, fontWeight: 500, color: "#8c94aa", letterSpacing: 0 }}>
        задач
      </Box>
    </Box>
    <Box sx={{ height: 48, mt: "15px", display: "flex", alignItems: "center" }}>
      <Box
        aria-label="Прогресс по рабочей неделе"
        sx={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          position: "relative",
          "&:before, &:after": {
            content: '""',
            position: "absolute",
            left: "7%",
            right: "7%",
            top: 11,
            height: 2,
            borderRadius: 2,
          },
          "&:before": { bgcolor: "#292545" },
          "&:after": {
            right: "43%",
            background: "linear-gradient(90deg, #6d46f5, #9b78ff)",
            boxShadow: "0 0 14px rgba(123, 76, 255, 0.35)",
            transformOrigin: "left center",
            animation: `${progressDraw} 1.15s 0.95s cubic-bezier(0.22, 0.68, 0.28, 1) both`,
            ...REDUCED,
          },
        }}
      >
        {WEEK.map((d, i) => (
          <Box
            key={d.label}
            sx={{
              position: "relative",
              zIndex: 1,
              display: "grid",
              justifyItems: "center",
              gap: "7px",
              color: d.state === "done" ? "#8f98ad" : d.state === "current" ? "#e9e5ff" : "#667086",
              fontSize: 10,
              fontWeight: 600,
              opacity: 0,
              animation: `${dayEnter} 0.42s ease-out ${0.86 + i * 0.1}s forwards`,
              "@media (prefers-reduced-motion: reduce)": { opacity: 1, animation: "none" },
            }}
          >
            <Box
              component="i"
              sx={{
                width: d.state === "current" ? 27 : 23,
                height: d.state === "current" ? 27 : 23,
                mt: d.state === "current" ? "-2px" : 0,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                fontSize: 10,
                fontStyle: "normal",
                bgcolor: d.state === "done" ? "#4f35ae" : d.state === "current" ? "#8362ff" : "#191a30",
                border: `2px solid ${d.state === "done" ? "#795af0" : d.state === "current" ? "#b5a1ff" : "#302d4d"}`,
                color: d.state === "done" ? "#d9ceff" : d.state === "current" ? "#fff" : "transparent",
                ...(d.state === "current"
                  ? {
                      boxShadow: "0 0 0 5px rgba(123, 76, 255, 0.13), 0 0 18px rgba(123, 76, 255, 0.45)",
                      animation: `${currentDayPulse} 2.8s 1.8s ease-in-out infinite`,
                      ...REDUCED,
                    }
                  : {}),
              }}
            >
              {d.mark}
            </Box>
            {d.label}
          </Box>
        ))}
      </Box>
    </Box>
  </Box>
);

const TasksCard: React.FC = () => (
  <Box sx={cardSx}>
    <Box sx={cardLabelSx}>
      <span>Сегодня</span>
      <span>3 задачи</span>
    </Box>
    <Box sx={{ display: "grid", gap: "9px", mt: "14px" }}>
      {TASKS.map((t, i) => (
        <Box
          key={t.text}
          sx={{
            display: "flex",
            gap: "9px",
            alignItems: "center",
            fontSize: 12,
            color: t.done ? "#687086" : "#b8bfd0",
            opacity: 0,
            animation: `${taskEnter} 0.5s cubic-bezier(0.22, 0.68, 0.28, 1) ${0.9 + i * 0.14}s forwards`,
            "@media (prefers-reduced-motion: reduce)": { opacity: 1, animation: "none" },
          }}
        >
          <Box
            component="i"
            sx={{
              width: 20,
              height: 20,
              borderRadius: "7px",
              display: "grid",
              placeItems: "center",
              fontStyle: "normal",
              bgcolor: t.done ? "rgba(8, 212, 159, 0.12)" : "rgba(123, 76, 255, 0.18)",
              color: t.done ? "#5be0bd" : "#b9a5ff",
            }}
          >
            {t.done ? "✓" : "→"}
          </Box>
          <Box component="span" sx={{ textDecoration: t.done ? "line-through" : "none" }}>
            {t.text}
          </Box>
        </Box>
      ))}
    </Box>
  </Box>
);

const ErkinBrandPanel: React.FC = () => (
  <Box
    aria-hidden
    sx={{
      display: { xs: "none", md: "flex" },
      position: "relative",
      overflow: "hidden",
      flexDirection: "column",
      justifyContent: "space-between",
      p: "clamp(28px, 4.2vw, 72px)",
      color: INK,
      fontFamily: '"Inter", system-ui, sans-serif',
      background:
        "radial-gradient(circle at 76% 18%, rgba(56, 151, 255, 0.2), transparent 31%)," +
        "radial-gradient(circle at 20% 82%, rgba(112, 45, 255, 0.2), transparent 34%)," +
        "linear-gradient(145deg, #10162b, #0a0f1d 65%, #09101b)",
      // Тонкая сетка, затухающая книзу
      "&:before": {
        content: '""',
        position: "absolute",
        inset: 0,
        backgroundImage:
          "linear-gradient(rgba(255, 255, 255, 0.026) 1px, transparent 1px)," +
          "linear-gradient(90deg, rgba(255, 255, 255, 0.026) 1px, transparent 1px)",
        backgroundSize: "56px 56px",
        maskImage: "linear-gradient(to bottom, black, transparent 92%)",
        WebkitMaskImage: "linear-gradient(to bottom, black, transparent 92%)",
        zIndex: 1,
      },
      // Кольцо справа сверху
      "&:after": {
        content: '""',
        position: "absolute",
        width: "44vw",
        height: "44vw",
        minWidth: 520,
        minHeight: 520,
        border: "1px solid rgba(96, 118, 255, 0.18)",
        borderRadius: "50%",
        right: "-25vw",
        top: "8vh",
        boxShadow: "0 0 0 8vw rgba(70, 91, 211, 0.035), 0 0 0 16vw rgba(70, 91, 211, 0.025)",
        zIndex: 1,
      },
    }}
  >
    {/* «Ambient»-картинка с медленным дрейфом */}
    <Box
      sx={{
        position: "absolute",
        zIndex: 0,
        inset: "-5%",
        background:
          "linear-gradient(90deg, rgba(8, 11, 20, 0.78) 0%, rgba(8, 11, 20, 0.32) 54%, rgba(8, 11, 20, 0.12) 100%)," +
          "linear-gradient(0deg, rgba(8, 11, 20, 0.58), transparent 55%)," +
          `url(${ambientUrl}) center / cover no-repeat`,
        opacity: 0.66,
        transform: "scale(1.035) translate3d(0, 0, 0)",
        animation: `${ambientDrift} 32s cubic-bezier(0.45, 0, 0.55, 1) infinite alternate`,
        willChange: "transform",
        ...REDUCED,
      }}
    />

    <Logo />

    <Box sx={{ position: "relative", zIndex: 2, maxWidth: 760, my: "8vh" }}>
      {/* Кикер с пульсирующей точкой */}
      <Box
        sx={{
          display: "inline-flex",
          gap: "9px",
          alignItems: "center",
          color: "#b7bdd0",
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          ...enter(0.16),
          "&:before": {
            content: '""',
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: MINT,
            boxShadow: "0 0 0 5px rgba(8, 212, 159, 0.1), 0 0 20px rgba(8, 212, 159, 0.7)",
            animation: `${statusPulse} 2.6s ease-out infinite`,
            ...REDUCED,
          },
        }}
      >
        Система работает
      </Box>

      <Typography
        component="h1"
        sx={{
          fontFamily: DISPLAY_FONT,
          fontWeight: 800,
          fontSize: "clamp(40px, 4vw, 88px)",
          lineHeight: 0.98,
          letterSpacing: "-0.065em",
          m: "22px 0 26px",
          color: INK,
          ...enter(0.24),
        }}
      >
        Бизнес.
        <br />
        <Box
          component="span"
          sx={{
            background: "linear-gradient(108deg, #fff 18%, #acb8ff 54%, #67e7c4)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          В одном ритме.
        </Box>
      </Typography>

      <Typography
        sx={{
          fontSize: "clamp(16px, 1.3vw, 20px)",
          lineHeight: 1.65,
          color: "#aab1c4",
          maxWidth: 650,
          ...enter(0.34),
          "& strong": { color: "#eef0f8", fontWeight: 600 },
        }}
      >
        <strong>Клиенты, задачи, команда и рабочие процессы</strong> собраны в единой системе.
        ErkinAI помогает бизнесу работать слаженно, а каждому сотруднику — видеть свои
        приоритеты на сегодня.
      </Typography>

      {/* Мини-доска: только на широких экранах — в узкой колонке ей тесно */}
      <Box
        sx={{
          display: { xs: "none", lg: "grid" },
          mt: "44px",
          gridTemplateColumns: "1.2fr 0.8fr",
          gap: "14px",
          maxWidth: 660,
          ...enter(0.46),
        }}
      >
        <WeekCard />
        <TasksCard />
      </Box>
    </Box>

    <Box
      sx={{
        display: { xs: "none", lg: "flex" },
        position: "relative",
        zIndex: 2,
        gap: "30px",
        flexWrap: "wrap",
        color: "#868ea3",
        fontSize: 12,
        ...enter(0.58),
      }}
    >
      <span>◈ Защищённое соединение</span>
      <span>↗ Рабочие данные актуальны</span>
    </Box>
  </Box>
);

export default ErkinBrandPanel;

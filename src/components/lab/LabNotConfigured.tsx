import React from "react";
import { Box, Button, Stack, Typography, alpha } from "@mui/material";
import LinkOffOutlined from "@mui/icons-material/LinkOffOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";

import { usePermissions } from "../../hooks/usePermissions";
import { subtleBg } from "../../theme/uiHelpers";

/** Страница настройки ЛИС в админке — одна на организацию. */
export const LAB_CONFIG_ADMIN_URL = "/admin/lab/organizationlabconfig/";

type Props = {
  /**
   * Дровер приёма: узкая колонка, иллюстрация над текстом и без списка
   * шагов подключения — регистратору там достаточно понять, что раздел
   * не работает и к кому идти. На странице раздела — полная версия.
   */
  compact?: boolean;
};

/**
 * Три пробирки в штативе: фиолетовая, красная, жёлтая — те же крышки, что
 * регистратор видит в секции расходников (`labTubes.ts`), так заглушка
 * узнаётся как «про лабораторию» без подписи. Жидкость в пробирках
 * медленно наполняется и опадает, по ней поднимаются пузырьки, штатив
 * чуть покачивается — раздел «дышит», а не лежит мёртвой плашкой.
 */
const TUBES = [
  { x: 52, cap: "#7E57C2", liquid: "#B39DDB", delay: "0s" },
  { x: 90, cap: "#CE4257", liquid: "#EF9A9A", delay: "-1.3s" },
  { x: 128, cap: "#E4A81D", liquid: "#FFE082", delay: "-2.6s" },
];

const TUBE_W = 22;
const TUBE_TOP = 22;
const TUBE_BOTTOM = 102;

function tubePath(x: number): string {
  const r = TUBE_W / 2;
  return [
    `M ${x} ${TUBE_TOP}`,
    `V ${TUBE_BOTTOM - r}`,
    `A ${r} ${r} 0 0 0 ${x + TUBE_W} ${TUBE_BOTTOM - r}`,
    `V ${TUBE_TOP}`,
    "Z",
  ].join(" ");
}

const Illustration: React.FC = () => (
  <Box
    className="lab-nc-scene"
    sx={{ position: "relative", width: 200, height: 136, flexShrink: 0, mx: "auto" }}
  >
    <Box
      component="svg"
      viewBox="0 0 200 136"
      aria-hidden
      sx={{ width: "100%", height: "100%", display: "block", overflow: "visible" }}
    >
      <defs>
        {TUBES.map((tube, i) => (
          <clipPath key={tube.x} id={`lab-nc-clip-${i}`}>
            <path d={tubePath(tube.x)} />
          </clipPath>
        ))}
      </defs>

      <g className="lab-nc-rack">
        {/* Тень под штативом */}
        <ellipse cx="100" cy="122" rx="66" ry="5" className="lab-nc-shadow" />

        {/* Пробирки */}
        {TUBES.map((tube, i) => (
          <g key={tube.x} style={{ "--lab-delay": tube.delay } as React.CSSProperties}>
            <path d={tubePath(tube.x)} className="lab-nc-glass" />
            <g clipPath={`url(#lab-nc-clip-${i})`}>
              <g className="lab-nc-level">
                <g className="lab-nc-wave">
                  {/* Две длины волны, чтобы сдвиг по X зацикливался незаметно */}
                  <path
                    fill={tube.liquid}
                    d={`M ${tube.x - TUBE_W} 70 q ${TUBE_W / 2} -5 ${TUBE_W} 0 t ${TUBE_W} 0 t ${TUBE_W} 0 V 130 H ${tube.x - TUBE_W} Z`}
                  />
                </g>
                {[0, 1, 2].map((b) => (
                  <circle
                    key={b}
                    className="lab-nc-bubble"
                    cx={tube.x + 5 + b * 6}
                    cy={112 - b * 4}
                    r={b === 1 ? 2.2 : 1.5}
                    fill="#fff"
                    style={{ animationDelay: `calc(var(--lab-delay) + ${b * 0.9}s)` }}
                  />
                ))}
              </g>
            </g>
            {/* Блик на стекле */}
            <rect x={tube.x + 3} y={TUBE_TOP + 8} width="3" height="52" rx="1.5" fill="#fff" opacity="0.6" />
            {/* Крышка */}
            <rect x={tube.x - 2} y={TUBE_TOP - 8} width={TUBE_W + 4} height="14" rx="3" fill={tube.cap} />
            <rect x={tube.x - 2} y={TUBE_TOP - 8} width={TUBE_W + 4} height="5" rx="2.5" fill="#fff" opacity="0.25" />
          </g>
        ))}

        {/* Штатив поверх низа пробирок */}
        <rect x="30" y="94" width="140" height="18" rx="5" className="lab-nc-rack-body" />
        {TUBES.map((tube) => (
          <rect
            key={tube.x}
            x={tube.x - 3}
            y="94"
            width={TUBE_W + 6}
            height="18"
            rx="4"
            className="lab-nc-rack-hole"
          />
        ))}
      </g>
    </Box>

    {/* «Связи нет»: значок с пунктирным кольцом, кольцо медленно вращается */}
    <Box
      className="lab-nc-badge"
      sx={{
        position: "absolute",
        top: -6,
        right: 4,
        width: 40,
        height: 40,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        color: "warning.onSurface",
        bgcolor: "background.paper",
        boxShadow: (t) => `0 2px 8px ${alpha(t.palette.common.black, 0.12)}`,
        "&::before": {
          content: '""',
          position: "absolute",
          inset: -4,
          borderRadius: "50%",
          border: (t) => `2px dashed ${alpha(t.palette.warning.main, 0.6)}`,
          animation: "labNcRing 14s linear infinite",
        },
      }}
    >
      <LinkOffOutlined sx={{ fontSize: 20 }} />
    </Box>
  </Box>
);

/**
 * Заглушка «лаборатория не подключена». Показывается вместо ленты заказов
 * на странице раздела и вместо формы в дровере приёма, когда у организации
 * нет `OrganizationLabConfig` (`GET /lab/settings/` → `configured: false`).
 *
 * Кому что говорить: суперпользователь видит кнопку в админку — именно
 * там раздел и настраивается, а для остальных ссылка бесполезна
 * (`/admin/` их не пустит), им — «обратитесь к администратору».
 */
const LabNotConfigured: React.FC<Props> = ({ compact = false }) => {
  const { role, activeOrganization } = usePermissions();
  const canConfigure = role?.name === "superadmin";
  const orgName = activeOrganization?.name;

  return (
    <Box
      role="status"
      sx={(t) => ({
        position: "relative",
        overflow: "hidden",
        borderRadius: 2,
        // Плоско, как весь новый UI: тонкая пунктирная грань и едва заметная
        // подложка, без градиентов (docs/ui-style-guide.md §2).
        border: `1px dashed ${t.palette.divider}`,
        bgcolor: subtleBg(t),
        px: compact ? 2.5 : { xs: 3, md: 5 },
        py: compact ? 3 : { xs: 4, md: 5 },
        display: "flex",
        flexDirection: compact ? "column" : { xs: "column", md: "row" },
        alignItems: "center",
        gap: compact ? 2.5 : { xs: 3, md: 5 },
        textAlign: compact ? "center" : { xs: "center", md: "left" },

        "& .lab-nc-glass": {
          fill: t.palette.background.paper,
          stroke: alpha(t.palette.primary.main, 0.35),
          strokeWidth: 1.5,
        },
        "& .lab-nc-rack-body": {
          fill: t.palette.primary.lighter,
          stroke: alpha(t.palette.primary.main, 0.25),
        },
        "& .lab-nc-rack-hole": { fill: alpha(t.palette.primary.main, 0.18) },
        "& .lab-nc-shadow": { fill: alpha(t.palette.primary.main, 0.08) },

        "& .lab-nc-rack": {
          transformOrigin: "100px 110px",
          animation: "labNcFloat 6s ease-in-out infinite",
        },
        "& .lab-nc-level": { animation: "labNcFill 7s ease-in-out infinite var(--lab-delay)" },
        "& .lab-nc-wave": { animation: "labNcWave 2.4s linear infinite var(--lab-delay)" },
        "& .lab-nc-bubble": { animation: "labNcBubble 3.6s ease-in infinite" },

        "@keyframes labNcFloat": {
          "0%, 100%": { transform: "translateY(0) rotate(0deg)" },
          "50%": { transform: "translateY(-3px) rotate(-0.6deg)" },
        },
        "@keyframes labNcFill": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-18px)" },
        },
        "@keyframes labNcWave": {
          from: { transform: "translateX(0)" },
          to: { transform: `translateX(${TUBE_W}px)` },
        },
        "@keyframes labNcBubble": {
          "0%": { transform: "translateY(0)", opacity: 0 },
          "15%": { opacity: 0.9 },
          "85%": { opacity: 0.9 },
          "100%": { transform: "translateY(-38px)", opacity: 0 },
        },
        "@keyframes labNcRing": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "@media (prefers-reduced-motion: reduce)": {
          "& *, & *::before": { animation: "none !important" },
        },
      })}
    >
      <Illustration />

      <Stack spacing={1.5} sx={{ maxWidth: 440 }}>
        <Typography variant={compact ? "subtitle1" : "h6"} fontWeight={700}>
          Лаборатория ещё не подключена
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {orgName ? `Организация «${orgName}»` : "Ваша организация"} не связана с ЛИС
          ExpressLab, поэтому принимать анализы пока нельзя.
          {canConfigure
            ? " Подключение настраивается в админке: код организации в ЛИС, врач по умолчанию и точки регистрации по филиалам, после чего запускается синхронизация каталога."
            : " Подключение настраивает администратор системы — обратитесь к нему."}
        </Typography>

        {canConfigure && (
          <Stack
            direction="row"
            spacing={1}
            sx={{ pt: 0.5, justifyContent: compact ? "center" : { xs: "center", md: "flex-start" } }}
          >
            {/* Обычный Button, не AppButton: тому нужен component="a" с
                target, а его обёртка полиморфные пропсы не пропускает. */}
            <Button
              variant="contained"
              size="small"
              href={LAB_CONFIG_ADMIN_URL}
              target="_blank"
              rel="noopener"
              endIcon={<OpenInNewOutlined sx={{ fontSize: 16 }} />}
            >
              Открыть настройки ЛИС
            </Button>
          </Stack>
        )}
      </Stack>
    </Box>
  );
};

export default LabNotConfigured;

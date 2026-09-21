import React from "react";
import { Box, ButtonBase, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import CheckRounded from "@mui/icons-material/CheckRounded";

import type { DealStage } from "../../api/deals";
import { useT } from "../../i18n/VerticalProvider";

interface StageStepperProps {
  stages: DealStage[];
  currentStageId: number;
  /** Может ли пользователь перенести сделку в этот этап (права, возврат из закрытых). */
  canMoveTo: (stageId: number) => boolean;
  onSelect: (stageId: number) => void;
  disabled?: boolean;
}

/** Высота ступени; шеврон вырезается clip-path по этой же высоте. */
const STEP_HEIGHT = 34;
/** Глубина «стрелки» шеврона. */
const NOTCH = 9;

/**
 * Полоса этапов воронки в шапке карточки: ступени-шевроны в порядке воронки.
 *
 * Пройденные этапы залиты своим цветом приглушённо, текущий — ярко и с галочкой,
 * будущие — контуром. Нажатие переносит сделку (тот же `move/`, что на доске);
 * этап «потеряна» вынесен в конец и в дровере запрашивает причину, как раньше.
 * Форма шеврона задана `clip-path`, поэтому ступени наезжают друг на друга
 * на глубину стрелки и читаются как один путь, а не как ряд кнопок.
 */
const StageStepper: React.FC<StageStepperProps> = ({
  stages,
  currentStageId,
  canMoveTo,
  onSelect,
  disabled = false,
}) => {
  const { t } = useT("deals");
  const visible = React.useMemo(() => {
    const active = stages.filter((s) => s.isActive || s.id === currentStageId);
    // Открытые — по порядку воронки, закрытые (выиграна/проиграна) — в хвосте.
    const open = active.filter((s) => s.kind === "open").sort((a, b) => a.order - b.order);
    const won = active.filter((s) => s.kind === "won");
    const lost = active.filter((s) => s.kind === "lost");
    return [...open, ...won, ...lost];
  }, [stages, currentStageId]);

  const currentIndex = visible.findIndex((s) => s.id === currentStageId);
  const current = visible[currentIndex];

  return (
    <Stack gap={0.75}>
      <Stack
        direction="row"
        role="group"
        aria-label={t("detail.stagesAria")}
        sx={{
          overflowX: "auto",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
          // Шевроны наезжают друг на друга — компенсируем, чтобы первый не обрезался.
          mx: -0.25,
          px: 0.25,
        }}
      >
        {visible.map((stage, index) => {
          const isCurrent = stage.id === currentStageId;
          const isPast = currentIndex >= 0 && index < currentIndex && stage.kind === "open";
          const allowed = !disabled && !isCurrent && canMoveTo(stage.id);
          const first = index === 0;
          const last = index === visible.length - 1;
          const clip = [
            `polygon(0 0, calc(100% - ${last ? 0 : NOTCH}px) 0, 100% 50%,`,
            `calc(100% - ${last ? 0 : NOTCH}px) 100%, 0 100%,`,
            `${first ? 0 : NOTCH}px 50%)`,
          ].join(" ");
          const tooltip = isCurrent
            ? t("detail.stageCurrent")
            : !allowed && !disabled
              ? t("detail.stageLocked")
              : stage.name;
          return (
            <Tooltip key={stage.id} title={tooltip} placement="top" enterDelay={400}>
              <Box component="span" sx={{ flex: "1 1 0", minWidth: 0, ml: first ? 0 : `-${NOTCH - 2}px` }}>
                <ButtonBase
                  disabled={!allowed}
                  onClick={() => onSelect(stage.id)}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-label={stage.name}
                  sx={(theme) => {
                    const color = stage.color || theme.palette.primary.main;
                    const fill = isCurrent
                      ? color
                      : isPast
                        ? alpha(color, theme.palette.mode === "dark" ? 0.32 : 0.22)
                        : alpha(theme.palette.text.primary, 0.05);
                    return {
                      width: "100%",
                      height: STEP_HEIGHT,
                      clipPath: clip,
                      bgcolor: fill,
                      color: isCurrent
                        ? theme.palette.getContrastText(color)
                        : isPast
                          ? theme.palette.text.primary
                          : theme.palette.text.secondary,
                      pl: first ? 1.25 : `${NOTCH + 6}px`,
                      pr: last ? 1.25 : `${NOTCH + 4}px`,
                      justifyContent: "flex-start",
                      textAlign: "left",
                      transition: theme.transitions.create(["background-color", "color"], { duration: 200 }),
                      "&.Mui-disabled": { opacity: isCurrent ? 1 : 0.55 },
                      "&:hover:not(.Mui-disabled)": {
                        bgcolor: alpha(color, isPast ? 0.5 : 0.28),
                        color: theme.palette.text.primary,
                      },
                      "&.Mui-focusVisible": { outline: `2px solid ${alpha(color, 0.7)}`, outlineOffset: -2 },
                    };
                  }}
                >
                  <Stack direction="row" alignItems="center" gap={0.5} sx={{ minWidth: 0 }}>
                    {isCurrent ? <CheckRounded sx={{ fontSize: 15, flexShrink: 0 }} /> : null}
                    <Typography
                      variant="caption"
                      component="span"
                      noWrap
                      sx={{ fontWeight: isCurrent ? 700 : 500, letterSpacing: 0.1, lineHeight: 1 }}
                    >
                      {stage.name}
                    </Typography>
                  </Stack>
                </ButtonBase>
              </Box>
            </Tooltip>
          );
        })}
      </Stack>
      {current ? (
        <Typography variant="caption" color="text.secondary" sx={{ px: 0.25 }}>
          {current.name}
          {currentIndex >= 0 && current.kind === "open" ? ` · ${currentIndex + 1}/${visible.filter((s) => s.kind === "open").length}` : ""}
        </Typography>
      ) : null}
    </Stack>
  );
};

export default StageStepper;

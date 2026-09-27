import React from "react";
import { Box, ButtonBase, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, keyframes } from "@mui/material/styles";

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

/** Толщина полосы — как у линии пути этапов в истории. */
const BAR_HEIGHT = 8;
/** Зона нажатия выше полосы, чтобы в неё можно было попасть. */
const HIT_HEIGHT = 22;

/** Текущий сегмент дышит — сделка в работе, здесь она сейчас. */
const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
`;

/**
 * Полоса этапов воронки в шапке карточки.
 *
 * Тонкая линия из сегментов по порядку воронки: пройденные и текущий залиты
 * цветом своего этапа, будущие — пустые. Каждый сегмент — кнопка: нажатие
 * переносит сделку (тот же `move/`, что на доске), название — в тултипе.
 * Закрытые этапы (выиграна/проиграна) идут в хвосте; когда сделка в одном из
 * них, залита вся полоса до него. Под полосой — текущий этап и номер шага.
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
    const open = active.filter((s) => s.kind === "open").sort((a, b) => a.order - b.order);
    const won = active.filter((s) => s.kind === "won");
    const lost = active.filter((s) => s.kind === "lost");
    return [...open, ...won, ...lost];
  }, [stages, currentStageId]);

  const currentIndex = visible.findIndex((s) => s.id === currentStageId);
  const current = visible[currentIndex];
  const openCount = visible.filter((s) => s.kind === "open").length;

  return (
    <Stack gap={0.5}>
      <Stack
        direction="row"
        role="group"
        aria-label={t("detail.stagesAria")}
        sx={{ gap: "2px", height: HIT_HEIGHT, alignItems: "center" }}
      >
        {visible.map((stage, index) => {
          const isCurrent = stage.id === currentStageId;
          const isPast = currentIndex >= 0 && index < currentIndex;
          const allowed = !disabled && !isCurrent && canMoveTo(stage.id);
          const first = index === 0;
          const last = index === visible.length - 1;
          const tooltip = isCurrent
            ? `${stage.name} · ${t("detail.stageCurrent")}`
            : !allowed && !disabled
              ? `${stage.name} · ${t("detail.stageLocked")}`
              : stage.name;
          return (
            <Tooltip key={stage.id} title={tooltip} placement="top" enterDelay={300}>
              <ButtonBase
                disabled={!allowed}
                onClick={() => onSelect(stage.id)}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={stage.name}
                sx={(theme) => {
                  const color = stage.color || theme.palette.primary.main;
                  return {
                    flex: "1 1 0",
                    minWidth: 0,
                    height: HIT_HEIGHT,
                    alignItems: "center",
                    borderRadius: 1,
                    "&.Mui-disabled": { opacity: 1 },
                    "&.Mui-focusVisible .bar": { outline: `2px solid ${alpha(color, 0.7)}`, outlineOffset: 2 },
                    "&:hover:not(.Mui-disabled) .bar": {
                      bgcolor: alpha(color, isPast || isCurrent ? 1 : 0.45),
                      transform: "scaleY(1.35)",
                    },
                  };
                }}
              >
                <Box
                  className="bar"
                  sx={(theme) => {
                    const color = stage.color || theme.palette.primary.main;
                    return {
                      width: "100%",
                      height: BAR_HEIGHT,
                      borderRadius: `${first ? BAR_HEIGHT / 2 : 1}px ${last ? BAR_HEIGHT / 2 : 1}px ${last ? BAR_HEIGHT / 2 : 1}px ${first ? BAR_HEIGHT / 2 : 1}px`,
                      bgcolor: isCurrent
                        ? color
                        : isPast
                          ? alpha(color, 0.55)
                          : alpha(theme.palette.text.primary, theme.palette.mode === "dark" ? 0.12 : 0.08),
                      animation: isCurrent && stage.kind === "open" ? `${pulse} 2.4s ease-in-out infinite` : "none",
                      transition: theme.transitions.create(["background-color", "transform"], { duration: 160 }),
                      "@media (prefers-reduced-motion: reduce)": { animation: "none" },
                    };
                  }}
                />
              </ButtonBase>
            </Tooltip>
          );
        })}
      </Stack>
      {current ? (
        <Stack direction="row" alignItems="baseline" gap={0.75} sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600} noWrap sx={{ minWidth: 0 }}>
            {current.name}
          </Typography>
          {current.kind === "open" ? (
            <Typography variant="caption" color="text.disabled" noWrap>
              {currentIndex + 1}/{openCount}
            </Typography>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
};

export default StageStepper;

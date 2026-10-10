import React from "react";
import { Box, ButtonBase, Collapse, Stack, Tooltip, Typography } from "@mui/material";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";

import { activeNoGive } from "./feedingCatalog";
import { NORMAL_THINGS, type HowToFeed } from "./feedingNorms";
import { FeedingPanel, NoticeLine, Pill } from "./FeedingParts";

/** Стрелка с подписью, которая раскрывает свёрнутый блок. */
export const Toggle: React.FC<{ open: boolean; onClick: () => void; children: React.ReactNode }> = ({ open, onClick, children }) => (
  <ButtonBase
    onClick={onClick}
    aria-expanded={open}
    sx={{ alignSelf: "flex-start", borderRadius: "8px", px: 0.5, gap: 0.5, color: "text.secondary" }}
  >
    <ExpandMoreOutlined fontSize="small" sx={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
    <Typography variant="body2" fontWeight={600}>
      {children}
    </Typography>
  </ButtonBase>
);

interface FeedingHowToProps {
  howTo: HowToFeed;
  /** Признаки готовности уже показаны в «Сегодня». */
  hideReadiness: boolean;
}

/** «Как кормить сейчас» (§3.5): столбец возраста ребёнка строками, общие правила и «Это нормально» — свёрнуты. */
export const FeedingHowTo: React.FC<FeedingHowToProps> = ({ howTo, hideReadiness }) => {
  const [rulesOpen, setRulesOpen] = React.useState(false);
  const [normalOpen, setNormalOpen] = React.useState(false);
  return (
    <FeedingPanel title="Как кормить сейчас" caption={howTo.caption}>
      {howTo.readiness && !hideReadiness && <NoticeLine tone="on">{howTo.readiness}</NoticeLine>}
      <Stack gap={0.5}>
        {howTo.items.map((item) => (
          <React.Fragment key={item.key}>
            <Typography variant="body2">
              <Box component="span" sx={{ color: "text.secondary" }}>
                {item.label}:
              </Box>{" "}
              {item.text}
            </Typography>
            {item.alert && (
              <Box sx={{ alignSelf: "flex-start", maxWidth: "100%" }}>
                <Pill tone="warn" dot>
                  {item.alert}
                </Pill>
              </Box>
            )}
          </React.Fragment>
        ))}
      </Stack>
      <Stack direction="row" gap={1.5} flexWrap="wrap">
        {howTo.always.length > 0 && (
          <Toggle open={rulesOpen} onClick={() => setRulesOpen((value) => !value)}>
            Общие правила
          </Toggle>
        )}
        <Toggle open={normalOpen} onClick={() => setNormalOpen((value) => !value)}>
          Это нормально
        </Toggle>
      </Stack>
      {howTo.always.length > 0 && (
        <Collapse in={rulesOpen} unmountOnExit>
          <Stack gap={0.5}>
            {howTo.always.map((item) => (
              <NoticeLine key={item.key} tone="muted">
                {item.text}
              </NoticeLine>
            ))}
          </Stack>
        </Collapse>
      )}
      <Collapse in={normalOpen} unmountOnExit>
        <Box component="ul" sx={{ m: 0, pl: 3, color: "text.secondary", typography: "body2" }}>
          {NORMAL_THINGS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </Box>
      </Collapse>
    </FeedingPanel>
  );
};

/** «Не давать» (§3.3): первые семь действующих в этом возрасте — чипами, остальные — под «Ещё». */
export const FeedingNoGive: React.FC<{ months: number }> = ({ months }) => {
  const [more, setMore] = React.useState(false);
  const items = activeNoGive(months);
  if (!items.length) return null;
  const chip = (item: (typeof items)[number]) => (
    <Tooltip key={item.key} title={`${item.text} Источник: ${item.source}.`} arrow enterTouchDelay={0}>
      <Box component="span" tabIndex={0} sx={{ display: "inline-flex", maxWidth: "100%", outline: "none" }}>
        <Pill tone="bad">{item.chip}</Pill>
      </Box>
    </Tooltip>
  );
  return (
    <FeedingPanel title="Не давать" caption="до какого возраста">
      <Stack direction="row" gap={0.75} flexWrap="wrap">
        {items.slice(0, 7).map(chip)}
      </Stack>
      {items.length > 7 && (
        <>
          <Toggle open={more} onClick={() => setMore((value) => !value)}>
            Ещё {items.length - 7}
          </Toggle>
          <Collapse in={more} unmountOnExit>
            <Stack direction="row" gap={0.75} flexWrap="wrap">
              {items.slice(7).map(chip)}
            </Stack>
          </Collapse>
        </>
      )}
    </FeedingPanel>
  );
};

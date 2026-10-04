import React from "react";
import { Box, ButtonBase, Collapse, Divider, Popover, Stack, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";

import type { RiskGroupRecord } from "../../../api/health";
import { AppButton } from "../../ui";
import { factorText, type Factor } from "./anamnesisFactors";
import type { RiskSuggestion } from "./anamnesisRules";
import { RISK_GROUP_META, RISK_GROUP_ORDER, RISK_STATUS_LABELS } from "./anamnesisTypes";
import { Caption, ToneChip } from "./anamnesisUi";
import { recordChip } from "./anamnesisView";
import { dateText, plural } from "./russian";

const STATUS_ORDER: Record<string, number> = { active: 0, realized: 1, removed: 2 };

interface RiskGroupsBlockProps {
  records: RiskGroupRecord[];
  suggestions: RiskSuggestion[];
  birthDate: string | null;
  at: string;
  frequentIll?: boolean;
  canManage: boolean;
  onOpenRecord: (record: RiskGroupRecord) => void;
  onEstablish: (suggestion: RiskSuggestion) => void;
  onDecline: (suggestion: RiskSuggestion) => void;
  onAdd: () => void;
}

/** Группы риска (ТЗ §4.2, п. 2): метки записей и пунктирные предложения системы. */
export const RiskGroupsBlock: React.FC<RiskGroupsBlockProps> = ({
  records,
  suggestions,
  birthDate,
  at,
  frequentIll,
  canManage,
  onOpenRecord,
  onEstablish,
  onDecline,
  onAdd,
}) => {
  const [menu, setMenu] = React.useState<{ anchor: HTMLElement; suggestion: RiskSuggestion } | null>(null);
  const [history, setHistory] = React.useState(false);
  // Отклонённые и ошибочные — только в истории.
  const hidden = records.filter((record) => record.status === "declined" || record.status === "refuted");
  const visible = records
    .filter((record) => record.status in STATUS_ORDER)
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || RISK_GROUP_ORDER.indexOf(a.group) - RISK_GROUP_ORDER.indexOf(b.group),
    );
  const factorsWord = (factors: Factor[]) => `${factors.length} ${plural(factors.length, "фактор", "фактора", "факторов")}`;

  return (
    <Box>
      <Stack direction="row" gap={0.75} flexWrap="wrap" alignItems="center">
        <Caption sx={{ mr: 0.5 }}>Группы риска</Caption>
        {visible.map((record) => {
          const chip = recordChip(record, birthDate, at, frequentIll);
          return <ToneChip key={record.id} label={chip.label} tone={chip.tone} dot={chip.tone !== "neutral"} onClick={() => onOpenRecord(record)} />;
        })}
        {suggestions.map((suggestion) => (
          <ToneChip
            key={suggestion.group}
            label={`${RISK_GROUP_META[suggestion.group].short}? · ${factorsWord(suggestion.factors)}`}
            tone="warn"
            dashed
            onClick={(event) => setMenu({ anchor: event.currentTarget, suggestion })}
          />
        ))}
        {!visible.length && !suggestions.length && (
          <Typography variant="body2" color="text.secondary">
            не установлены
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
          предлагает система, ставит и снимает врач
        </Typography>
        {canManage && (
          <AppButton size="small" variant="text" startIcon={<AddOutlined />} onClick={onAdd}>
            Группа риска
          </AppButton>
        )}
        {hidden.length > 0 && (
          <ButtonBase onClick={() => setHistory((value) => !value)} sx={{ borderRadius: "6px", px: 0.5 }}>
            <Typography variant="caption" color="primary.main" fontWeight={600}>
              {history ? "скрыть историю" : `история (${hidden.length})`}
            </Typography>
          </ButtonBase>
        )}
        <Popover
          open={menu != null}
          anchorEl={menu?.anchor}
          onClose={() => setMenu(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          slotProps={{ paper: { sx: { maxWidth: 360, p: 1.5, borderRadius: "12px" } } }}
        >
          {menu && (
            <Stack gap={1}>
              <Typography variant="subtitle2" fontWeight={700}>
                {RISK_GROUP_META[menu.suggestion.group].label}?
              </Typography>
              <Box>
                <Caption>Почему</Caption>
                <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.25 }}>
                  {menu.suggestion.factors.map((factor) => (
                    <Typography key={factor.code} component="li" variant="body2">
                      {factorText(factor)}
                    </Typography>
                  ))}
                </Box>
              </Box>
              {canManage && (
                <>
                  <Divider />
                  <Stack direction="row" gap={1} justifyContent="flex-end">
                    <AppButton
                      size="small"
                      onClick={() => {
                        onDecline(menu.suggestion);
                        setMenu(null);
                      }}
                    >
                      Не ставить
                    </AppButton>
                    <AppButton
                      size="small"
                      variant="contained"
                      onClick={() => {
                        onEstablish(menu.suggestion);
                        setMenu(null);
                      }}
                    >
                      Поставить
                    </AppButton>
                  </Stack>
                </>
              )}
            </Stack>
          )}
        </Popover>
      </Stack>
      <Collapse in={history} unmountOnExit>
        <Stack gap={0.5} sx={{ mt: 1, pl: 0.5 }}>
          {hidden.map((record) => (
            <ButtonBase key={record.id} onClick={() => onOpenRecord(record)} sx={{ justifyContent: "flex-start", textAlign: "left", borderRadius: "6px" }}>
              <Typography variant="body2" color="text.secondary">
                {RISK_GROUP_META[record.group].short} · {RISK_STATUS_LABELS[record.status]}
                {record.establishedOn ? ` ${dateText(record.establishedOn)}` : ""}
                {record.basisNote ? ` — ${record.basisNote}` : ""}
              </Typography>
            </ButtonBase>
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
};

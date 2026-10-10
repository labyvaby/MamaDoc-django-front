import React from "react";
import { Box, Stack, Typography, alpha, useTheme } from "@mui/material";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";

import type { AnamnesisFlag } from "./anamnesisRules";
import type { AnamnesisInput } from "./anamnesisTypes";
import { Panel, ToneChip } from "./anamnesisUi";
import { familyChips, illnessFacts, newbornChips, newbornNumbers, newbornTitle } from "./anamnesisView";
import { lowerFirst } from "./russian";

/** «Новорождённая · роддом № 4, Бишкек»: четыре числа и метки (ТЗ §4.2, п. 5). */
export const NewbornPanel: React.FC<{ input: AnamnesisInput }> = ({ input }) => {
  const numbers = newbornNumbers(input);
  const chips = newbornChips(input);
  const hospital = input.profile?.maternityHospital ? lowerFirst(input.profile.maternityHospital) : "";
  return (
    <Panel title={newbornTitle(input.sex)} caption={hospital}>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 0.75 }}>
        {numbers.map((item) => (
          <Box key={item.label} sx={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
            <Typography sx={{ fontSize: 22, fontWeight: 600, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{item.value}</Typography>
            <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>{item.label}</Typography>
          </Box>
        ))}
      </Box>
      {chips.length > 0 ? (
        <Stack direction="row" gap={0.75} flexWrap="wrap">
          {chips.map((chip) => (
            <ToneChip key={chip.label} label={chip.label} tone={chip.tone === "ok" ? "neutral" : chip.tone} dot={chip.tone === "warn" || chip.tone === "bad"} />
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Первые дни жизни не заполнены
        </Typography>
      )}
    </Panel>
  );
};

/** «Семья и быт» и ниже «Болезни и аллергии» из других разделов. */
export const FamilyLifePanel: React.FC<{ input: AnamnesisInput; at: string }> = ({ input, at }) => {
  const chips = familyChips(input, at);
  const allFacts = illnessFacts(input, at);
  // «Нет …» — одной серой строкой под списком, а не меткой на каждый пункт.
  const noFacts = allFacts.filter((fact) => fact.chip.label === "Нет");
  const facts = allFacts.filter((fact) => fact.chip.label !== "Нет");
  return (
    <Panel title="Семья и быт">
      {chips.length ? (
        <Stack direction="row" gap={0.75} flexWrap="wrap">
          {chips.map((chip) => (
            <ToneChip key={chip.label} label={chip.label} tone={chip.tone === "accent" ? "neutral" : chip.tone} dot={chip.tone === "warn" || chip.tone === "bad"} />
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Семья и быт не заполнены
        </Typography>
      )}
      <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 0.75 }}>
        Болезни и аллергии
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1, fontWeight: 500 }}>
          из других разделов
        </Typography>
      </Typography>
      {allFacts.length ? (
        <>
          {facts.length > 0 && (
            <Stack component="ul" gap={0.75} sx={{ listStyle: "none", m: 0, p: 0 }}>
              {facts.map((fact) => (
                <Box
                  component="li"
                  key={`${fact.chip.label}${fact.text}`}
                  sx={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", columnGap: 1, alignItems: "baseline" }}
                >
                  <ToneChip label={fact.chip.label} tone={fact.chip.tone} dot={fact.chip.tone === "bad" || fact.chip.tone === "warn"} dense />
                  <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    {fact.text}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
          {noFacts.length > 0 && (
            <Typography variant="body2" color="text.secondary">
              {`Нет: ${noFacts.map((fact) => fact.text).join(", ")}`}
            </Typography>
          )}
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Нет сведений
        </Typography>
      )}
    </Panel>
  );
};

/** «Обратить внимание» — только когда есть что сказать (ТЗ §3.5). */
export const AttentionList: React.FC<{ flags: AnamnesisFlag[] }> = ({ flags }) => {
  const theme = useTheme();
  if (!flags.length) return null;
  return (
    <Box
      sx={{
        border: 1,
        borderColor: alpha(theme.palette.warning.main, 0.5),
        bgcolor: alpha(theme.palette.warning.main, theme.palette.mode === "dark" ? 0.08 : 0.06),
        borderRadius: "12px",
        px: 1.5,
        py: 1.25,
      }}
    >
      <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 0.5 }}>
        <WarningAmberOutlined fontSize="small" sx={{ color: "warning.main" }} />
        <Typography variant="subtitle2" fontWeight={700}>
          Обратить внимание
        </Typography>
      </Stack>
      <Box component="ul" sx={{ m: 0, pl: 3.5 }}>
        {flags.map((flag) => (
          <Typography key={flag.code} component="li" variant="body2" sx={{ py: 0.25 }}>
            {flag.text}
          </Typography>
        ))}
      </Box>
    </Box>
  );
};

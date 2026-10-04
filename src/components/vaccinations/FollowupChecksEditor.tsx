import React from "react";
import { Alert, Box, IconButton, Stack, TextField, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";

import { AppButton } from "../ui";
import {
  BCG_FOLLOWUP_PRESET,
  followupRowsError,
  nextFollowupKey,
  toFollowupRows,
  type FollowupRow,
} from "./reactionMeta";

interface FollowupChecksEditorProps {
  rows: FollowupRow[];
  onChange: (rows: FollowupRow[]) => void;
}

const digits = (value: string) => value.replace(/[^\d]/g, "").slice(0, 4);

/**
 * Сроки осмотра места прививки в карточке вакцины (сетка БЦЖ формы 112/у):
 * подпись и дни «с — по» от даты прививки. Для БЦЖ — шаблон бланка одной кнопкой.
 */
export const FollowupChecksEditor: React.FC<FollowupChecksEditorProps> = ({ rows, onChange }) => {
  const error = followupRowsError(rows);
  const patch = (index: number, next: Partial<FollowupRow>) =>
    onChange(rows.map((row, at) => (at === index ? { ...row, ...next } : row)));

  return (
    <Stack spacing={1}>
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: "block" }}>
          Осмотр места прививки
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Сроки в днях от даты прививки. Пусто — сетки у вакцины нет.
        </Typography>
      </Box>
      {rows.map((row, index) => (
        <Stack key={row.key} direction="row" gap={1} alignItems="center">
          <TextField
            size="small"
            label="Срок"
            value={row.label}
            onChange={(event) => patch(index, { label: event.target.value })}
            sx={{ flex: 1, minWidth: 0 }}
          />
          <TextField
            size="small"
            label="С, дн."
            value={row.fromDays}
            onChange={(event) => patch(index, { fromDays: digits(event.target.value) })}
            inputProps={{ inputMode: "numeric" }}
            sx={{ width: 76, flexShrink: 0 }}
          />
          <TextField
            size="small"
            label="По, дн."
            value={row.toDays}
            onChange={(event) => patch(index, { toDays: digits(event.target.value) })}
            inputProps={{ inputMode: "numeric" }}
            sx={{ width: 76, flexShrink: 0 }}
          />
          <IconButton
            size="small"
            aria-label="Убрать срок"
            onClick={() => onChange(rows.filter((_, at) => at !== index))}
          >
            <DeleteOutline fontSize="small" />
          </IconButton>
        </Stack>
      ))}
      {rows.length > 0 && error && (
        <Alert severity="warning" sx={{ py: 0 }}>
          {error}
        </Alert>
      )}
      <Stack direction="row" gap={1} flexWrap="wrap">
        <AppButton
          size="small"
          variant="text"
          startIcon={<AddOutlined />}
          onClick={() => onChange([...rows, { key: nextFollowupKey(rows), label: "", fromDays: "", toDays: "" }])}
        >
          Срок
        </AppButton>
        <AppButton size="small" variant="text" onClick={() => onChange(toFollowupRows(BCG_FOLLOWUP_PRESET))}>
          Сетка БЦЖ
        </AppButton>
      </Stack>
    </Stack>
  );
};

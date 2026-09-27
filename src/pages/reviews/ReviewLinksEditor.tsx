import React from "react";
import {
  Alert,
  Box,
  Collapse,
  IconButton,
  InputAdornment,
  Link,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import HelpOutlineRounded from "@mui/icons-material/HelpOutlineRounded";

import type { BranchMaps, MapPlatform } from "../../api/reviews";
import { MAP_META } from "./meta";
import {
  branchLink,
  isReviewUrl,
  linkKey,
  PLATFORMS,
  type LinksDraft,
} from "./reviewLinks";

const WHERE_TO_GET: Record<MapPlatform, string> = {
  "2gis":
    "Откройте филиал на 2gis.kg → вкладка «Отзывы» → скопируйте адрес страницы.",
  yandex:
    "Откройте организацию на Яндекс Картах → «Отзывы» → скопируйте адрес страницы.",
  google:
    "В Google Бизнес-профиле нажмите «Попросить оставить отзыв» и скопируйте ссылку (вида g.page/r/…/review) — она сразу открывает окно отзыва.",
};

/** Ссылки «оставить отзыв» по филиалам; пустое поле — ссылка из карточки филиала. */
const ReviewLinksEditor: React.FC<{
  branches: BranchMaps[];
  draft: LinksDraft;
  onChange: (key: string, url: string) => void;
}> = ({ branches, draft, onChange }) => {
  const [help, setHelp] = React.useState(false);
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: "14px" }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle1" fontWeight={700}>
          Куда вести пациента после 5★
        </Typography>
        <Tooltip title="Где взять ссылки">
          <IconButton size="small" onClick={() => setHelp((v) => !v)}>
            <HelpOutlineRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mb: 1.5 }}
      >
        Лучше давать ссылку сразу на страницу отзывов. Пустое поле — берётся
        ссылка из карточки филиала (она же «как добраться» в онлайн-записи).
        Сколько площадок заполнено, столько кнопок увидит пациент.
      </Typography>
      <Collapse in={help}>
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setHelp(false)}>
          <Stack spacing={0.5}>
            {PLATFORMS.map((p) => (
              <Typography key={p} variant="body2">
                <b>{MAP_META[p]}:</b> {WHERE_TO_GET[p]}
              </Typography>
            ))}
          </Stack>
        </Alert>
      </Collapse>

      <Stack spacing={2.5}>
        {branches.map((b) => {
          const effective = PLATFORMS.filter(
            (p) =>
              (draft[linkKey(b.branchId, p)] ?? "").trim() || branchLink(b, p)
          );
          return (
            <Box key={b.branchId}>
              <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>
                {b.branchName}
              </Typography>
              <Stack spacing={1.25}>
                {PLATFORMS.map((p) => {
                  const key = linkKey(b.branchId, p);
                  const value = draft[key] ?? "";
                  const fallback = branchLink(b, p);
                  const bad = value.trim() !== "" && !isReviewUrl(value);
                  const target = value.trim() || fallback;
                  return (
                    <TextField
                      key={p}
                      size="small"
                      fullWidth
                      label={`${MAP_META[p]} — ссылка на отзыв`}
                      value={value}
                      onChange={(e) => onChange(key, e.target.value)}
                      placeholder={fallback || "https://…"}
                      error={bad}
                      helperText={
                        bad
                          ? "Нужна ссылка, начинающаяся с https://"
                          : value.trim()
                          ? undefined
                          : fallback
                          ? "Пусто — откроется ссылка из карточки филиала"
                          : "Не задано — кнопки этой площадки не будет"
                      }
                      inputProps={{ maxLength: 500 }}
                      InputProps={{
                        endAdornment: target && !bad && (
                          <InputAdornment position="end">
                            <Tooltip title="Открыть, как увидит пациент">
                              <IconButton
                                size="small"
                                component={Link}
                                href={target}
                                target="_blank"
                                rel="noopener"
                              >
                                <OpenInNewRounded fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </InputAdornment>
                        ),
                      }}
                    />
                  );
                })}
              </Stack>
              {effective.length === 0 && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  Ни одной ссылки — пациенты этого филиала после 5★ не увидят
                  кнопок карт.
                </Alert>
              )}
            </Box>
          );
        })}
      </Stack>
    </Paper>
  );
};

export default ReviewLinksEditor;

import React from "react";
import {
  Alert,
  Box,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";

import { AppButton } from "../../components/ui";
import PeriodStepper from "../../components/vaccinations/PeriodStepper";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
} from "../../api/queryKeys";
import { downloadForm5Docx, getForm5 } from "../../api/vaccinations";
import {
  FORM5_SECTIONS,
  form5IsEmpty,
  form5Period,
  formatForm5Value,
  isTotalRow,
} from "../../components/vaccinations/form5Tables";

type Props = {
  branchId: number | null;
  orgId?: number;
};

/**
 * «Форма 5» — государственная статформа о прививочной работе за месяц или год:
 * таблицы разделов 1, 2, 3, 5, 6 и выгрузка заполненного бланка в Word.
 * Считаются только госвакцины (карточки с источником «гос.»).
 */
const Form5Tab: React.FC<Props> = ({ branchId, orgId }) => {
  const [mode, setMode] = React.useState<"month" | "year">("month");
  const [month, setMonth] = React.useState(() =>
    dayjs().subtract(1, "month").format("YYYY-MM")
  );
  const [orgWide, setOrgWide] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);

  const period = form5Period(mode, month);
  const scopeBranchId = orgWide ? null : branchId;

  const query = useQuery({
    queryKey: djangoQueryKeys.vaccinations.form5({
      period,
      branchId: scopeBranchId,
      orgId,
    }),
    queryFn: ({ signal }) =>
      getForm5(
        { period, branchId: scopeBranchId, organizationId: orgId },
        signal
      ),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });
  const report = query.data;

  const download = async () => {
    if (!report) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadForm5Docx({
        period,
        periodLabel: report.periodLabel,
        branchId: scopeBranchId,
        organizationId: orgId,
      });
    } catch (e) {
      setDownloadError(
        e instanceof Error ? e.message : "Не удалось сформировать форму 5"
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Box
      sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
    >
      <Stack
        direction="row"
        gap={1}
        alignItems="center"
        flexWrap="wrap"
        sx={{ mb: 1.5, flexShrink: 0 }}
      >
        <ToggleButtonGroup
          exclusive
          size="small"
          value={mode}
          onChange={(_, v) => v && setMode(v)}
        >
          <ToggleButton value="month" sx={{ textTransform: "none", px: 1.5 }}>
            Месяц
          </ToggleButton>
          <ToggleButton value="year" sx={{ textTransform: "none", px: 1.5 }}>
            Год
          </ToggleButton>
        </ToggleButtonGroup>
        <PeriodStepper value={month} onChange={setMonth} mode={mode} />
        {branchId != null && (
          <ToggleButtonGroup
            exclusive
            size="small"
            value={orgWide ? "org" : "branch"}
            onChange={(_, v) => v && setOrgWide(v === "org")}
          >
            <ToggleButton
              value="branch"
              sx={{ textTransform: "none", px: 1.5 }}
            >
              Филиал
            </ToggleButton>
            <ToggleButton value="org" sx={{ textTransform: "none", px: 1.5 }}>
              Организация
            </ToggleButton>
          </ToggleButtonGroup>
        )}
        <Box sx={{ flex: 1 }} />
        <AppButton
          variant="contained"
          startIcon={<FileDownloadOutlined />}
          onClick={() => void download()}
          disabled={!report || downloading}
        >
          Скачать Word
        </AppButton>
      </Stack>

      {downloadError && (
        <Alert
          severity="error"
          onClose={() => setDownloadError(null)}
          sx={{ mb: 1.5 }}
        >
          {downloadError}
        </Alert>
      )}

      {/* Таблицы разделов прокручиваются, панель периода остаётся сверху. */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pr: 0.5 }}>
        {query.error ? (
          <Alert severity="error">
            {query.error instanceof Error
              ? query.error.message
              : "Не удалось построить форму 5"}
          </Alert>
        ) : !report ? (
          <Stack spacing={1}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={120} />
            ))}
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={600}>
              Форма 5 за {report.periodLabel}
            </Typography>
            {report.warnings.map((w) => (
              <Alert key={w} severity="warning">
                {w}
              </Alert>
            ))}
            {form5IsEmpty(report) && report.warnings.length === 0 && (
              <Alert severity="info">
                За период нет прививок госвакцинами, медотводов и отказов.
              </Alert>
            )}
            {FORM5_SECTIONS.map((section) => {
              const rows = report[section.key];
              // В разделе 5 ключи строк внутренние (bopv_plan…), кода в бланке нет.
              const showCode = section.key !== "section5";
              if (rows.length === 0) return null;
              return (
                <Box key={section.key}>
                  <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                    {section.title}
                  </Typography>
                  <TableContainer
                    sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}
                  >
                    <Table size="small" sx={{ minWidth: 560 }}>
                      <TableHead>
                        <TableRow>
                          {showCode && (
                            <TableCell sx={{ fontWeight: 600, width: 56 }}>
                              Код
                            </TableCell>
                          )}
                          <TableCell sx={{ fontWeight: 600 }}>
                            Наименование
                          </TableCell>
                          {section.columns.map((c) => (
                            <TableCell
                              key={c}
                              align="right"
                              sx={{ fontWeight: 600, whiteSpace: "nowrap" }}
                            >
                              {c}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {rows.map((row) => {
                          const total = isTotalRow(section.key, row);
                          return (
                            <TableRow
                              key={row.key}
                              sx={
                                total
                                  ? {
                                      "& td": { fontWeight: 600 },
                                      bgcolor: "action.hover",
                                    }
                                  : undefined
                              }
                            >
                              {showCode && (
                                <TableCell sx={{ color: "text.secondary" }}>
                                  {row.key}
                                </TableCell>
                              )}
                              <TableCell>{row.label}</TableCell>
                              {row.values.map((v, i) => (
                                <TableCell key={i} align="right">
                                  {formatForm5Value(section.key, i, v)}
                                </TableCell>
                              ))}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              );
            })}
          </Stack>
        )}
      </Box>
    </Box>
  );
};

export default Form5Tab;

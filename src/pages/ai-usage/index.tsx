import React from "react";
import { useSearchParams } from "react-router";
import {
  Alert,
  Box,
  Breadcrumbs,
  CircularProgress,
  Link,
  Stack,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import ForumOutlined from "@mui/icons-material/ForumOutlined";
import FunctionsOutlined from "@mui/icons-material/FunctionsOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";
import NavigateNextOutlined from "@mui/icons-material/NavigateNextOutlined";

import { usePageTitle } from "../../hooks/usePageTitle";
import { getAiUsageReport } from "../../api/aiUsage";
import { ApiError } from "../../api/client";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../api/queryKeys";
import { DateRangeField, SegmentedTabs, type DateRange } from "../../components/ui";
import { subtleBg } from "../../theme/uiHelpers";
import { formatDateRu } from "../../utility/format";

import {
  AI_USAGE_TRACKING_START,
  avgTokensPerRequest,
  fillUsageDays,
  formatTokens,
  sharePct,
} from "./aiUsageRows";
import { AiUsageChart } from "./AiUsageChart";
import { BranchesTable, EmployeesTable, ModelsTable, OrganizationsTable } from "./AiUsageTables";

const DATE = "YYYY-MM-DD";

type Tab = "organizations" | "branches" | "employees";

const Card: React.FC<{ title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; sx?: object }> = ({
  title,
  action,
  children,
  sx,
}) => (
  <Box
    sx={{
      border: "1px solid",
      borderColor: "divider",
      borderRadius: "14px",
      bgcolor: "background.paper",
      p: { xs: 1.5, sm: 2 },
      minWidth: 0,
      ...sx,
    }}
  >
    {(title || action) && (
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        useFlexGap
        sx={{ mb: 1.5, gap: 1 }}
      >
        {typeof title === "string" ? (
          <Typography variant="subtitle2" fontWeight={600}>
            {title}
          </Typography>
        ) : (
          title
        )}
        {action}
      </Stack>
    )}
    {children}
  </Box>
);

const Tile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "accent" | "error";
}> = ({ icon, label, value, sub, tone = "accent" }) => (
  <Box
    sx={(t) => ({
      flex: "1 1 200px",
      minWidth: 0,
      display: "flex",
      gap: 1.5,
      alignItems: "center",
      p: 1.75,
      borderRadius: "10px",
      border: 1,
      borderColor: "divider",
      bgcolor: subtleBg(t),
    })}
  >
    <Box
      sx={(t) => ({
        width: 40,
        height: 40,
        borderRadius: "10px",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: tone === "error" ? "error.main" : "primary.onSurface",
        bgcolor: alpha(
          tone === "error" ? t.palette.error.main : t.palette.primary.main,
          t.palette.mode === "dark" ? 0.16 : 0.1,
        ),
        "& .MuiSvgIcon-root": { fontSize: 20 },
      })}
    >
      {icon}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: "0.75rem" }}>
        {label}
      </Typography>
      <Typography variant="body1" fontWeight={600} noWrap>
        {value}
      </Typography>
      {sub && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.3 }}>
          {sub}
        </Typography>
      )}
    </Box>
  </Box>
);

const toId = (v: string | null): number | undefined => {
  const n = v ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

/**
 * Расход токенов ИИ-подсказок в заключениях (frontend-ai-usage.md).
 * Только суперадмину — маршрут под RequireSuperAdmin, бэк отвечает 403 остальным.
 * Сверху вниз: организации → филиалы организации → сотрудники филиала.
 * Уровень, период и вкладка — в адресе, чтобы ссылку можно было переслать.
 */
export const AiUsagePage: React.FC = () => {
  usePageTitle("Расход ИИ");
  const theme = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();

  const today = dayjs();
  const fromParam = dayjs(searchParams.get("from") ?? "", DATE, true);
  const toParam = dayjs(searchParams.get("to") ?? "", DATE, true);
  const range: DateRange = {
    from: (fromParam.isValid() ? fromParam : today.subtract(29, "day")).startOf("day"),
    to: (toParam.isValid() ? toParam : today).startOf("day"),
  };
  const from = range.from.format(DATE);
  const to = range.to.format(DATE);
  const organizationId = toId(searchParams.get("org"));
  // Филиал без организации не открываем: в интерфейсе в него попадают только из организации.
  const branchId = organizationId != null ? toId(searchParams.get("branch")) : undefined;
  const level: "all" | "organization" | "branch" =
    branchId != null ? "branch" : organizationId != null ? "organization" : "all";

  const tabs: { key: Tab; label: string }[] =
    level === "all"
      ? [
          { key: "organizations", label: "Организации" },
          { key: "employees", label: "Сотрудники" },
        ]
      : level === "organization"
        ? [
            { key: "branches", label: "Филиалы" },
            { key: "employees", label: "Сотрудники" },
          ]
        : [];
  const tabParam = searchParams.get("tab") as Tab | null;
  const tab: Tab =
    level === "branch" ? "employees" : tabs.some((t) => t.key === tabParam) ? tabParam! : tabs[0].key;

  // Одним вызовом setSearchParams: два подряд в react-router не батчатся.
  const patchParams = (patch: Record<string, string | null>) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v == null) next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: false },
    );

  const rangeInvalid = range.from.isAfter(range.to);

  const query = useQuery({
    queryKey: djangoQueryKeys.reports.aiUsage({ from, to, organizationId, branchId }),
    queryFn: ({ signal }) => getAiUsageReport({ from, to, organizationId, branchId }, signal),
    enabled: !rangeInvalid,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const data = query.data;
  // Пока грузится новый уровень, keepPreviousData держит ответ прошлого —
  // таблицы показывают спиннер, а не чужие строки.
  const stale = query.isPlaceholderData;
  const days = React.useMemo(() => fillUsageDays(from, to, data?.byDay ?? []), [from, to, data]);

  // Имена для крошек — из ответа: после перезагрузки страницы их больше негде взять.
  const orgName =
    data?.byOrganization.find((o) => o.organizationId === organizationId)?.organizationName ||
    data?.byBranch.find((b) => b.organizationId === organizationId)?.organizationName ||
    `Организация №${organizationId}`;
  const branchName =
    data?.byBranch.find((b) => b.branchId === branchId)?.branchName || `Филиал №${branchId}`;

  const totals = data?.totals;
  const grandTotal = totals?.totalTokens ?? 0;
  const avg = totals ? avgTokensPerRequest(totals.totalTokens, totals.requests, totals.errors) : null;

  const error = query.error;
  const errorText =
    error instanceof ApiError && error.status === 403
      ? "Отчёт доступен только суперадминистратору."
      : error instanceof Error
        ? error.message
        : "Не удалось загрузить отчёт.";

  const crumbLink = (label: string, onClick: () => void) => (
    <Link component="button" type="button" underline="hover" color="text.secondary" onClick={onClick}>
      {label}
    </Link>
  );

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        overflowY: "auto",
        px: theme.appLayout.page.paddingX,
        py: 2,
      }}
    >
      <Card>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          alignItems={{ xs: "stretch", md: "center" }}
          justifyContent="space-between"
          useFlexGap
        >
          <Breadcrumbs separator={<NavigateNextOutlined fontSize="small" />} sx={{ minWidth: 0 }}>
            {level === "all" ? (
              <Typography variant="subtitle1" fontWeight={600}>
                Все организации
              </Typography>
            ) : (
              crumbLink("Все организации", () => patchParams({ org: null, branch: null, tab: null }))
            )}
            {level === "organization" && (
              <Typography variant="subtitle1" fontWeight={600}>
                {orgName}
              </Typography>
            )}
            {level === "branch" && crumbLink(orgName, () => patchParams({ branch: null, tab: null }))}
            {level === "branch" && (
              <Typography variant="subtitle1" fontWeight={600}>
                {branchName}
              </Typography>
            )}
          </Breadcrumbs>
          <DateRangeField
            value={range}
            onChange={(r) =>
              patchParams({ from: r.from.format(DATE), to: r.to.format(DATE) })
            }
            minWidth={230}
          />
        </Stack>
        {from < AI_USAGE_TRACKING_START && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
            Учёт обращений к ИИ ведётся с {formatDateRu(AI_USAGE_TRACKING_START)} — за более ранние дни данных нет.
          </Typography>
        )}
      </Card>

      {rangeInvalid && <Alert severity="warning">Дата начала не может быть позже даты окончания.</Alert>}
      {query.isError && !rangeInvalid && <Alert severity="error">{errorText}</Alert>}

      {!rangeInvalid && !query.isError && (query.isLoading || !data || !totals) ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : data && totals ? (
        <>
          <Stack direction="row" flexWrap="wrap" useFlexGap gap={1.5}>
            <Tile
              icon={<FunctionsOutlined />}
              label="Токенов всего"
              value={formatTokens(totals.totalTokens)}
              sub={`запрос ${formatTokens(totals.promptTokens)} · ответ ${formatTokens(totals.completionTokens)} · размышления ${formatTokens(totals.thinkingTokens)}`}
            />
            <Tile icon={<ForumOutlined />} label="Обращений" value={formatTokens(totals.requests)} />
            <Tile
              icon={<AutoAwesomeOutlined />}
              label="В среднем на обращение"
              value={avg != null ? formatTokens(avg) : "—"}
              sub="токенов, без учёта ошибок"
            />
            <Tile
              icon={<ErrorOutlineOutlined />}
              label="Ошибки"
              value={formatTokens(totals.errors)}
              sub={totals.requests > 0 ? `${sharePct(totals.errors, totals.requests)} обращений` : undefined}
              tone={totals.errors > 0 ? "error" : "accent"}
            />
          </Stack>

          <Card
            title="Токены по дням"
            sx={{ height: { xs: 300, md: 320 }, flexShrink: 0, display: "flex", flexDirection: "column" }}
          >
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <AiUsageChart days={days} />
            </Box>
          </Card>

          <Card
            title={
              tabs.length > 0 ? (
                <SegmentedTabs
                  tabs={tabs}
                  value={tab}
                  onChange={(key) => patchParams({ tab: key === tabs[0].key ? null : key })}
                  layoutId="ai-usage-tabs"
                />
              ) : (
                "Сотрудники"
              )
            }
            action={
              <Typography variant="caption" color="text.secondary">
                {tab === "organizations"
                  ? "Нажмите на организацию, чтобы увидеть филиалы"
                  : tab === "branches"
                    ? "Нажмите на филиал, чтобы увидеть сотрудников"
                    : level === "branch"
                      ? "Цифры — только в этом филиале"
                      : "Филиал — где у сотрудника больше всего обращений"}
              </Typography>
            }
          >
            {tab === "organizations" && (
              <OrganizationsTable
                rows={data.byOrganization}
                grandTotal={grandTotal}
                loading={stale}
                onOpen={(row) => patchParams({ org: String(row.organizationId), branch: null, tab: null })}
              />
            )}
            {tab === "branches" && (
              <BranchesTable
                rows={data.byBranch}
                grandTotal={grandTotal}
                loading={stale}
                onOpen={(row) => row.branchId != null && patchParams({ branch: String(row.branchId), tab: null })}
              />
            )}
            {tab === "employees" && (
              <EmployeesTable
                rows={data.byEmployee}
                grandTotal={grandTotal}
                loading={stale}
                showOrganization={level === "all"}
                showBranch={level !== "branch"}
              />
            )}
          </Card>

          <Card title="Модели">
            <ModelsTable rows={data.byModel} grandTotal={grandTotal} loading={stale} />
          </Card>
        </>
      ) : null}
    </Box>
  );
};

export default AiUsagePage;

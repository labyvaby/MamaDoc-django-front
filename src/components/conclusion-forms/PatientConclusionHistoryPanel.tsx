import React from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, Stack,
  ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlined from "@mui/icons-material/ExpandLessOutlined";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { getMedicalConclusion, getPatientConclusionHistoryPage, type MedicalConclusion } from "../../api/medical";
import { djangoQueryKeys } from "../../api/queryKeys";
import { parseConclusionFormData } from "../../api/conclusionFormData";
import { usePermissions } from "../../hooks/usePermissions";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useT } from "../../i18n/VerticalProvider";
import { buildConclusionPrintParts, formatDiagnoses } from "../../utility/conclusionPrintParts";
import { ConclusionFormReadView } from "./ConclusionFormReadView";
import { CONCLUSION_FIELD_LABELS, CONCLUSION_FIELD_UNITS } from "../../utility/conclusionFields";

export interface PatientConclusionHistoryPanelProps {
  patientId: number;
  currentAppointmentId?: number;
  onClose: () => void;
}

/** A separate read view: opening history never writes into the current editor. */
export const HistoricalConclusionBody: React.FC<{ document: MedicalConclusion }> = ({ document }) => {
  const { t } = useT("appointments");
  const parsed = parseConclusionFormData(document.formData);
  const columns = {
    complaints: document.complaints ?? "",
    diagnosis: formatDiagnoses(document.diagnosisData ?? []),
    anamnesis: document.anamnesis ?? "",
    objective: document.objective ?? "",
    conclusion: document.conclusion ?? "",
    heightCm: document.heightCm ?? "",
    weightKg: document.weightKg ?? "",
    temperature: document.temperature ?? "",
  };
  const template = parsed?.snapshot ?? { title: "", name: "", fields: [], target: "conclusion" as const };
  // Without a snapshot the persisted columns contain the complete assembled text.
  const parts = parsed?.snapshot
    ? buildConclusionPrintParts({ template: parsed.snapshot, formValues: parsed.values, manual: parsed.manual, columns })
    : { sheetValues: {}, trailer: columns };
  return (
    <Stack spacing={2}>
      <Typography variant="caption" color="text.secondary">
        {t("conclusion.patientHistory.readOnly")}
      </Typography>
      {parsed?.snapshot ? (
        <ConclusionFormReadView template={template} values={parts.sheetValues} trailer={parts.trailer} />
      ) : Object.values(columns).some(Boolean) ? Object.entries(columns).filter(([, value]) => value.trim()).map(([key, value]) => (
        <Box key={key}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            {CONCLUSION_FIELD_LABELS[key as keyof typeof CONCLUSION_FIELD_LABELS]}
          </Typography>
          <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {value} {CONCLUSION_FIELD_UNITS[key as keyof typeof CONCLUSION_FIELD_UNITS] ?? ""}
          </Typography>
        </Box>
      )) : <Typography color="text.secondary">{t("conclusion.patientHistory.noText")}</Typography>}
      {document.internalComment?.trim() && (
        <Box>
          <Typography variant="subtitle2" color="text.secondary">{t("conclusion.patientHistory.internalComment")}</Typography>
          <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{document.internalComment}</Typography>
        </Box>
      )}
      {!!document.photoUrls?.length && (
        <Stack direction="row" gap={1} flexWrap="wrap">
          {document.photoUrls.map((url, index) => (
            <Box component="a" key={url} href={url} target="_blank" rel="noopener noreferrer">
              <Box component="img" src={url} alt={`${t("conclusion.photos")} ${index + 1}`}
                sx={{ width: 96, height: 96, objectFit: "cover", borderRadius: 1 }} />
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
};

const HistoryDetail: React.FC<{ patientId: number; id: number; scope: unknown; organizationId?: number }> = ({
  patientId, id, scope, organizationId,
}) => {
  const { t } = useT("appointments");
  const query = useQuery({
    queryKey: djangoQueryKeys.patients.historicalConclusion(patientId, id, scope),
    queryFn: ({ signal }) => getMedicalConclusion(id, signal, organizationId),
    staleTime: 30_000,
    retry: false,
  });
  if (query.isPending) return <CircularProgress size={22} aria-label={t("conclusion.patientHistory.loading")} />;
  if (query.isError) return <Alert severity="error" action={<Button onClick={() => void query.refetch()}>{t("conclusion.patientHistory.retry")}</Button>}>
    {t("conclusion.patientHistory.detailError")}
  </Alert>;
  return <HistoricalConclusionBody document={query.data} />;
};

export const PatientConclusionHistoryPanel: React.FC<PatientConclusionHistoryPanelProps> = ({
  patientId, currentAppointmentId, onClose,
}) => {
  const { t } = useT("appointments");
  const apiOrganizationId = useApiOrgId();
  const { activeEmployee, activeMembership, activeBranch, activeOrganization } = usePermissions();
  const organizationId = apiOrganizationId ?? activeOrganization?.id;
  const employeeId = activeEmployee?.id ?? null;
  const scope = { organizationId, membershipId: activeMembership?.id, branchId: activeBranch?.id };
  const [filter, setFilter] = React.useState<"mine" | "all">(employeeId === null ? "all" : "mine");
  const [expandedId, setExpandedId] = React.useState<number | null>(null);
  React.useEffect(() => {
    setFilter(employeeId === null ? "all" : "mine");
    setExpandedId(null);
  }, [patientId, currentAppointmentId, employeeId, activeMembership?.id]);
  const history = useInfiniteQuery({
    queryKey: djangoQueryKeys.patients.conclusionHistory(patientId, scope),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => getPatientConclusionHistoryPage(patientId, pageParam, organizationId, signal),
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    staleTime: 30_000,
    retry: false,
  });
  const records = (history.data?.pages.flatMap((page) => page.items) ?? [])
    .filter((record) => record.appointmentId !== currentAppointmentId);
  const visible = records.filter((record) => filter === "all" || record.doctor?.id === employeeId);
  const initialError = history.isError && !history.data;
  return (
    <Box component="aside" aria-label={t("conclusion.patientHistory.title")}
      sx={{ height: "100%", display: "flex", flexDirection: "column", minWidth: 0, bgcolor: "background.paper" }}>
      <Stack spacing={1.5} p={2} sx={{ flexShrink: 0, borderBottom: 1, borderColor: "divider" }}>
        <Button startIcon={<ArrowBackOutlined />} onClick={onClose} size="small" sx={{ alignSelf: "flex-start" }}>
          {t("conclusion.patientHistory.back")}
        </Button>
        <Typography variant="h6" fontWeight={600}>{t("conclusion.patientHistory.title")}</Typography>
        <ToggleButtonGroup exclusive fullWidth size="small" value={filter}
          onChange={(_event, value: "mine" | "all" | null) => { if (value) { setFilter(value); setExpandedId(null); } }}
          aria-label={t("conclusion.patientHistory.title")}>
          <ToggleButton value="mine" disabled={employeeId === null}>{t("conclusion.patientHistory.mine")}</ToggleButton>
          <ToggleButton value="all">{t("conclusion.patientHistory.all")}</ToggleButton>
        </ToggleButtonGroup>
        {history.data && <Typography variant="caption" color="text.secondary">
          {t(history.hasNextPage ? "conclusion.patientHistory.countMore" : "conclusion.patientHistory.count", { count: visible.length })}
        </Typography>}
      </Stack>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        {history.isPending && <Stack direction="row" alignItems="center" spacing={1.5} p={2} role="status">
          <CircularProgress size={22} /><Typography variant="body2">{t("conclusion.patientHistory.loading")}</Typography>
        </Stack>}
        {initialError && <Alert severity="error" sx={{ m: 2 }}
          action={<Button onClick={() => void history.refetch()}>{t("conclusion.patientHistory.retry")}</Button>}>
          {t("conclusion.patientHistory.listError")}
        </Alert>}
        {!history.isPending && !initialError && visible.length === 0 && (
          <Typography color="text.secondary" sx={{ p: 2 }}>
            {t(filter === "all" ? "conclusion.patientHistory.emptyAll" : history.hasNextPage
              ? "conclusion.patientHistory.emptyLoaded" : "conclusion.patientHistory.emptyMine")}
          </Typography>
        )}
        {visible.map((record) => {
          const expanded = expandedId === record.id;
          const diagnosis = formatDiagnoses(record.diagnosisData.map((item) => ({ ...item, diagnosisCode: item.diagnosisCode ?? item.diagnosis_code })));
          return <React.Fragment key={record.id}>
            <Button fullWidth color="inherit" aria-expanded={expanded} aria-controls={`past-conclusion-${record.id}`}
              onClick={() => setExpandedId(expanded ? null : record.id)}
              sx={{ textAlign: "left", justifyContent: "space-between", alignItems: "flex-start", p: 2,
                borderRadius: 0, bgcolor: expanded ? "action.selected" : undefined, textTransform: "none" }}>
              <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography variant="subtitle2">{dayjs(record.occurredAt).format("DD.MM.YYYY · HH:mm")}</Typography>
                  {record.status === "draft" && <Chip size="small" variant="outlined" label={t("conclusion.statusDraft")} />}
                </Stack>
                <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{record.serviceName}</Typography>
                <Typography variant="caption" color="text.secondary">{record.doctor?.fullName ?? t("conclusion.patientHistory.unknownDoctor")}</Typography>
                {diagnosis && <Typography variant="body2" color="text.secondary" noWrap>{diagnosis}</Typography>}
              </Stack>
              {expanded ? <ExpandLessOutlined sx={{ ml: 1 }} /> : <ExpandMoreOutlined sx={{ ml: 1 }} />}
            </Button>
            {expanded && <Box id={`past-conclusion-${record.id}`} sx={{ p: 2, pt: 1 }}>
              <HistoryDetail patientId={patientId} id={record.id} scope={scope} organizationId={organizationId} />
            </Box>}
            <Divider />
          </React.Fragment>;
        })}
        {history.isError && history.data && <Alert severity="error" sx={{ m: 2 }}>{t("conclusion.patientHistory.listError")}</Alert>}
        {history.hasNextPage && <Box p={2}>
          <Button fullWidth variant="outlined" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
            {t(history.isFetchingNextPage ? "conclusion.patientHistory.loadingMore" : "conclusion.patientHistory.more")}
          </Button>
        </Box>}
      </Box>
    </Box>
  );
};

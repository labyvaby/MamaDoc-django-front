import React from "react";
import {
  Alert,
  Divider,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import UploadFileOutlined from "@mui/icons-material/UploadFileOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import { getErrorMessage } from "../../../../api/client";
import { djangoQueryKeys } from "../../../../api/queryKeys";
import {
  getBlankTemplates,
  getEnrollmentDocuments,
  getRepresentatives,
  printEnrollmentDocument,
  uploadEnrollmentDocument,
  type DocumentKind,
} from "../../../../api/registry";
import { AppButton, CustomDatePicker } from "../../../../components/ui";
import type { ActiveScope } from "../../../../hooks/useActiveScope";
import { useCanChecker } from "../../../../hooks/useCan";
import { useT } from "../../../../i18n/VerticalProvider";
import { DOCUMENT_KINDS } from "../../registryConstants";
import { openPrintWindow } from "../documentPrint";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic";

interface DocumentsStepProps {
  scope: ActiveScope;
  enrollmentId: number;
  patientId: number;
  /** Бланки из настройки программы; пусто — все бланки организации. */
  templateIds: number[];
}

/** Печать бланков и загрузка подписанных документов к уже созданному подключению. */
export const DocumentsStep: React.FC<DocumentsStepProps> = ({ scope, enrollmentId, patientId, templateIds }) => {
  const { t } = useT("registry");
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { can } = useCanChecker();
  const ready = scope.isReady && scope.orgReady;
  const [kind, setKind] = React.useState<DocumentKind>("contract");
  const [title, setTitle] = React.useState(t("wizard.documents.kinds.contract"));
  const [signedOn, setSignedOn] = React.useState<Dayjs | null>(dayjs());
  const [signedById, setSignedById] = React.useState<number | "">("");
  const [file, setFile] = React.useState<File | null>(null);
  const [lastJobId, setLastJobId] = React.useState<number | null>(null);

  const templates = useQuery({
    queryKey: djangoQueryKeys.programs.blankTemplates(scope),
    queryFn: ({ signal }) => getBlankTemplates(scope, signal),
    enabled: ready && can("printforms.view"),
    retry: false,
  });
  const representatives = useQuery({
    queryKey: djangoQueryKeys.patients.representatives(patientId),
    queryFn: ({ signal }) => getRepresentatives(patientId, signal),
    enabled: ready,
  });
  const documentsKey = djangoQueryKeys.programs.documents(enrollmentId, scope);
  const documents = useQuery({
    queryKey: documentsKey,
    queryFn: ({ signal }) => getEnrollmentDocuments(scope, enrollmentId, signal),
    enabled: ready,
  });

  const visibleTemplates = (templates.data ?? []).filter(
    (tpl) => tpl.isActive && (!templateIds.length || templateIds.includes(tpl.id)),
  );

  const print = useMutation({
    mutationFn: (templateId: number) => printEnrollmentDocument(scope, enrollmentId, templateId),
    onSuccess: ({ jobId, render }, templateId) => {
      setLastJobId(jobId);
      const name = visibleTemplates.find((tpl) => tpl.id === templateId)?.name;
      openPrintWindow(render, name);
    },
  });
  const upload = useMutation({
    mutationFn: () =>
      uploadEnrollmentDocument(scope, enrollmentId, {
        kind,
        title: title.trim() || t(`wizard.documents.kinds.${kind}`),
        file: file as File,
        signedOn: signedOn ? signedOn.format("YYYY-MM-DD") : null,
        signedById: signedById === "" ? null : signedById,
        printJobId: lastJobId,
      }),
    onSuccess: () => {
      enqueueSnackbar(t("wizard.documents.uploaded"), { variant: "success" });
      setFile(null);
      void queryClient.invalidateQueries({ queryKey: documentsKey });
    },
  });
  const error = print.error ?? upload.error;

  return (
    <Stack gap={2}>
      <Alert severity="success">{t("wizard.documents.intro")}</Alert>
      {visibleTemplates.length ? (
        <Stack direction="row" gap={1} flexWrap="wrap">
          {visibleTemplates.map((tpl) => (
            <AppButton
              key={tpl.id}
              variant="outlined"
              size="small"
              startIcon={<PrintOutlined />}
              disabled={print.isPending}
              onClick={() => print.mutate(tpl.id)}
            >
              {t("wizard.documents.print")}: {tpl.name}
            </AppButton>
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {t("wizard.documents.noTemplates")}
        </Typography>
      )}
      <Divider />
      <Typography variant="subtitle2">{t("wizard.documents.upload")}</Typography>
      <Stack direction={{ xs: "column", sm: "row" }} gap={1}>
        <TextField
          select
          size="small"
          label={t("wizard.documents.kind")}
          value={kind}
          onChange={(e) => {
            const next = e.target.value as DocumentKind;
            setKind(next);
            setTitle(t(`wizard.documents.kinds.${next}`));
          }}
          sx={{ minWidth: 220 }}
        >
          {DOCUMENT_KINDS.map((key) => (
            <MenuItem key={key} value={key}>
              {t(`wizard.documents.kinds.${key}`)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          fullWidth
          label={t("wizard.documents.title")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} gap={1}>
        <CustomDatePicker
          label={t("wizard.documents.signedOn")}
          value={signedOn}
          onChange={(value) => setSignedOn(value)}
          disableFuture
          slotProps={{ textField: { size: "small" } }}
        />
        <TextField
          select
          size="small"
          label={t("wizard.documents.signedBy")}
          value={signedById}
          onChange={(e) => setSignedById(e.target.value === "" ? "" : Number(e.target.value))}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">—</MenuItem>
          {(representatives.data?.results ?? []).map((link) => (
            <MenuItem key={link.id} value={link.representative.id}>
              {link.representative.fullName} · {t(`relations.${link.relation}`)}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
        <AppButton component="label" variant="outlined" size="small" startIcon={<UploadFileOutlined />}>
          {t("wizard.documents.chooseFile")}
          <input
            hidden
            type="file"
            accept={ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </AppButton>
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0 }} noWrap>
          {file?.name ?? ""}
        </Typography>
        <AppButton
          variant="contained"
          size="small"
          disabled={!file || upload.isPending}
          onClick={() => upload.mutate()}
        >
          {t("wizard.documents.upload")}
        </AppButton>
      </Stack>
      {error && <Alert severity="error">{getErrorMessage(error)}</Alert>}
      {(documents.data?.results.length ?? 0) > 0 && (
        <Stack gap={0.5}>
          <Typography variant="subtitle2">{t("wizard.documents.list")}</Typography>
          {documents.data!.results.map((doc) => (
            <Link key={doc.id} href={doc.fileUrl} target="_blank" rel="noopener noreferrer" variant="body2">
              {doc.title}
              {doc.signedOn ? ` · ${dayjs(doc.signedOn).format("DD.MM.YYYY")}` : ""}
            </Link>
          ))}
        </Stack>
      )}
    </Stack>
  );
};

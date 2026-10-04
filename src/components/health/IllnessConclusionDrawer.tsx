import React from "react";
import { Alert, Box, CircularProgress, Drawer, IconButton, Stack, useMediaQuery, useTheme } from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { useQuery } from "@tanstack/react-query";

import { apiRequest, getErrorMessage } from "../../api/client";
import type { IllnessVisit } from "../../api/health";
import { getMedicalConclusion } from "../../api/medical";
import { DJANGO_DETAIL_STALE_TIME_MS } from "../../api/queryKeys";
import { useSheetBackClose } from "../../hooks/useSheetBackClose";
import OldConclusionDetailsCard from "../../pages/patients/components/OldConclusionDetailsCard";
import { fromDjango, type DjangoLegacyConclusion, type OldConclusion } from "../../pages/patients/useOldConclusions";
import { medicalConclusionToCard } from "./conclusionView";

/** Архивное заключение карточки: архив ищем только по ребёнку, без телефона (§1.2, п. 7). */
async function loadLegacy(patientId: number, legacyId: number, signal?: AbortSignal): Promise<OldConclusion> {
  const rows = await apiRequest<DjangoLegacyConclusion[]>(
    `/medical/legacy-conclusions/?patientId=${encodeURIComponent(String(patientId))}&limit=500`,
    { signal },
  );
  const row = (Array.isArray(rows) ? rows : []).find((item) => item.id === legacyId);
  if (!row) throw new Error("Архивное заключение не найдено");
  return fromDjango(row);
}

interface IllnessConclusionDrawerProps {
  patientId: number;
  visit: IllnessVisit | null;
  patientName?: string | null;
  birthDate?: string | null;
  onClose: () => void;
}

/**
 * «Заключение» у приёма в истории болезней — только просмотр (§4.1): новое
 * открывается по `GET /api/medical/conclusions/<id>/`, архивное — карточкой
 * архива, как в истории заключений карточки пациента.
 */
export const IllnessConclusionDrawer: React.FC<IllnessConclusionDrawerProps> = ({ patientId, visit, patientName, birthDate, onClose }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  useSheetBackClose(visit != null, onClose, isMobile);
  const liveId = visit?.conclusionId ?? null;
  const legacyId = liveId == null ? visit?.legacyConclusionId ?? null : null;
  const query = useQuery({
    queryKey: ["django", "health", "patient", patientId, "conclusion-view", liveId ?? `a${legacyId}`],
    queryFn: async ({ signal }) => {
      if (liveId != null && visit) return medicalConclusionToCard(await getMedicalConclusion(liveId), visit);
      return loadLegacy(patientId, legacyId as number, signal);
    },
    enabled: visit != null && (liveId != null || legacyId != null),
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    retry: false,
  });

  return (
    <Drawer
      anchor="right"
      open={visit != null}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: "100%", md: 560 }, maxWidth: "100%" } }}
    >
      {query.data ? (
        <OldConclusionDetailsCard item={query.data} patientFio={patientName ?? null} patientDob={birthDate ?? null} onClose={onClose} />
      ) : (
        <Stack sx={{ height: "100%" }}>
          <Stack direction="row" justifyContent="flex-end" sx={{ p: 1 }}>
            <IconButton onClick={onClose} aria-label="Закрыть">
              <CloseOutlined />
            </IconButton>
          </Stack>
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", p: 3 }}>
            {query.error ? (
              <Alert severity="error">{getErrorMessage(query.error, "Не удалось открыть заключение")}</Alert>
            ) : (
              <CircularProgress size={28} />
            )}
          </Box>
        </Stack>
      )}
    </Drawer>
  );
};

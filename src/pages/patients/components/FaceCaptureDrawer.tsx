import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import CameraAltOutlined from "@mui/icons-material/CameraAltOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import LinkOutlined from "@mui/icons-material/LinkOutlined";
import ReplayOutlined from "@mui/icons-material/ReplayOutlined";
import {
  assignFaceCapture,
  forceFaceCapture,
  getFaceCaptures,
  syncFaceCapture,
  type DjangoFaceCapture,
} from "../../../api/patients";
import { useT } from "../../../i18n/VerticalProvider";

type Props = {
  open: boolean;
  onClose: () => void;
  patientId: number | null;
  patientName: string;
  canForceCapture?: boolean;
};

const FaceCaptureDrawer: React.FC<Props> = ({ open, onClose, patientId, patientName, canForceCapture = false }) => {
  const { t } = useT("patients");
  const [captures, setCaptures] = React.useState<DjangoFaceCapture[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [forcing, setForcing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCaptures(await getFaceCaptures());
    } catch {
      setError(t("face.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handleForceCapture = async () => {
    setForcing(true);
    setError(null);
    try {
      await forceFaceCapture();
      setTimeout(() => void load(), 1200);
    } catch {
      setError(t("face.errors.force"));
    } finally {
      setForcing(false);
    }
  };

  const handleAssign = async (capture: DjangoFaceCapture) => {
    if (!patientId) return;
    setBusyId(capture.id);
    setError(null);
    try {
      const updated = await assignFaceCapture(capture.id, patientId);
      setCaptures((prev) => prev.map((item) => item.id === updated.id ? updated : item));
    } catch {
      setError(t("face.errors.assign"));
    } finally {
      setBusyId(null);
    }
  };

  const handleSync = async (capture: DjangoFaceCapture) => {
    setBusyId(capture.id);
    setError(null);
    try {
      const updated = await syncFaceCapture(capture.id);
      setCaptures((prev) => prev.map((item) => item.id === updated.id ? updated : item));
    } catch {
      setError(t("face.errors.sync"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: "100%", sm: 500 } } }}>
      <Stack sx={{ height: "100%" }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <CameraAltOutlined color="primary" />
            <Box>
              <Typography variant="h6">{t("face.title")}</Typography>
              <Typography variant="caption" color="text.secondary">
                {t("face.subtitle", { name: patientName || "—" })}
              </Typography>
            </Box>
          </Stack>
          <IconButton onClick={onClose}><CloseOutlined /></IconButton>
        </Stack>
        <Divider />
        <Stack direction="row" spacing={1} sx={{ p: 2 }}>
          {canForceCapture && (
            <Button variant="contained" startIcon={<CameraAltOutlined />} onClick={() => void handleForceCapture()} disabled={forcing}>
              {forcing ? t("face.forcing") : t("face.forceCapture")}
            </Button>
          )}
          <Button variant="outlined" startIcon={<RefreshOutlined />} onClick={() => void load()} disabled={loading}>{t("face.refresh")}</Button>
        </Stack>
        {error && <Alert severity="error" sx={{ mx: 2, mb: 1 }}>{error}</Alert>}
        <Box sx={{ flex: 1, overflowY: "auto", px: 2, pb: 2 }}>
          {loading ? (
            <Stack alignItems="center" sx={{ py: 5 }}><CircularProgress /></Stack>
          ) : captures.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 5, textAlign: "center" }}>
              {t("face.empty")}
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              {captures.map((capture) => {
                const busy = busyId === capture.id;
                return (
                  <Stack key={capture.id} direction="row" spacing={1.5} sx={{ p: 1.25, border: 1, borderColor: "divider", borderRadius: 1 }}>
                    {capture.photoUrl ? (
                      <Box component="img" src={capture.photoUrl} alt={`Face ${capture.faceId}`} sx={{ width: 84, height: 84, borderRadius: 1, objectFit: "cover", bgcolor: "action.hover" }} />
                    ) : <Box sx={{ width: 84, height: 84, borderRadius: 1, bgcolor: "action.hover" }} />}
                    <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="subtitle2">{t("face.faceNumber", { id: capture.faceId })}</Typography>
                      <Typography variant="caption" color={capture.status === "sync_failed" ? "error.main" : "text.secondary"}>
                        {t(`face.status.${capture.status}`, { defaultValue: capture.status })}
                      </Typography>
                      {capture.patient && <Typography variant="body2" noWrap>{capture.patient.fullName}</Typography>}
                      {capture.syncError && <Typography variant="caption" color="error.main">{capture.syncError}</Typography>}
                      <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                        {capture.status === "pending" && (
                          <Button size="small" startIcon={<LinkOutlined />} onClick={() => void handleAssign(capture)} disabled={busy || !patientId}>
                            {busy ? t("face.assigning") : t("face.assign")}
                          </Button>
                        )}
                        {capture.status === "sync_failed" && capture.patient && (
                          <Button size="small" startIcon={<ReplayOutlined />} onClick={() => void handleSync(capture)} disabled={busy}>
                            {t("face.retry")}
                          </Button>
                        )}
                      </Stack>
                    </Stack>
                  </Stack>
                );
              })}
            </Stack>
          )}
        </Box>
      </Stack>
    </Drawer>
  );
};

export default FaceCaptureDrawer;

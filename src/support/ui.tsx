import React from "react";
import { Box, Dialog, IconButton, Skeleton, Typography, useMediaQuery, useTheme } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import BugReportOutlined from "@mui/icons-material/BugReportOutlined";
import CloseRounded from "@mui/icons-material/CloseRounded";
import HelpOutlineRounded from "@mui/icons-material/HelpOutlineRounded";
import ImageNotSupportedOutlined from "@mui/icons-material/ImageNotSupportedOutlined";
import LightbulbOutlined from "@mui/icons-material/LightbulbOutlined";
import ZoomInOutlined from "@mui/icons-material/ZoomInOutlined";
import { useQuery } from "@tanstack/react-query";
import { animate, motion, useReducedMotion } from "framer-motion";
import type { SvgIconComponent } from "@mui/icons-material";

import { getSupportAttachment, type TicketCategory, type TicketImpact, type TicketStatus } from "../api/support";
import { djangoQueryKeys } from "../api/queryKeys";
import {
  CATEGORY_LABEL,
  CATEGORY_TONE,
  IMPACT_LABEL,
  IMPACT_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  toneColors,
  type SupportTone,
} from "./meta";

export const CATEGORY_ICON: Record<TicketCategory, SvgIconComponent> = {
  bug: BugReportOutlined,
  idea: LightbulbOutlined,
  question: HelpOutlineRounded,
};

/** Круглая «пузырь»-иконка категории: мягкая заливка тона и тонкая грань. */
export const CategoryBubble: React.FC<{ category: TicketCategory; size?: number }> = ({ category, size = 40 }) => {
  const Icon = CATEGORY_ICON[category];
  return (
    <Box
      aria-label={CATEGORY_LABEL[category]}
      sx={(t) => {
        const c = toneColors(t, CATEGORY_TONE[category]);
        return {
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: "30%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: c.text,
          background: `linear-gradient(135deg, ${c.soft}, ${c.softer})`,
          border: `1px solid ${c.border}`,
        };
      }}
    >
      <Icon sx={{ fontSize: size * 0.52 }} />
    </Box>
  );
};

const pillBase = (t: Theme, tone: SupportTone) => {
  const c = toneColors(t, tone);
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 0.75,
    height: 24,
    px: 1.1,
    borderRadius: "8px",
    fontSize: "0.75rem",
    fontWeight: 600,
    lineHeight: 1,
    whiteSpace: "nowrap" as const,
    color: c.text,
    bgcolor: c.soft,
    border: `1px solid ${c.border}`,
  };
};

export const StatusPill: React.FC<{ status: TicketStatus; live?: boolean }> = ({ status, live = true }) => {
  const reduceMotion = useReducedMotion();
  const pulse = live && !reduceMotion && (status === "in_progress" || status === "needs_info" || status === "new");
  return (
    <Box component="span" sx={(t) => pillBase(t, STATUS_TONE[status])}>
      <Box sx={{ position: "relative", width: 7, height: 7 }}>
        <Box
          sx={(t) => ({
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            bgcolor: toneColors(t, STATUS_TONE[status]).main,
          })}
        />
        {pulse && (
          <motion.span
            aria-hidden
            initial={{ opacity: 0.7, scale: 1 }}
            animate={{ opacity: 0, scale: 2.8 }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
            style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "currentColor" }}
          />
        )}
      </Box>
      {STATUS_LABEL[status]}
    </Box>
  );
};

export const ImpactPill: React.FC<{ impact: TicketImpact }> = ({ impact }) => (
  <Box component="span" sx={(t) => pillBase(t, IMPACT_TONE[impact])}>
    {IMPACT_LABEL[impact]}
  </Box>
);

/** Число, которое «набегает» от прежнего значения до нового (счётчики-плитки). */
export const AnimatedNumber: React.FC<{ value: number }> = ({ value }) => {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = React.useState(value);
  const fromRef = React.useRef(value);
  React.useEffect(() => {
    if (reduceMotion) {
      setShown(value);
      fromRef.current = value;
      return;
    }
    const controls = animate(fromRef.current, value, {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setShown(Math.round(v)),
    });
    fromRef.current = value;
    return () => controls.stop();
  }, [value, reduceMotion]);
  return <>{shown}</>;
};

/** Полноэкранный просмотр снимка; щелчок увеличивает до реального размера. */
export const ImageLightbox: React.FC<{ src: string | null; open: boolean; onClose: () => void }> = ({
  src,
  open,
  onClose,
}) => {
  const [zoomed, setZoomed] = React.useState(false);
  React.useEffect(() => {
    if (open) setZoomed(false);
  }, [open]);
  return (
    <Dialog
      open={open && Boolean(src)}
      onClose={onClose}
      maxWidth={false}
      slotProps={{
        paper: {
          sx: { bgcolor: "transparent", boxShadow: "none", backgroundImage: "none", m: 1, maxWidth: "98vw" },
        },
        backdrop: { sx: { backdropFilter: "blur(6px)", bgcolor: alpha("#000", 0.7) } },
      }}
    >
      <Box sx={{ position: "relative", maxHeight: "92vh", overflow: "auto", borderRadius: 2 }}>
        <IconButton
          onClick={onClose}
          aria-label="Закрыть"
          sx={{
            position: "fixed",
            top: 12,
            right: 12,
            zIndex: 2,
            color: "#fff",
            bgcolor: alpha("#000", 0.5),
            "&:hover": { bgcolor: alpha("#000", 0.7) },
          }}
        >
          <CloseRounded />
        </IconButton>
        {src && (
          <Box
            component="img"
            src={src}
            alt="Снимок экрана"
            onClick={() => setZoomed((z) => !z)}
            sx={{
              display: "block",
              cursor: zoomed ? "zoom-out" : "zoom-in",
              maxWidth: zoomed ? "none" : "96vw",
              maxHeight: zoomed ? "none" : "88vh",
              width: zoomed ? "auto" : "auto",
              borderRadius: 2,
              boxShadow: 24,
              bgcolor: "#fff",
            }}
          />
        )}
      </Box>
    </Dialog>
  );
};

/** Миниатюра вложения с ленивой загрузкой: содержимое тянется, когда блок на экране. */
export const AttachmentThumb: React.FC<{
  attachmentId: number;
  label: string;
  onOpen: (dataUrl: string) => void;
}> = ({ attachmentId, label, onOpen }) => {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("md"));
  const query = useQuery({
    queryKey: djangoQueryKeys.support.attachment(attachmentId),
    queryFn: ({ signal }) => getSupportAttachment(attachmentId, signal),
    staleTime: 5 * 60_000,
  });
  const dataUrl = query.data?.dataUrl;
  const width = phone ? "100%" : 220;

  if (query.isLoading) {
    return <Skeleton variant="rounded" width={width} height={130} sx={{ borderRadius: 2 }} />;
  }
  if (!dataUrl) {
    return (
      <Box
        sx={{
          width,
          height: 96,
          borderRadius: 2,
          border: 1,
          borderStyle: "dashed",
          borderColor: "divider",
          color: "text.disabled",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0.5,
        }}
      >
        <ImageNotSupportedOutlined fontSize="small" />
        <Typography variant="caption">Снимок удалён по сроку хранения</Typography>
      </Box>
    );
  }
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onOpen(dataUrl)}
      aria-label={`Открыть: ${label}`}
      sx={{
        position: "relative",
        width,
        p: 0,
        border: 1,
        borderColor: "divider",
        borderRadius: 2,
        overflow: "hidden",
        cursor: "zoom-in",
        bgcolor: "background.paper",
        display: "block",
        "&:hover .zoom": { opacity: 1 },
        "&:hover img": { transform: "scale(1.04)" },
      }}
    >
      <Box
        component="img"
        src={dataUrl}
        alt={label}
        sx={{ display: "block", width: "100%", transition: "transform .35s ease" }}
      />
      <Box
        className="zoom"
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: alpha("#000", 0.35),
          color: "#fff",
          opacity: 0,
          transition: "opacity .2s ease",
        }}
      >
        <ZoomInOutlined />
      </Box>
    </Box>
  );
};

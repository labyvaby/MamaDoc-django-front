import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertTitle, Box, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

import { getActiveAnnouncements, ActiveAnnouncement } from "../../api/announcements";
import { djangoQueryKeys, DJANGO_POLL_INTERVAL_MS } from "../../api/queryKeys";
import { IS_DJANGO_BACKEND } from "../../config/backend";
import { usePermissions } from "../../hooks/usePermissions";

function getDismissedMap(storageKey: string): Record<number, string> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function setDismissedMap(storageKey: string, map: Record<number, string>): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    // Safe fallback for quota or disabled storage
  }
}

export const AnnouncementBanner: React.FC = () => {
  const { activeOrganization } = usePermissions();
  const orgId = activeOrganization?.id ?? "global";
  const storageKey = `dismissedAnnouncements:${orgId}`;

  const [dismissed, setDismissed] = useState<Record<number, string>>(() =>
    getDismissedMap(storageKey)
  );

  useEffect(() => {
    setDismissed(getDismissedMap(storageKey));
  }, [storageKey]);

  const { data: announcements = [] } = useQuery<ActiveAnnouncement[]>({
    queryKey: djangoQueryKeys.announcements.active,
    queryFn: getActiveAnnouncements,
    enabled: IS_DJANGO_BACKEND,
    refetchInterval: DJANGO_POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  const activeAnnouncement = announcements.find((item) => {
    const dismissedAt = dismissed[item.id];
    return !dismissedAt || dismissedAt !== item.updatedAt;
  });

  if (!IS_DJANGO_BACKEND || !activeAnnouncement) {
    return null;
  }

  const handleDismiss = () => {
    const nextMap = {
      ...dismissed,
      [activeAnnouncement.id]: activeAnnouncement.updatedAt,
    };
    setDismissed(nextMap);
    setDismissedMap(storageKey, nextMap);
  };

  const getSeverity = (severity: string): "info" | "warning" | "error" => {
    switch (severity) {
      case "WARNING":
        return "warning";
      case "ERROR":
        return "error";
      default:
        return "info";
    }
  };

  return (
    <Box sx={{ width: "100%", px: 2, pt: 1.5, pb: 0.5 }}>
      <Alert
        severity={getSeverity(activeAnnouncement.severity)}
        variant="filled"
        action={
          <IconButton
            aria-label="close"
            color="inherit"
            size="small"
            onClick={handleDismiss}
          >
            <CloseIcon fontSize="inherit" />
          </IconButton>
        }
        sx={{
          borderRadius: 2,
          boxShadow: 2,
          "& .MuiAlert-message": {
            overflow: "hidden",
          },
        }}
      >
        {activeAnnouncement.title && (
          <AlertTitle sx={{ fontWeight: 700, mb: 0.5 }}>
            {activeAnnouncement.title}
          </AlertTitle>
        )}
        <Box sx={{ whiteSpace: "pre-line" }}>{activeAnnouncement.message}</Box>
      </Alert>
    </Box>
  );
};

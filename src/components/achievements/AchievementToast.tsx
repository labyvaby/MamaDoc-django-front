import React from "react";
import { Box, IconButton, Snackbar, Stack, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import {
  getAchievementDefinitions,
  getUnseenAchievements,
  markAchievementsSeen,
} from "../../api/achievements";
import {
  djangoQueryKeys,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../api/queryKeys";
import { IS_DJANGO_BACKEND } from "../../config/backend";
import { useCanChecker } from "../../hooks/useCan";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { AchievementBadge } from "./AchievementBadge";
import { tierTone } from "./meta";

/**
 * Поздравление с новыми достижениями: при заходе в приложение запрашивает
 * непросмотренные (seen_at=null), показывает тост и помечает их просмотренными.
 * Монтируется один раз в layout — realtime не нужен, задержка до следующего
 * захода приемлема (ТЗ §5.4).
 */
export const AchievementToast: React.FC = () => {
  const queryClient = useQueryClient();
  const { can } = useCanChecker();
  const orgId = useApiOrgId();
  const [dismissed, setDismissed] = React.useState(false);

  const unseenQuery = useQuery({
    queryKey: djangoQueryKeys.achievements.unseen,
    queryFn: ({ signal }) => getUnseenAchievements(orgId, signal),
    enabled: IS_DJANGO_BACKEND && can("achievements.view"),
    staleTime: Infinity,
  });
  const definitionsQuery = useQuery({
    queryKey: djangoQueryKeys.achievements.definitions,
    queryFn: ({ signal }) => getAchievementDefinitions(signal),
    enabled: IS_DJANGO_BACKEND && (unseenQuery.data?.length ?? 0) > 0,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const markSeen = useMutation({
    mutationFn: () => markAchievementsSeen(undefined, orgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.achievements.unseen });
    },
  });

  const unseen = unseenQuery.data ?? [];
  const first = unseen[0];
  const definition = first
    ? definitionsQuery.data?.find((d) => d.code === first.code)
    : undefined;

  const open = !dismissed && Boolean(first && definition);

  const handleClose = () => {
    setDismissed(true);
    markSeen.mutate();
  };

  if (!first || !definition) return null;

  return (
    <Snackbar
      open={open}
      autoHideDuration={8000}
      onClose={(_e, reason) => {
        if (reason === "clickaway") return;
        handleClose();
      }}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        sx={{
          px: 2,
          py: 1.5,
          borderRadius: "12px",
          border: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          maxWidth: 420,
        }}
      >
        <AchievementBadge
          code={first.code}
          tone={tierTone(first.level, definition.tiers.length)}
          size={44}
        />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={700}>
            Новое достижение: «{first.tierName}»
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {definition.title}
            {unseen.length > 1 && ` · и ещё ${unseen.length - 1}`}
          </Typography>
        </Box>
        <IconButton size="small" onClick={handleClose} aria-label="Закрыть">
          <CloseOutlined fontSize="small" />
        </IconButton>
      </Stack>
    </Snackbar>
  );
};

export default AchievementToast;

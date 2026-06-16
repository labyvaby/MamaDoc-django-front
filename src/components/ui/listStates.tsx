import React from "react";
import { Box, Typography, Stack, Skeleton, alpha } from "@mui/material";

/**
 * Общие состояния для карточных списков (Склад, Товары, Продажи и т.п.):
 * скелетон загрузки и пустое состояние с иконкой. Держим визуал единым,
 * чтобы списки во всех разделах выглядели одинаково.
 */

/** Скелетон одной карточки-строки: аватар + две строки текста + правый блок. */
const RowSkeleton: React.FC = () => (
    <Box
        sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            p: 1.25,
            borderRadius: 1,
            border: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
        }}
    >
        <Skeleton variant="rounded" width={48} height={48} sx={{ borderRadius: 1, flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
            <Skeleton variant="text" width="70%" height={20} />
            <Skeleton variant="rounded" width={84} height={18} sx={{ mt: 0.5, borderRadius: 1 }} />
        </Box>
        <Skeleton variant="rounded" width={52} height={36} sx={{ borderRadius: 1, flexShrink: 0 }} />
    </Box>
);

export const ListLoadingSkeleton: React.FC<{ rows?: number }> = ({ rows = 6 }) => (
    <Stack spacing={1} sx={{ p: 1.5 }}>
        {Array.from({ length: rows }).map((_, i) => (
            <RowSkeleton key={i} />
        ))}
    </Stack>
);

export interface ListEmptyStateProps {
    icon: React.ReactNode;
    title: string;
    description?: string;
    action?: React.ReactNode;
}

export const ListEmptyState: React.FC<ListEmptyStateProps> = ({
    icon,
    title,
    description,
    action,
}) => (
    <Box
        sx={{
            width: "100%",
            height: "100%",
            minHeight: 220,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: 1.5,
            px: 3,
            py: 5,
        }}
    >
        <Box
            sx={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "primary.main",
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                "& .MuiSvgIcon-root": { fontSize: 30 },
            }}
        >
            {icon}
        </Box>
        <Stack
            spacing={0.5}
            alignItems="center"
            sx={{
                // Резервируем одинаковую высоту под текст, чтобы иконки в соседних
                // панелях вставали на одну линию независимо от числа строк описания
                // (заголовок + до 3 строк описания).
                minHeight: 96,
            }}
        >
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {title}
            </Typography>
            {description && (
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 260 }}>
                    {description}
                </Typography>
            )}
        </Stack>
        {action && <Box sx={{ mt: 0.5, pointerEvents: "auto" }}>{action}</Box>}
    </Box>
);

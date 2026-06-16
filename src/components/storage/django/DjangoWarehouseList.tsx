import React from "react";
import {
    Box,
    Typography,
    Paper,
    Stack,
    IconButton,
    Avatar,
    Chip,
    Tooltip,
    ButtonBase,
    Button,
    alpha,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import StoreIcon from "@mui/icons-material/Store";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import { DjangoWarehouse } from "../../../api/warehouse";
import { ListLoadingSkeleton, ListEmptyState } from "../../ui";

interface DjangoWarehouseListProps {
    warehouses: DjangoWarehouse[];
    selectedId: number | null;
    onSelect: (id: number) => void;
    onAdd: () => void;
    onEdit: (warehouse: DjangoWarehouse) => void;
    onUnlink?: (warehouse: DjangoWarehouse) => void;
    loading: boolean;
    canManage?: boolean;
}

export const DjangoWarehouseList: React.FC<DjangoWarehouseListProps> = ({
    warehouses,
    selectedId,
    onSelect,
    onAdd,
    onEdit,
    onUnlink,
    loading,
    canManage = true,
}) => {
    return (
        <Paper
            elevation={0}
            variant="outlined"
            sx={{
                flex: 1,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                height: "100%",
                bgcolor: "background.paper",
                position: "relative",
            }}
        >
            <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}
            >
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Склады ({warehouses.length})
                </Typography>
                {canManage && (
                    <Tooltip title="Добавить склад">
                        <IconButton size="small" onClick={onAdd} color="primary">
                            <AddIcon />
                        </IconButton>
                    </Tooltip>
                )}
            </Stack>

            {!loading && warehouses.length === 0 && (
                <Box sx={{ position: "absolute", inset: 0, display: "flex", pointerEvents: "none" }}>
                    <ListEmptyState
                        icon={<StorefrontOutlinedIcon />}
                        title="Складов пока нет"
                        description="Создайте первый склад, чтобы вести по нему остатки и движения товара."
                        action={
                            canManage ? (
                                <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={onAdd}>
                                    Создать склад
                                </Button>
                            ) : undefined
                        }
                    />
                </Box>
            )}

            <Box sx={{ flex: 1, overflowY: "auto" }}>
                {loading ? (
                    <ListLoadingSkeleton rows={4} />
                ) : warehouses.length === 0 ? null : (
                    <Stack spacing={1} sx={{ p: 1.5 }}>
                        {warehouses.map((w) => {
                            const isSelected = selectedId === w.id;
                            return (
                                <ButtonBase
                                    key={w.id}
                                    onClick={() => onSelect(w.id)}
                                    focusRipple
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1.5,
                                        width: "100%",
                                        textAlign: "left",
                                        p: 1.25,
                                        borderRadius: 1,
                                        border: 1,
                                        borderColor: isSelected ? "primary.main" : "divider",
                                        bgcolor: (theme) =>
                                            isSelected
                                                ? alpha(theme.palette.primary.main, 0.08)
                                                : "background.paper",
                                        transition:
                                            "border-color .15s ease, box-shadow .15s ease, transform .1s ease, background-color .15s ease",
                                        "&:hover": {
                                            borderColor: "primary.main",
                                            boxShadow: (theme) =>
                                                `0 4px 16px ${alpha(theme.palette.primary.main, 0.12)}`,
                                        },
                                        "&:active": { transform: "translateY(0.5px)" },
                                    }}
                                >
                                    <Avatar
                                        variant="rounded"
                                        sx={{
                                            flexShrink: 0,
                                            width: 48,
                                            height: 48,
                                            borderRadius: 1,
                                            bgcolor: (theme) =>
                                                w.isPrimary
                                                    ? theme.palette.primary.main
                                                    : alpha(theme.palette.primary.main, 0.1),
                                            color: w.isPrimary ? "common.white" : "primary.main",
                                        }}
                                    >
                                        <StoreIcon fontSize="small" />
                                    </Avatar>

                                    <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                            {w.name}
                                        </Typography>
                                        {w.address && (
                                            <Typography
                                                variant="caption"
                                                color="text.secondary"
                                                display="block"
                                                noWrap
                                            >
                                                {w.address}
                                            </Typography>
                                        )}
                                        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                                            {w.isPrimary && !w.isLinked && (
                                                <Chip
                                                    size="small"
                                                    label="Основной"
                                                    color="primary"
                                                    sx={{
                                                        height: 20,
                                                        fontSize: "0.7rem",
                                                        fontWeight: 500,
                                                        "& .MuiChip-label": { px: 0.75 },
                                                    }}
                                                />
                                            )}
                                            {w.isLinked && (
                                                <Chip
                                                    size="small"
                                                    variant="outlined"
                                                    color="info"
                                                    label={`Филиал: ${w.branchName}`}
                                                    sx={{
                                                        height: 20,
                                                        fontSize: "0.7rem",
                                                        fontWeight: 500,
                                                        "& .MuiChip-label": { px: 0.75 },
                                                    }}
                                                />
                                            )}
                                        </Stack>
                                    </Box>

                                    {canManage &&
                                        (w.isLinked
                                            ? onUnlink && (
                                                  <Tooltip title="Отключить склад от филиала">
                                                      <IconButton
                                                          size="small"
                                                          component="span"
                                                          onClick={(e) => {
                                                              e.stopPropagation();
                                                              onUnlink(w);
                                                          }}
                                                          sx={{
                                                              flexShrink: 0,
                                                              color: "text.secondary",
                                                              "&:hover": { color: "error.main" },
                                                          }}
                                                      >
                                                          <LinkOffIcon fontSize="small" />
                                                      </IconButton>
                                                  </Tooltip>
                                              )
                                            : (
                                                <Tooltip title="Редактировать склад">
                                                    <IconButton
                                                        size="small"
                                                        component="span"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onEdit(w);
                                                        }}
                                                        sx={{
                                                            flexShrink: 0,
                                                            color: "text.secondary",
                                                            "&:hover": { color: "primary.main" },
                                                        }}
                                                    >
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            ))}
                                </ButtonBase>
                            );
                        })}
                    </Stack>
                )}
            </Box>
        </Paper>
    );
};

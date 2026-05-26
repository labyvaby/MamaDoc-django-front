import React from "react";
import {
    Box,
    Typography,
    Paper,
    List,
    ListItemButton,
    Stack,
    IconButton,
    CircularProgress,
    Avatar,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import StoreIcon from "@mui/icons-material/Store";
import { Warehouse } from "../../services/warehouse";

interface WarehouseListProps {
    warehouses: Warehouse[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onAdd: () => void;
    onEdit: (warehouse: Warehouse) => void;
    loading: boolean;
}

export const WarehouseList: React.FC<WarehouseListProps> = ({
    warehouses,
    selectedId,
    onSelect,
    onAdd,
    onEdit,
    loading
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
            }}
        >
            <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}
            >
                <Typography variant="subtitle1" fontWeight={600}>
                    Склады
                </Typography>
                <IconButton size="small" onClick={onAdd} color="primary">
                    <AddIcon />
                </IconButton>
            </Stack>

            <Box sx={{ flex: 1, overflowY: "auto" }}>
                {loading ? (
                    <Box sx={{ p: 4, textAlign: "center" }}>
                        <CircularProgress size={24} />
                    </Box>
                ) : warehouses.length === 0 ? (
                    <Box sx={{ p: 4, textAlign: "center" }}>
                        <Typography variant="body2" color="text.secondary">
                            Нет складов
                        </Typography>
                    </Box>
                ) : (
                    <List sx={{ py: 0.5 }}>
                        {warehouses.map((w) => (
                            <ListItemButton
                                key={w.id}
                                selected={selectedId === w.id}
                                onClick={() => onSelect(w.id)}
                                sx={{
                                    py: 2,
                                    px: 2,
                                    borderBottom: 1,
                                    borderColor: "divider",
                                    flexDirection: "column",
                                    alignItems: "flex-start",
                                    "&.Mui-selected": { bgcolor: "action.selected" },
                                }}
                            >
                                <Stack direction="row" alignItems="center" spacing={2} width="100%">
                                    <Avatar
                                        variant="rounded"
                                        sx={{
                                            bgcolor: w.is_primary ? "primary.main" : "action.selected",
                                            color: w.is_primary ? "common.white" : "text.secondary",
                                        }}
                                    >
                                        <StoreIcon />
                                    </Avatar>
                                    <Box flex={1}>
                                        <Typography variant="subtitle2" fontWeight={600}>
                                            {w.name}
                                        </Typography>
                                        {w.address && (
                                            <Typography variant="caption" color="text.secondary" display="block">
                                                {w.address}
                                            </Typography>
                                        )}
                                        {w.is_primary && (
                                            <Typography variant="caption" color="primary" fontWeight={500}>
                                                Основной
                                            </Typography>
                                        )}
                                    </Box>
                                    <IconButton
                                        size="small"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onEdit(w);
                                        }}
                                        sx={{ opacity: selectedId === w.id ? 1 : 0.5 }}
                                    >
                                        <EditIcon fontSize="small" />
                                    </IconButton>
                                </Stack>
                            </ListItemButton>
                        ))}
                    </List>
                )}
            </Box>
        </Paper>
    );
};

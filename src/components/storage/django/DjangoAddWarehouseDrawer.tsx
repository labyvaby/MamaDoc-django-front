import React, { useEffect, useState } from "react";
import {
    Box,
    Button,
    Stack,
    TextField,
    Typography,
    Drawer,
    IconButton,
    Divider,
    FormControlLabel,
    Switch,
    ToggleButton,
    ToggleButtonGroup,
    List,
    ListItemButton,
    Avatar,
    CircularProgress,
    Autocomplete,
    Chip,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import StoreIcon from "@mui/icons-material/Store";
import AddBusinessOutlined from "@mui/icons-material/AddBusinessOutlined";
import { useNotification } from "@refinedev/core";
import {
    DjangoWarehouse,
    createWarehouse,
    updateWarehouse,
    getLinkableWarehouses,
    linkWarehouse,
} from "../../../api/warehouse";
import { getBranches, DjangoBranch } from "../../../api/organization";
import { ApiError } from "../../../api/client";

type DrawerMode = "create" | "link";

interface DjangoAddWarehouseDrawerProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    editItem: DjangoWarehouse | null;
    /** Активный филиал; null → org-wide режим (нужен выбор филиала). */
    activeBranchId: number | null;
}

export const DjangoAddWarehouseDrawer: React.FC<DjangoAddWarehouseDrawerProps> = ({
    open,
    onClose,
    onSuccess,
    editItem,
    activeBranchId,
}) => {
    const { open: notify } = useNotification();
    const [mode, setMode] = useState<DrawerMode>("create");
    const [name, setName] = useState("");
    const [address, setAddress] = useState("");
    const [isPrimary, setIsPrimary] = useState(false);
    const [loading, setLoading] = useState(false);
    const [touched, setTouched] = useState(false);

    // org-wide режим: выбор филиала для нового склада
    const [branches, setBranches] = useState<DjangoBranch[]>([]);
    const [selectedBranch, setSelectedBranch] = useState<DjangoBranch | null>(null);

    // Подключение существующего склада другого филиала
    const [linkable, setLinkable] = useState<DjangoWarehouse[]>([]);
    const [loadingLinkable, setLoadingLinkable] = useState(false);
    const [selectedLinkId, setSelectedLinkId] = useState<number | null>(null);

    const isOrgWide = activeBranchId === null;

    useEffect(() => {
        if (open) {
            setMode("create");
            setName(editItem?.name || "");
            setAddress(editItem?.address || "");
            setIsPrimary(editItem?.isPrimary || false);
            setLoading(false);
            setTouched(false);
            setSelectedLinkId(null);
            setSelectedBranch(null);
        }
    }, [open, editItem]);

    // Список филиалов нужен только в org-wide режиме для создания.
    useEffect(() => {
        if (open && isOrgWide && !editItem) {
            getBranches()
                .then((rows) => setBranches(rows.filter((b) => b.isActive)))
                .catch((e) => console.error("Failed to load branches", e));
        }
    }, [open, isOrgWide, editItem]);

    // Доступные для подключения склады (только в контексте филиала).
    useEffect(() => {
        if (open && mode === "link" && !editItem) {
            setLoadingLinkable(true);
            getLinkableWarehouses()
                .then(setLinkable)
                .catch((e) => {
                    console.error(e);
                    notify?.({ type: "error", message: "Ошибка загрузки складов" });
                })
                .finally(() => setLoadingLinkable(false));
        }
    }, [open, mode, editItem, notify]);

    const handleSubmitCreate = async () => {
        setTouched(true);
        if (!name.trim() || !address.trim()) return;
        if (isOrgWide && !editItem && !selectedBranch) return;

        try {
            setLoading(true);
            if (editItem) {
                await updateWarehouse(editItem.id, { name, address, isPrimary });
                notify?.({ type: "success", message: "Склад обновлен" });
            } else {
                await createWarehouse({
                    name,
                    address,
                    isPrimary,
                    branchId: isOrgWide ? selectedBranch?.id : undefined,
                });
                notify?.({ type: "success", message: "Склад создан" });
            }
            onSuccess();
            onClose();
        } catch (e) {
            console.error(e);
            const message = e instanceof ApiError ? e.message : "Ошибка сохранения";
            notify?.({ type: "error", message });
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitLink = async () => {
        if (selectedLinkId === null) return;
        try {
            setLoading(true);
            await linkWarehouse(selectedLinkId);
            notify?.({ type: "success", message: "Склад подключен — его товары теперь доступны" });
            onSuccess();
            onClose();
        } catch (e) {
            console.error(e);
            const message = e instanceof ApiError ? e.message : "Ошибка подключения";
            notify?.({ type: "error", message });
        } finally {
            setLoading(false);
        }
    };

    const createDisabled =
        !name.trim() || !address.trim() || loading || (isOrgWide && !editItem && !selectedBranch);

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={loading ? undefined : onClose}
            PaperProps={{ sx: { width: { xs: 320, sm: 400 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
        >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5 }}>
                <Typography variant="h6">
                    {editItem ? "Редактировать склад" : mode === "link" ? "Подключить склад" : "Новый склад"}
                </Typography>
                <IconButton onClick={loading ? undefined : onClose}><CloseOutlined /></IconButton>
            </Box>
            <Divider />

            {/* Режим: новый / подключить существующий (только при создании в контексте филиала) */}
            {!editItem && !isOrgWide && (
                <Box sx={{ px: 2, pt: 2 }}>
                    <ToggleButtonGroup
                        value={mode}
                        exclusive
                        fullWidth
                        size="small"
                        onChange={(_, v: DrawerMode | null) => v && setMode(v)}
                    >
                        <ToggleButton value="create">
                            <StoreIcon sx={{ fontSize: 16, mr: 0.5 }} /> Новый склад
                        </ToggleButton>
                        <ToggleButton value="link">
                            <AddBusinessOutlined sx={{ fontSize: 16, mr: 0.5 }} /> Подключить
                        </ToggleButton>
                    </ToggleButtonGroup>
                </Box>
            )}

            {mode === "create" || editItem ? (
                <>
                    <Stack spacing={3} sx={{ p: 3, flex: 1, overflowY: "auto" }}>
                        {isOrgWide && !editItem && (
                            <Autocomplete<DjangoBranch, false, false, false>
                                options={branches}
                                getOptionLabel={(b) => b.name}
                                value={selectedBranch}
                                onChange={(_, v) => setSelectedBranch(v)}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Филиал *"
                                        error={touched && !selectedBranch}
                                        helperText={touched && !selectedBranch ? "Выберите филиал склада" : ""}
                                    />
                                )}
                                noOptionsText="Нет филиалов"
                            />
                        )}
                        <TextField
                            label="Название склада *"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            fullWidth
                            required
                            autoFocus
                            error={touched && !name.trim()}
                            helperText={touched && !name.trim() ? "Обязательное поле" : ""}
                        />
                        <TextField
                            label="Адрес *"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            fullWidth
                            required
                            placeholder="г. Бишкек, ул..."
                            multiline
                            rows={2}
                            error={touched && !address.trim()}
                            helperText={touched && !address.trim() ? "Обязательное поле" : ""}
                        />
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={isPrimary}
                                    onChange={(e) => setIsPrimary(e.target.checked)}
                                />
                            }
                            label="Основной склад филиала"
                        />
                    </Stack>

                    <Box sx={{ p: 2, borderTop: 1, borderColor: "divider" }}>
                        <Button
                            variant="contained"
                            fullWidth
                            size="large"
                            onClick={handleSubmitCreate}
                            disabled={createDisabled}
                        >
                            {loading ? "Сохранение..." : "Сохранить"}
                        </Button>
                    </Box>
                </>
            ) : (
                <>
                    <Stack spacing={2} sx={{ p: 3, pb: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            Подключите существующий склад другого филиала — все его товары
                            станут доступны в текущем филиале.
                        </Typography>
                    </Stack>
                    <Box sx={{ flex: 1, overflowY: "auto", px: 2 }}>
                        {loadingLinkable ? (
                            <Box sx={{ p: 4, textAlign: "center" }}>
                                <CircularProgress size={24} />
                            </Box>
                        ) : linkable.length === 0 ? (
                            <Box sx={{ p: 4, textAlign: "center" }}>
                                <Typography variant="body2" color="text.secondary">
                                    Нет складов для подключения
                                </Typography>
                            </Box>
                        ) : (
                            <List>
                                {linkable.map((w) => (
                                    <ListItemButton
                                        key={w.id}
                                        selected={selectedLinkId === w.id}
                                        onClick={() => setSelectedLinkId(w.id)}
                                        sx={{
                                            border: 1,
                                            borderColor: selectedLinkId === w.id ? "primary.main" : "divider",
                                            borderRadius: 1,
                                            mb: 1,
                                        }}
                                    >
                                        <Avatar
                                            variant="rounded"
                                            sx={{ mr: 2, bgcolor: "action.selected", color: "text.secondary" }}
                                        >
                                            <StoreIcon />
                                        </Avatar>
                                        <Box flex={1} minWidth={0}>
                                            <Typography variant="subtitle2" fontWeight={600} noWrap>
                                                {w.name}
                                            </Typography>
                                            {w.address && (
                                                <Typography variant="caption" color="text.secondary" display="block" noWrap>
                                                    {w.address}
                                                </Typography>
                                            )}
                                        </Box>
                                        <Chip
                                            size="small"
                                            label={w.branchName}
                                            variant="outlined"
                                            sx={{ ml: 1, flexShrink: 0 }}
                                        />
                                    </ListItemButton>
                                ))}
                            </List>
                        )}
                    </Box>
                    <Box sx={{ p: 2, borderTop: 1, borderColor: "divider" }}>
                        <Button
                            variant="contained"
                            fullWidth
                            size="large"
                            onClick={handleSubmitLink}
                            disabled={selectedLinkId === null || loading}
                        >
                            {loading ? "Подключение..." : "Подключить склад"}
                        </Button>
                    </Box>
                </>
            )}
        </Drawer>
    );
};

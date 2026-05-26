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
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { Warehouse, createWarehouse, updateWarehouse } from "../../services/warehouse";
import { useNotification } from "@refinedev/core";

interface AddWarehouseDrawerProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    editItem: Warehouse | null;
}

export const AddWarehouseDrawer: React.FC<AddWarehouseDrawerProps> = ({
    open,
    onClose,
    onSuccess,
    editItem
}) => {
    const { open: notify } = useNotification();
    const [name, setName] = useState("");
    const [address, setAddress] = useState("");
    const [loading, setLoading] = useState(false);
    const [touched, setTouched] = useState(false);

    useEffect(() => {
        if (open) {
            setName(editItem?.name || "");
            setAddress(editItem?.address || "");
            setLoading(false);
            setTouched(false);
        }
    }, [open, editItem]);

    const handleSubmit = async () => {
        setTouched(true);
        if (!name.trim() || !address.trim()) return;

        try {
            setLoading(true);
            if (editItem) {
                await updateWarehouse(editItem.id, { name, address });
                notify?.({ type: "success", message: "Склад обновлен" });
            } else {
                await createWarehouse(name, address);
                notify?.({ type: "success", message: "Склад создан" });
            }
            onSuccess();
            onClose();
        } catch (e) {
            console.error(e);
            notify?.({ type: "error", message: "Ошибка сохранения" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={loading ? undefined : onClose}
            PaperProps={{ sx: { width: { xs: 320, sm: 400 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
        >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5 }}>
                <Typography variant="h6">{editItem ? "Редактировать склад" : "Новый склад"}</Typography>
                <IconButton onClick={loading ? undefined : onClose}><CloseOutlined /></IconButton>
            </Box>
            <Divider />

            <Stack spacing={3} sx={{ p: 3, flex: 1, overflowY: "auto" }}>
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
            </Stack>

            <Box sx={{ p: 2, borderTop: 1, borderColor: "divider" }}>
                <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    onClick={handleSubmit}
                    disabled={!name.trim() || !address.trim() || loading}
                >
                    {loading ? "Сохранение..." : "Сохранить"}
                </Button>
            </Box>
        </Drawer>
    );
};

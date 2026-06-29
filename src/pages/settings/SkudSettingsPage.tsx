import React, { useEffect, useState } from "react";
import {
    Box,
    Button,
    Card,
    CardContent,
    CardHeader,
    TextField,
    Typography,
    Alert,
    Snackbar,
    CircularProgress
} from "@mui/material";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import { supabase } from "../../utility/supabaseClient";
import { usePermissions } from "../../hooks/usePermissions";
import { Navigate } from "react-router";

export const SkudSettingsPage: React.FC = () => {
    const { isAdmin, loading: authLoading } = usePermissions();
    const [url, setUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    useEffect(() => {
        if (isAdmin()) {
            fetchSettings();
        }
    }, [isAdmin]);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from("app_settings")
                .select("value")
                .eq("key", "skud_api_url")
                .single();

            if (error && error.code !== "PGRST116") { // Ignore "not found" error
                console.error("Error fetching settings:", error);
            }

            if (data) {
                setUrl(data.value || "");
            }
        } catch (err) {
            console.error("Unexpected error:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const { error } = await supabase
                .from("app_settings")
                .upsert({
                    key: "skud_api_url",
                    value: url,
                    description: "URL API для проверки СКУД"
                });

            if (error) throw error;

            setMessage({ type: "success", text: "Настройки успешно сохранены" });
        } catch (err) {
            console.error("Error saving settings:", err);
            setMessage({ type: "error", text: "Ошибка при сохранении настроек" });
        } finally {
            setSaving(false);
        }
    };

    if (authLoading) {
        return <CircularProgress />;
    }

    if (!isAdmin()) {
        return <Navigate to="/access-denied" replace />;
    }

    return (
        <Box sx={{ p: 3, maxWidth: 800, mx: "auto", height: "100%", overflowY: "auto" }}>
            <Typography variant="h4" gutterBottom fontWeight={700}>
                Настройки СКУД
            </Typography>

            <Card variant="outlined">
                <CardHeader title="Конфигурация интеграции" subheader="Настройте параметры подключения к системе контроля доступа" />
                <CardContent>
                    <Box component="form" noValidate autoComplete="off">
                        <TextField
                            fullWidth
                            label="IP адрес офиса для проверки СКУД"
                            placeholder="Введите внешний IP адрес офиса (например: 89.123.456.78)"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            disabled={loading || saving}
                            helperText="Сотрудники смогут начать смену только если их внешний IP совпадает с этим значением."
                            margin="normal"
                        />

                        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                            <Button
                                variant="contained"
                                startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveOutlined />}
                                onClick={handleSave}
                                disabled={loading || saving}
                            >
                                {saving ? "Сохранение..." : "Сохранить"}
                            </Button>
                        </Box>
                    </Box>
                </CardContent>
            </Card>

            <Snackbar
                open={!!message}
                autoHideDuration={6000}
                onClose={() => setMessage(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            >
                <Alert
                    onClose={() => setMessage(null)}
                    severity={message?.type || "info"}
                    sx={{ width: "100%" }}
                >
                    {message?.text}
                </Alert>
            </Snackbar>
        </Box>
    );
};

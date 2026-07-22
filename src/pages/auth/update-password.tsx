import React from "react";
import { useNavigate } from "react-router";
import {
    Box,
    Stack,
    TextField,
    Button,
    Typography,
    Alert,
    IconButton,
    InputAdornment,
} from "@mui/material";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import { supabase } from "../../utility/supabaseClient";
import AuthLayout from "../../components/auth/AuthLayout";
import AuthCard from "../../components/auth/AuthCard";
import AximoLogo from "../../components/auth/AximoLogo";

const UpdatePasswordPage: React.FC = () => {
    const navigate = useNavigate();
    const [password, setPassword] = React.useState("");
    const [confirmPassword, setConfirmPassword] = React.useState("");
    const [showPw, setShowPw] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
    const [infoMsg, setInfoMsg] = React.useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setErrorMsg("Пароли не совпадают");
            return;
        }
        if (password.length < 6) {
            setErrorMsg("Пароль должен быть не менее 6 символов");
            return;
        }

        setLoading(true);
        setErrorMsg(null);
        try {
            const { error } = await supabase.auth.updateUser({
                password: password,
            });

            if (error) {
                // Обработка специфической ошибки: новый пароль совпадает со старым
                if ((error as any).code === "same_password") {
                    throw new Error("Новый пароль должен отличаться от старого. Пожалуйста, придумайте другой пароль.");
                }
                // Обработка других распространенных ошибок
                if ((error as any).code === "weak_password") {
                    throw new Error("Пароль слишком слабый. Пожалуйста, используйте более сложную комбинацию.");
                }
                throw error;
            }

            setInfoMsg("Пароль успешно обновлен. Сейчас вы будете перенаправлены...");
            setTimeout(() => {
                navigate("/login", { replace: true });
            }, 2000);
        } catch (err: unknown) {
            let message = "Произошла ошибка при обновлении пароля";
            if (err instanceof Error) {
                message = err.message;
            } else if (typeof err === "object" && err !== null && "message" in err) {
                message = (err as any).message;
            }

            // Если ошибка осталась на английском (от Supabase), попробуем перевести самые частые
            if (message.includes("at least 6 characters")) {
                message = "Пароль должен содержать не менее 6 символов.";
            }
            if (message.includes("Auth session missing")) {
                message = "Сессия авторизации отсутствует или истекла. Пожалуйста, запросите ссылку восстановления снова.";
            }

            setErrorMsg(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout>
            <AuthCard>
                <Box sx={{ textAlign: "center", mb: 2 }}>
                    <Stack direction="row" justifyContent="center" alignItems="center" gap={1} mb={2}>
                        <AximoLogo iconOnly size={32} />
                        <Typography variant="h5" fontWeight={600}>Новый пароль</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        Вы успешно перешли по ссылке для восстановления доступа.
                    </Typography>
                    <Typography variant="body1" color="primary" fontWeight={600} sx={{ mb: 1 }}>
                        Введите новый пароль ниже для завершения настройки.
                    </Typography>
                </Box>

                {errorMsg && <Alert severity="error" sx={{ mb: 2 }}>{errorMsg}</Alert>}
                {infoMsg && <Alert severity="success" sx={{ mb: 2 }}>{infoMsg}</Alert>}

                <Stack component="form" onSubmit={handleSubmit} spacing={2}>
                    <TextField
                        label="Новый пароль"
                        type={showPw ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        fullWidth
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton onClick={() => setShowPw(!showPw)}>
                                        {showPw ? <VisibilityOffOutlined /> : <VisibilityOutlined />}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                    />
                    <TextField
                        label="Подтвердите пароль"
                        type={showPw ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        fullWidth
                    />
                    <Button type="submit" variant="contained" disabled={loading} fullWidth>
                        {loading ? "Обновление..." : "Сохранить новый пароль"}
                    </Button>
                    <Button variant="text" size="small" onClick={() => navigate("/login")} sx={{ textTransform: 'none' }}>
                        Вернуться ко входу
                    </Button>
                </Stack>
            </AuthCard>
        </AuthLayout>
    );
};

export default UpdatePasswordPage;

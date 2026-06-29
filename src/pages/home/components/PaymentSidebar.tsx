import React, { useState, useEffect } from "react";
import {
    Drawer,
    Box,
    Typography,
    IconButton,
    Divider,
    Stack,
    TextField,
    Button,
    CircularProgress,
    Paper,
    Chip,
    alpha,
    Tooltip,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import CardGiftcardOutlined from "@mui/icons-material/CardGiftcardOutlined";

import { APPOINTMENT_STATUSES } from "../../../config/appointmentStatuses";
import { Appointment, type AppointmentServiceJson } from "../types";
import { supabase } from "../../../utility/supabaseClient";
import { useNotification } from "@refinedev/core";
import { useQueryClient } from "@tanstack/react-query";
import { usePatientBalance } from "../../patient-search/usePatientBalance";

type PaymentSidebarProps = {
    open: boolean;
    onClose: () => void;
    appointment: Appointment | null;
    onSaved: () => void;
    productsCost?: number;
};

export const PaymentSidebar: React.FC<PaymentSidebarProps> = ({
    open,
    onClose,
    appointment,
    onSaved,
    productsCost = 0,
}) => {
    const { open: notify } = useNotification();
    const [loading, setLoading] = useState(false);

    // Form State
    // We'll process "services_json" to get the list of services for this appointment.
    // Ideally, appointment should have them. 
    // If not, we might need to rely on 'service_names' or fetch? 
    // The 'AppointmentsAggregated' view usually has 'services_json'.

    const [cash, setCash] = useState<number | "">("");
    const [card, setCard] = useState<number | "">("");
    const [discountPercent, setDiscountPercent] = useState<number>(0);
    const [adminComment, setAdminComment] = useState("");
    const [balanceUsed, setBalanceUsed] = useState<number>(0);
    const [bonusesUsed, setBonusesUsed] = useState<number>(0);

    // Load patient balance
    const { balance: patientBalance, reload: reloadBalance } = usePatientBalance(
        open ? (appointment?.patient_id ?? null) : null
    );

    // CSS to hide spin buttons
    const noSpinnersSx = {
        '& input[type=number]': {
            MozAppearance: 'textfield'
        },
        '& input[type=number]::-webkit-outer-spin-button': {
            WebkitAppearance: 'none',
            margin: 0
        },
        '& input[type=number]::-webkit-inner-spin-button': {
            WebkitAppearance: 'none',
            margin: 0
        }
    };

    // Derived calculations (computed even when appointment is null, so hooks stay above early return)
    let basePrice = 0;
    let servicesList: AppointmentServiceJson[] = [];

    if (appointment) {
        // Приоритет 1: total_amount из БД — базовая цена, сохранённая при создании/редактировании.
        // Это самый надёжный источник, не зависящий от текущих цен услуг.
        const storedAmount = Number(appointment.total_amount || 0);
        const storedCost = Number(appointment.total_cost || appointment.estimated_total || 0);
        const storedDiscount = Number(appointment.discount || 0);

        if (storedAmount > 0) {
            // total_amount уже включает товары (RPC create_full_appointment сохраняет
            // полную сумму услуг + товаров). Не прибавляем productsCost.
            basePrice = storedAmount;
        } else if (storedCost > 0) {
            // То же самое: total_cost — полная сумма с товарами.
            basePrice = storedCost;
        } else {
            // Fallback: если total_amount == 0 (старые данные, где цена со скидкой была сохранена как 0),
            // пересчитываем из services_json. services_json содержит только услуги,
            // поэтому товары прибавляем отдельно.
            try {
                if (typeof appointment.services_json === 'string') {
                    servicesList = JSON.parse(appointment.services_json) as AppointmentServiceJson[];
                } else if (Array.isArray(appointment.services_json)) {
                    servicesList = appointment.services_json as AppointmentServiceJson[];
                }
            } catch (e) {
                console.error("Error parsing services_json", e);
            }
            if (servicesList.length > 0) {
                basePrice = servicesList.reduce((acc, s) => acc + (Number(s.price ?? s.cost ?? 0) * (s.quantity || 1)), 0);
            }
            // Если и services_json пустой — используем скидку как базу (крайний случай)
            if (basePrice <= 0 && storedDiscount > 0) {
                basePrice = storedDiscount;
            }
            basePrice += productsCost;
        }
    }

    // All hooks must be called before any early return
    const lastInitializedId = React.useRef<string | null>(null);
    const queryClient = useQueryClient();

    useEffect(() => {
        if (open && appointment) {
            if (lastInitializedId.current !== appointment.id) {
                setCash(appointment.paid_cash || "");
                setCard(appointment.paid_card || "");
                setBalanceUsed(appointment.paid_balance || 0);
                setBonusesUsed(appointment.paid_bonuses || 0);

                // Вычисляем процент скидки из сохранённых данных.
                // basePrice здесь уже восстановлен (total_amount + discount),
                // поэтому деление корректно.
                // Та же логика что и для basePrice выше: приоритет total_amount из БД
                const initBase = (() => {
                    const sa = Number(appointment.total_amount || 0);
                    const sc = Number(appointment.total_cost || appointment.estimated_total || 0);
                    const sd = Number(appointment.discount || 0);
                    if (sa > 0) return sa + productsCost;
                    if (sc > 0) return sc + productsCost;
                    // fallback через services_json
                    let list: AppointmentServiceJson[] = [];
                    try {
                        if (typeof appointment.services_json === 'string') list = JSON.parse(appointment.services_json);
                        else if (Array.isArray(appointment.services_json)) list = appointment.services_json as AppointmentServiceJson[];
                    } catch (_) { /* ignore */ }
                    const fromServices = list.reduce((acc, s) => acc + (Number(s.price ?? s.cost ?? 0) * (s.quantity || 1)), 0);
                    if (fromServices > 0) return fromServices + productsCost;
                    return (sd > 0 ? sd : 0) + productsCost;
                })();

                if (initBase > 0 && appointment.discount > 0) {
                    const percent = Math.round((appointment.discount / initBase) * 100);
                    setDiscountPercent(percent);
                } else {
                    setDiscountPercent(0);
                }

                setAdminComment(appointment.admin_comment || "");
                lastInitializedId.current = appointment.id;
            }
        } else if (!open) {
            lastInitializedId.current = null;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, appointment?.id]);

    // Calculate Discount Amount
    const discountAmount = Math.round((basePrice * discountPercent) / 100);

    // Final Price to Pay
    const finalPrice = Math.max(0, basePrice - discountAmount);

    // Total Paid Input
    const cashNum = Number(cash || 0);
    const cardNum = Number(card || 0);
    const totalPaid = cashNum + cardNum + balanceUsed + bonusesUsed;

    // Debt = finalPrice - totalPaid
    const debt = Math.max(0, finalPrice - totalPaid);

    if (!appointment) return null;

    const handleSaveFree = async () => {
        if (loading) return;
        const prevDetails = queryClient.getQueryData<any>(['appointment-details', appointment.id]);
        const updates = {
            status: APPOINTMENT_STATUSES.FREE,
            paid_cash: 0,
            paid_card: 0,
            discount: basePrice,
            debt: 0,
            admin_comment: adminComment,
        };
        if (prevDetails) {
            queryClient.setQueryData(['appointment-details', appointment.id], {
                ...prevDetails,
                item: { ...prevDetails.item, ...updates },
            });
        }
        queryClient.setQueriesData({ queryKey: ["appointments", "daily"] }, (old: any) => {
            if (!Array.isArray(old)) return old;
            return old.map((a: any) => a.id === appointment.id ? { ...a, ...updates } : a);
        });
        try {
            setLoading(true);
            const { error } = await supabase.from("Appointments").update(updates).eq("id", appointment.id);
            if (error) throw error;
            notify?.({ type: "success", message: "Приём отмечен как бесплатный" });
            onSaved();
            onClose();
        } catch (e: unknown) {
            if (prevDetails) queryClient.setQueryData(['appointment-details', appointment.id], prevDetails);
            queryClient.invalidateQueries({ queryKey: ["appointments", "daily"] });
            notify?.({ type: "error", message: "Ошибка при сохранении" });
        } finally {
            setLoading(false);
        }
    };

    // Helper: deduct/refund patient balance/bonuses after successful payment save
    const adjustPatientBalanceIfNeeded = async () => {
        if (!appointment?.patient_id) return;

        const balanceDiff = balanceUsed - (appointment.paid_balance || 0);
        const bonusesDiff = bonusesUsed - (appointment.paid_bonuses || 0);

        if (balanceDiff === 0 && bonusesDiff === 0) return;

        const { data: { user } } = await supabase.auth.getUser();

        if (balanceDiff > 0 || bonusesDiff > 0) {
            // Deduct increment
            await supabase.rpc("deduct_patient_balance", {
                p_patient_id: appointment.patient_id,
                p_balance_used: Math.max(0, balanceDiff),
                p_bonuses_used: Math.max(0, bonusesDiff),
                p_note: `Оплата приёма (корректировка)`,
                p_created_by: user?.id ?? null,
            });
        }

        if (balanceDiff < 0 || bonusesDiff < 0) {
            // Refund decrement (top up back)
            if (balanceDiff < 0) {
                await supabase.rpc("top_up_patient_balance", {
                    p_patient_id: appointment.patient_id,
                    p_type: 'balance',
                    p_amount: Math.abs(balanceDiff),
                    p_payment_method: null,
                    p_note: `Возврат за приём (корректировка)`,
                    p_created_by: user?.id ?? null,
                });
            }
            if (bonusesDiff < 0) {
                await supabase.rpc("top_up_patient_balance", {
                    p_patient_id: appointment.patient_id,
                    p_type: 'bonuses',
                    p_amount: Math.abs(bonusesDiff),
                    p_payment_method: null,
                    p_note: `Возврат бонусов за приём (корректировка)`,
                    p_created_by: user?.id ?? null,
                });
            }
        }

        reloadBalance();
    };

    const handleSave = async () => {
        if (loading) return;

        // Optimistic Updates
        const prevDetails = queryClient.getQueryData<any>(['appointment-details', appointment.id]);
        const updates = {
            status: (() => {
                if (debt <= 0) {
                    if (totalPaid <= 0 && discountAmount > 0) return APPOINTMENT_STATUSES.DISCOUNTED;
                    return APPOINTMENT_STATUSES.PAID;
                }
                if (totalPaid > 0) return APPOINTMENT_STATUSES.PARTIALLY_PAID;

                // Если оплаты не было (или она нулевая для закрытия долга),
                // сохраняем текущий статус (Завершено, В работе и т.д.)
                return appointment.status;
            })(),
            paid_cash: cashNum,
            paid_card: cardNum,
            paid_balance: balanceUsed,
            paid_bonuses: bonusesUsed,
            discount: discountAmount,
            debt: debt,
            admin_comment: adminComment,
        };

        // Update details cache
        if (prevDetails) {
            queryClient.setQueryData(['appointment-details', appointment.id], {
                ...prevDetails,
                item: { ...prevDetails.item, ...updates }
            });
        }

        // Update list cache
        queryClient.setQueriesData({ queryKey: ["appointments", "daily"] }, (old: any) => {
            if (!Array.isArray(old)) return old;
            return old.map(a => a.id === appointment.id ? { ...a, ...updates } : a);
        });

        try {
            setLoading(true);

            const { error } = await supabase
                .from("Appointments")
                .update(updates)
                .eq("id", appointment.id);

            if (error) throw error;
            await adjustPatientBalanceIfNeeded();

            notify?.({
                type: "success",
                message: "Оплата успешно сохранена",
            });
            onSaved();
            onClose();
        } catch (e: unknown) {
            // Rollback
            if (prevDetails) {
                queryClient.setQueryData(['appointment-details', appointment.id], prevDetails);
            }
            queryClient.invalidateQueries({ queryKey: ["appointments", "daily"] });

            console.error(e);
            const message =
                e && typeof e === "object" && "message" in e
                    ? String((e as { message?: unknown }).message)
                    : String(e);
            notify?.({
                type: "error",
                message: "Ошибка при сохранении оплаты",
                description: message,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: { width: { xs: 320, sm: 400 }, zIndex: (theme) => theme.zIndex.drawer + 20, display: "flex", flexDirection: "column" },
            }}
        >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5 }}>
                <Typography variant="h6">Оплата приема</Typography>
                <IconButton onClick={onClose}><CloseOutlined /></IconButton>
            </Box>

            <Stack
                spacing={3}
                sx={{
                    p: 3,
                    flex: 1,
                    overflowY: 'auto',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    '&::-webkit-scrollbar': {
                        display: 'none',
                    },
                }}
            >
                {/* Combined Patient and Payment Card */}
                <Paper
                    elevation={0}
                    sx={{
                        p: 2.5,
                        bgcolor: (theme) => alpha(theme.palette.success.main, 0.04), // soft green tint for the whole card
                        border: '1px solid',
                        borderColor: (theme) => alpha(theme.palette.success.main, 0.2),
                        borderRadius: "14px",
                    }}
                >
                    <Stack spacing={2}>
                        {/* Patient Info & Balance Section */}
                        <Box>
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600, letterSpacing: 0.5 }}>
                                Пациент
                            </Typography>
                            <Typography variant="body1" sx={{ mb: 2, fontWeight: 600 }}>
                                {appointment.patient_name}
                            </Typography>

                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1, fontWeight: 600, letterSpacing: 0.5 }}>
                                Счёт пациента
                            </Typography>
                            <Stack spacing={1}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Stack direction="row" alignItems="center" spacing={0.75}>
                                        <AccountBalanceWalletOutlined sx={{ fontSize: 16, color: 'success.main' }} />
                                        <Typography variant="body2">
                                            Баланс: <Box component="strong" sx={{ color: 'success.main' }}>{patientBalance?.balance?.toLocaleString() || 0} сом</Box>
                                        </Typography>
                                    </Stack>
                                    {((patientBalance?.balance || 0) > 0 || balanceUsed > 0) && (
                                        <Tooltip title={balanceUsed > 0 ? "Убрать" : "Использовать баланс"}>
                                            <Button
                                                size="small"
                                                variant={balanceUsed > 0 ? "contained" : "outlined"}
                                                color="success"
                                                sx={{ minWidth: 'auto', px: 1.5, fontSize: '0.7rem', textTransform: 'none', py: 0.25 }}
                                                onClick={() => {
                                                    if (balanceUsed > 0) {
                                                        setBalanceUsed(0);
                                                    } else {
                                                        const canUse = Math.min(patientBalance?.balance || 0, Math.max(0, finalPrice - cardNum - bonusesUsed));
                                                        setBalanceUsed(canUse);
                                                    }
                                                }}
                                            >
                                                {balanceUsed > 0 ? `− ${balanceUsed.toLocaleString()} сом` : "Использовать"}
                                            </Button>
                                        </Tooltip>
                                    )}
                                </Stack>

                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Stack direction="row" alignItems="center" spacing={0.75}>
                                        <CardGiftcardOutlined sx={{ fontSize: 16, color: 'warning.main' }} />
                                        <Typography variant="body2">
                                            Бонусы: <Box component="strong" sx={{ color: 'warning.main' }}>{patientBalance?.bonuses?.toLocaleString() || 0} сом</Box>
                                        </Typography>
                                    </Stack>
                                    {((patientBalance?.bonuses || 0) > 0 || bonusesUsed > 0) && (
                                        <Tooltip title={bonusesUsed > 0 ? "Убрать" : "Использовать Бонусы"}>
                                            <Button
                                                size="small"
                                                variant={bonusesUsed > 0 ? "contained" : "outlined"}
                                                color="warning"
                                                sx={{ minWidth: 'auto', px: 1.5, fontSize: '0.7rem', textTransform: 'none', py: 0.25 }}
                                                onClick={() => {
                                                    if (bonusesUsed > 0) {
                                                        setBonusesUsed(0);
                                                    } else {
                                                        const canUse = Math.min(patientBalance?.bonuses || 0, Math.max(0, finalPrice - cashNum - cardNum - balanceUsed));
                                                        setBonusesUsed(canUse);
                                                    }
                                                }}
                                            >
                                                {bonusesUsed > 0 ? `− ${bonusesUsed.toLocaleString()} сом` : "Использовать"}
                                            </Button>
                                        </Tooltip>
                                    )}
                                </Stack>
                            </Stack>
                        </Box>

                        <Divider sx={{ my: 1 }} />

                        {/* Payment Info Section */}
                        <Stack spacing={2}>
                            {/* Стоимость и Скидка */}
                            <Stack direction="row" spacing={2} alignItems="flex-start">
                                <Box flex={1}>
                                    <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                        Стоимость
                                    </Typography>
                                    <Typography variant="h6" fontWeight={600}>
                                        {basePrice.toLocaleString()} сом
                                    </Typography>
                                </Box>
                                <Box flex={1}>
                                    <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                        Скидка, %
                                    </Typography>
                                    <TextField
                                        type="number"
                                        size="small"
                                        fullWidth
                                        value={discountPercent}
                                        onChange={(e) => setDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                                        inputProps={{ min: 0, max: 100, style: { textAlign: 'center' } }}
                                        sx={{ ...noSpinnersSx }}
                                    />
                                </Box>
                            </Stack>

                            {/* Наличные и Безналичные компактно */}
                            <Stack direction="row" spacing={2}>
                                <Stack flex={1} spacing={0.5}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Typography variant="caption" color="text.secondary" display="block">
                                            Наличные
                                        </Typography>
                                        <Button
                                            size="small"
                                            variant="text"
                                            onClick={() => {
                                                setCash(Math.max(0, finalPrice - balanceUsed - bonusesUsed));
                                                setCard(0);
                                            }}
                                            sx={{ minWidth: 'auto', px: 1, fontSize: '0.7rem', textTransform: 'none' }}
                                        >
                                            100%
                                        </Button>
                                    </Stack>
                                    <Stack direction="row" alignItems="center" spacing={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
                                        <Box px={1}><AccountBalanceWalletOutlined color="action" fontSize="small" /></Box>
                                        <TextField
                                            variant="standard"
                                            fullWidth
                                            type="number"
                                            value={cash}
                                            onChange={(e) => {
                                                if (e.target.value === "") {
                                                    setCash("");
                                                } else {
                                                    const val = Number(e.target.value);
                                                    // Ограничиваем сумму: не больше итоговой суммы минус другие виды платежа
                                                    const maxAllowed = Math.max(0, finalPrice - cardNum - balanceUsed - bonusesUsed);
                                                    setCash(Math.min(val, maxAllowed));
                                                }
                                            }}
                                            InputProps={{ disableUnderline: true }}
                                            sx={{ py: 0.5, ...noSpinnersSx }}
                                            placeholder="0"
                                        />
                                    </Stack>
                                </Stack>

                                <Stack flex={1} spacing={0.5}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Typography variant="caption" color="text.secondary" display="block">
                                            Безналичные
                                        </Typography>
                                        <Button
                                            size="small"
                                            variant="text"
                                            onClick={() => {
                                                setCard(Math.max(0, finalPrice - balanceUsed - bonusesUsed));
                                                setCash(0);
                                            }}
                                            sx={{ minWidth: 'auto', px: 1, fontSize: '0.7rem', textTransform: 'none' }}
                                        >
                                            100%
                                        </Button>
                                    </Stack>
                                    <Stack direction="row" alignItems="center" spacing={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
                                        <Box px={1}><CreditCardOutlined color="action" fontSize="small" /></Box>
                                        <TextField
                                            variant="standard"
                                            fullWidth
                                            type="number"
                                            value={card}
                                            onChange={(e) => {
                                                if (e.target.value === "") {
                                                    setCard("");
                                                } else {
                                                    const val = Number(e.target.value);
                                                    // Ограничиваем сумму: не больше итоговой суммы минус другие виды платежа
                                                    const maxAllowed = Math.max(0, finalPrice - cashNum - balanceUsed - bonusesUsed);
                                                    setCard(Math.min(val, maxAllowed));
                                                }
                                            }}
                                            InputProps={{ disableUnderline: true }}
                                            sx={{ py: 0.5, ...noSpinnersSx }}
                                            placeholder="0"
                                        />
                                    </Stack>
                                </Stack>
                            </Stack>

                            {/* Со счёта пациента */}
                            {(balanceUsed > 0 || bonusesUsed > 0) && (
                                <Paper
                                    elevation={0}
                                    sx={{
                                        p: 1.25,
                                        bgcolor: (theme) => alpha(theme.palette.success.main, 0.06),
                                        border: '1px solid',
                                        borderColor: (theme) => alpha(theme.palette.success.main, 0.2),
                                        borderRadius: 1,
                                    }}
                                >
                                    <Stack spacing={0.5}>
                                        {balanceUsed > 0 && (
                                            <Stack direction="row" justifyContent="space-between">
                                                <Typography variant="caption" color="success.main">Со счёта</Typography>
                                                <Typography variant="caption" color="success.main" fontWeight={600}>− {balanceUsed.toLocaleString()} сом</Typography>
                                            </Stack>
                                        )}
                                        {bonusesUsed > 0 && (
                                            <Stack direction="row" justifyContent="space-between">
                                                <Typography variant="caption" color="warning.main">Бонусами</Typography>
                                                <Typography variant="caption" color="warning.main" fontWeight={600}>− {bonusesUsed.toLocaleString()} сом</Typography>
                                            </Stack>
                                        )}
                                    </Stack>
                                </Paper>
                            )}

                            <Divider sx={{ my: 1 }} />

                            {/* Итого к оплате */}
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Typography variant="body2" color="text.secondary" fontWeight={600}>
                                    Итого к оплате
                                </Typography>
                                <Typography variant="h5" fontWeight={700} color="success.main">
                                    {finalPrice.toLocaleString()} сом
                                </Typography>
                            </Stack>

                            {/* Статус и Долг */}
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Typography variant="body2" color="text.secondary">
                                    Статус
                                </Typography>
                                <Chip
                                    label={debt <= 0 ? "Оплачено" : "Долг"}
                                    size="small"
                                    color={debt <= 0 ? "success" : "error"}
                                    sx={{ fontWeight: 600 }}
                                />
                            </Stack>

                            {debt > 0 && (
                                <Paper
                                    elevation={0}
                                    sx={{
                                        p: 1.5,
                                        bgcolor: (theme) => alpha(theme.palette.error.main, 0.08),
                                        border: '1px solid',
                                        borderColor: (theme) => alpha(theme.palette.error.main, 0.3),
                                        borderRadius: 1,
                                    }}
                                >
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Typography variant="body2" color="error.main" fontWeight={600}>
                                            Долг
                                        </Typography>
                                        <Typography variant="h6" color="error.main" fontWeight={700}>
                                            {debt.toLocaleString()} сом
                                        </Typography>
                                    </Stack>
                                </Paper>
                            )}
                        </Stack>
                    </Stack>
                </Paper>
                <Stack spacing={0.5}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                        Комментарий администратора
                    </Typography>
                    <TextField
                        fullWidth
                        multiline
                        rows={3}
                        value={adminComment}
                        onChange={(e) => setAdminComment(e.target.value)}
                        placeholder="Добавьте комментарий (необязательно)"
                    />
                </Stack>

            </Stack>

            <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Stack spacing={1}>
                    <Button
                        fullWidth
                        variant="contained"
                        size="large"
                        disabled={loading}
                        onClick={handleSave}
                    >
                        {loading ? (
                            <CircularProgress size={24} color="inherit" />
                        ) : (
                            (appointment.paid_cash || 0) > 0 || (appointment.paid_card || 0) > 0
                                ? "Обновить оплату"
                                : "Подтвердить оплату"
                        )}
                    </Button>
                </Stack>
            </Box>
        </Drawer>
    );
};

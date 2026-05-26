import React, { useState, useEffect, useCallback } from "react";
import {
    Box,
    Card,
    CardContent,
    Button,
    Divider,
    Stack,
    Typography,
    CircularProgress,
    IconButton,
    Tooltip,
    TextField,
    Autocomplete,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    Drawer,
    Paper,
    Switch,
    FormControlLabel,
    useMediaQuery,
    useTheme
} from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useNotification } from "@refinedev/core";
import { usePermissions } from "../../hooks/usePermissions";
import { PageHeader } from "../../components/ui";
import {
    getClinicDiagnoses,
    getAdminDiagnoses,
    createClinicDiagnosis,
    updateClinicDiagnosis,
    deleteClinicDiagnosis,
    Diagnosis,
    ClinicDiagnosis
} from "../../services/diagnoses";

const DiagnosesPage: React.FC = () => {
    usePageTitle("Управление диагнозами");
    const { isSuperAdmin } = usePermissions();
    const isSuper = isSuperAdmin();
    const { open: notify } = useNotification();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));

    // State
    const [loading, setLoading] = useState(false);
    const [clinicDiagnoses, setClinicDiagnoses] = useState<ClinicDiagnosis[]>([]);
    const [searchQuery, setSearchQuery] = useState("");

    // Drawers
    const [addDrawerOpen, setAddDrawerOpen] = useState(false);
    const [editDrawerOpen, setEditDrawerOpen] = useState(false);
    const [deleteDrawerOpen, setDeleteDrawerOpen] = useState(false);

    // Form State
    const [selectedClinicDiagnosis, setSelectedClinicDiagnosis] = useState<ClinicDiagnosis | null>(null);
    const [selectedMasterDiagnosis, setSelectedMasterDiagnosis] = useState<Diagnosis | null>(null);
    const [customTitle, setCustomTitle] = useState("");
    const [sortOrder, setSortOrder] = useState(0);
    const [isActive, setIsActive] = useState(true);
    const [noMkb, setNoMkb] = useState(false);

    // Master Diagnoses Search (for Autocomplete)
    const [masterSearch, setMasterSearch] = useState("");
    const [masterOptions, setMasterOptions] = useState<Diagnosis[]>([]);
    const [masterLoading, setMasterLoading] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getClinicDiagnoses(true); // Include inactive for admin
            setClinicDiagnoses(data);
        } catch (e) {
            console.error(e);
            notify?.({ type: "error", message: "Ошибка при загрузке диагнозов" });
        } finally {
            setLoading(false);
        }
    }, [notify]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Master list search
    useEffect(() => {
        // Если введено меньше 2 символов, но больше 0 — очищаем список
        if (masterSearch.length > 0 && masterSearch.length < 2) {
            setMasterOptions([]);
            return;
        }

        const loadMaster = async () => {
            setMasterLoading(true);
            try {
                // Если поиск пустой, берем первые 20 (популярные), иначе первые 50 совпадений
                const pageSize = masterSearch.length === 0 ? 20 : 50;
                const { data } = await getAdminDiagnoses(masterSearch, 0, pageSize);
                setMasterOptions(data);
            } catch (e) {
                console.error(e);
            } finally {
                setMasterLoading(false);
            }
        };

        // Если поиск пустой (первое открытие), загружаем сразу. 
        // Если есть текст (>= 2 симв), используем debounce.
        if (masterSearch.length === 0) {
            loadMaster();
            return;
        }

        const timer = setTimeout(loadMaster, 300);

        return () => clearTimeout(timer);
    }, [masterSearch]);

    const handleAdd = async () => {
        if (!noMkb && !selectedMasterDiagnosis) {
            notify?.({ type: "error", message: "Выберите диагноз из справочника МКБ" });
            return;
        }

        if (noMkb && !customTitle) {
            notify?.({ type: "error", message: "Пожалуйста, введите название диагноза" });
            return;
        }

        try {
            setLoading(true);
            await createClinicDiagnosis(
                noMkb ? null : selectedMasterDiagnosis!.code,
                customTitle || (selectedMasterDiagnosis?.name || ""),
                sortOrder
            );
            notify?.({ type: "success", message: "Диагноз добавлен в список клиники" });
            setAddDrawerOpen(false);
            resetForm();
            loadData();
        } catch (e) {
            console.error(e);
            notify?.({ type: "error", message: "Ошибка при добавлении диагноза" });
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async () => {
        if (!selectedClinicDiagnosis) return;

        try {
            setLoading(true);
            await updateClinicDiagnosis(selectedClinicDiagnosis.id, {
                title: customTitle,
                sort_order: sortOrder,
                is_active: isActive
            });
            notify?.({ type: "success", message: "Диагноз обновлен" });
            setEditDrawerOpen(false);
            resetForm();
            loadData();
        } catch (e) {
            console.error(e);
            notify?.({ type: "error", message: "Ошибка при обновлении диагноза" });
        } finally {
            setLoading(false);
        }
    };

    const handleToggleActive = async (diag: ClinicDiagnosis, checked: boolean) => {
        try {
            await updateClinicDiagnosis(diag.id, { is_active: checked });
            setClinicDiagnoses(prev => prev.map(d => d.id === diag.id ? { ...d, is_active: checked } : d));
            notify?.({ type: "success", message: checked ? "Диагноз активирован" : "Диагноз деактивирован" });
        } catch (e) {
            console.error(e);
            notify?.({ type: "error", message: "Ошибка при изменении статуса" });
        }
    };

    const handleDelete = async () => {
        if (!selectedClinicDiagnosis) return;

        try {
            setLoading(true);
            await deleteClinicDiagnosis(selectedClinicDiagnosis.id);
            notify?.({ type: "success", message: "Диагноз удален из списка клиники" });
            setDeleteDrawerOpen(false);
            resetForm();
            loadData();
        } catch (e) {
            console.error(e);
            notify?.({ type: "error", message: "Ошибка при удалении диагноза" });
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setSelectedMasterDiagnosis(null);
        setSelectedClinicDiagnosis(null);
        setCustomTitle("");
        setSortOrder(0);
        setIsActive(true);
        setMasterSearch("");
        setMasterOptions([]);
        setNoMkb(false);
    };

    const openEdit = (diag: ClinicDiagnosis) => {
        setSelectedClinicDiagnosis(diag);
        setCustomTitle(diag.title);
        setSortOrder(diag.sort_order);
        setIsActive(diag.is_active);
        setEditDrawerOpen(true);
    };

    const filteredDiagnoses = clinicDiagnoses.filter(d =>
        d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.diagnosis_code?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <Box sx={(theme) => ({
            height: {
                xs: `calc(100dvh - ${theme.appLayout.viewportOffset.home.mobileOffset}px)`,
                md: `calc(100dvh - ${theme.appLayout.viewportOffset.home.desktopOffset}px)`,
            },
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
        })}>
            <PageHeader
                title="Управление диагнозами"
                addButtonText="Добавить диагноз"
                onAdd={() => setAddDrawerOpen(true)}
                showSearch
                searchVal={searchQuery}
                onSearchChange={setSearchQuery}
            />
            <Box sx={(theme) => ({
                flex: 1,
                overflow: { xs: "auto", md: "hidden" },
                px: theme.appLayout.page.paddingX,
                pb: { xs: 12, md: 3 },
                display: "flex",
                flexDirection: "column",
                gap: { xs: 1.5, md: 3 }
            })}>
                {/* Loading / Empty states */}
                {loading && clinicDiagnoses.length === 0 ? (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                        <CircularProgress />
                    </Box>
                ) : filteredDiagnoses.length === 0 ? (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                        <Typography color="text.secondary">Диагнозы не найдены</Typography>
                    </Box>
                ) : isMobile ? (
                    /* ─── Mobile: Card-based list ─── */
                    <Stack spacing={1}>
                        {filteredDiagnoses.map((diag) => (
                            <Card
                                key={diag.id}
                                variant="outlined"
                                sx={{
                                    opacity: diag.is_active ? 1 : 0.55,
                                    transition: "opacity 0.2s",
                                }}
                            >
                                <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                                    {/* Top row: code chip + active switch */}
                                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                                        <Chip
                                            label={diag.diagnosis_code || "Без МКБ"}
                                            size="small"
                                            variant={diag.diagnosis_code ? "outlined" : "filled"}
                                            color={diag.diagnosis_code ? "default" : "info"}
                                        />
                                        <Switch
                                            size="small"
                                            checked={diag.is_active}
                                            onChange={(e) => handleToggleActive(diag, e.target.checked)}
                                        />
                                    </Stack>

                                    {/* Title */}
                                    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                        {diag.title}
                                    </Typography>

                                    {/* Full MKB name (truncated) */}
                                    {diag.diagnosis_full_title && diag.diagnosis_full_title !== diag.title && (
                                        <Typography variant="caption" color="text.secondary" sx={{
                                            display: "-webkit-box",
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: "vertical",
                                            overflow: "hidden",
                                            mb: 1,
                                        }}>
                                            {diag.diagnosis_full_title}
                                        </Typography>
                                    )}

                                    {/* Actions row */}
                                    <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
                                        {diag.sort_order > 0 && (
                                            <Typography variant="caption" color="text.secondary" sx={{ mr: "auto" }}>
                                                Порядок: {diag.sort_order}
                                            </Typography>
                                        )}
                                        <IconButton size="small" onClick={() => openEdit(diag)}>
                                            <EditOutlined fontSize="small" />
                                        </IconButton>
                                        {isSuper && (
                                            <IconButton size="small" color="error" onClick={() => {
                                                setSelectedClinicDiagnosis(diag);
                                                setDeleteDrawerOpen(true);
                                            }}>
                                                <DeleteOutline fontSize="small" />
                                            </IconButton>
                                        )}
                                    </Stack>
                                </CardContent>
                            </Card>
                        ))}
                    </Stack>
                ) : (
                    /* ─── Desktop: Table layout ─── */
                    <Card variant="outlined" sx={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                        <CardContent sx={{ p: 0, flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                            <TableContainer sx={{ flex: 1, overflowY: "auto" }}>
                                <Table sx={{ minWidth: 650 }}>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Код МКБ</TableCell>
                                            <TableCell>Название в клинике</TableCell>
                                            <TableCell>Полное название МКБ</TableCell>
                                            <TableCell align="center">Порядок</TableCell>
                                            <TableCell align="center">Активен</TableCell>
                                            <TableCell align="right">Действия</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {filteredDiagnoses.map((diag) => (
                                            <TableRow key={diag.id} hover sx={{ opacity: diag.is_active ? 1 : 0.6 }}>
                                                <TableCell>
                                                    <Chip
                                                        label={diag.diagnosis_code || "Без МКБ"}
                                                        size="small"
                                                        variant={diag.diagnosis_code ? "outlined" : "filled"}
                                                        color={diag.diagnosis_code ? "default" : "info"}
                                                    />
                                                </TableCell>
                                                <TableCell sx={{ fontWeight: 500 }}>{diag.title}</TableCell>
                                                <TableCell color="text.secondary">
                                                    <Typography variant="body2" color="text.secondary" noWrap={false} sx={{ maxWidth: 400 }}>
                                                        {diag.diagnosis_full_title}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="center">{diag.sort_order}</TableCell>
                                                <TableCell align="center">
                                                    <Switch
                                                        size="small"
                                                        checked={diag.is_active}
                                                        onChange={(e) => handleToggleActive(diag, e.target.checked)}
                                                    />
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Tooltip title="Редактировать">
                                                        <IconButton size="small" onClick={() => openEdit(diag)}>
                                                            <EditOutlined fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    {isSuper && (
                                                        <Tooltip title="Удалить">
                                                            <IconButton size="small" color="error" onClick={() => {
                                                                setSelectedClinicDiagnosis(diag);
                                                                setDeleteDrawerOpen(true);
                                                            }}>
                                                                <DeleteOutline fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </CardContent>
                    </Card>
                )}

                {/* Add Drawer */}
                <Drawer
                    anchor="right"
                    open={addDrawerOpen}
                    onClose={() => {
                        setAddDrawerOpen(false);
                        resetForm();
                    }}
                    PaperProps={{ sx: { width: { xs: "100%", sm: 400 }, p: 0 } }}
                >
                    <Box sx={{ p: 3, display: "flex", flexDirection: "column", height: "100%" }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                            <Typography variant="h6">Добавить диагноз</Typography>
                            <IconButton onClick={() => setAddDrawerOpen(false)} size="small">
                                <CloseOutlined />
                            </IconButton>
                        </Stack>
                        <Divider sx={{ mb: 3 }} />
                        <Stack spacing={3} sx={{ flex: 1 }}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={noMkb}
                                        onChange={(e) => {
                                            setNoMkb(e.target.checked);
                                            if (e.target.checked) setSelectedMasterDiagnosis(null);
                                        }}
                                        color="info"
                                    />
                                }
                                label="Без МКБ"
                                sx={{ mb: 1 }}
                            />

                            {!noMkb && (
                                <Autocomplete
                                    fullWidth
                                    openOnFocus
                                    options={masterOptions}
                                    getOptionLabel={(option) => `[${option.code}] ${option.name}`}
                                    loading={masterLoading}
                                    onInputChange={(_, value) => setMasterSearch(value)}
                                    onChange={(_, value) => {
                                        setSelectedMasterDiagnosis(value);
                                        if (value) {
                                            if (!customTitle) setCustomTitle(value.name);
                                        } else {
                                            setCustomTitle("");
                                        }
                                    }}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            label="Поиск в МКБ-10 (код или название)"
                                            placeholder="Минимум 2 символа..."
                                            InputProps={{
                                                ...params.InputProps,
                                                endAdornment: (
                                                    <>
                                                        {masterLoading ? <CircularProgress color="inherit" size={20} /> : null}
                                                        {params.InputProps.endAdornment}
                                                    </>
                                                ),
                                            }}
                                        />
                                    )}
                                    noOptionsText="Ничего не найдено"
                                />
                            )}

                            <TextField
                                fullWidth
                                label="Название для врачей"
                                value={customTitle}
                                onChange={(e) => setCustomTitle(e.target.value)}
                                helperText={noMkb ? "Обязательное поле" : "Если оставить пустым, будет использовано полное название из МКБ"}
                                multiline
                                required={noMkb}
                                error={noMkb && !customTitle}
                                rows={3}
                            />

                            <TextField
                                fullWidth
                                type="number"
                                label="Порядок сортировки"
                                value={sortOrder}
                                onChange={(e) => setSortOrder(Number(e.target.value))}
                            />
                        </Stack>
                        <Box sx={{ pt: 2, display: "flex", gap: 1 }}>
                            <Button fullWidth variant="outlined" onClick={() => setAddDrawerOpen(false)}>Отмена</Button>
                            <Button fullWidth variant="contained" onClick={handleAdd} startIcon={<SaveOutlined />}>Добавить</Button>
                        </Box>
                    </Box>
                </Drawer>

                {/* Edit Drawer */}
                <Drawer
                    anchor="right"
                    open={editDrawerOpen}
                    onClose={() => {
                        setEditDrawerOpen(false);
                        resetForm();
                    }}
                    PaperProps={{ sx: { width: { xs: "100%", sm: 400 }, p: 0 } }}
                >
                    <Box sx={{ p: 3, display: "flex", flexDirection: "column", height: "100%" }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                            <Typography variant="h6">Редактировать диагноз</Typography>
                            <IconButton onClick={() => setEditDrawerOpen(false)} size="small">
                                <CloseOutlined />
                            </IconButton>
                        </Stack>
                        <Divider sx={{ mb: 3 }} />
                        <Stack spacing={3} sx={{ flex: 1 }}>
                            <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
                                <Typography variant="caption" color="text.secondary" display="block">Код МКБ</Typography>
                                <Typography variant="subtitle2">{selectedClinicDiagnosis?.diagnosis_code}</Typography>
                                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>Полное название</Typography>
                                <Typography variant="body2">{selectedClinicDiagnosis?.diagnosis_full_title}</Typography>
                            </Box>
                            <TextField
                                fullWidth
                                label="Название для врачей"
                                value={customTitle}
                                onChange={(e) => setCustomTitle(e.target.value)}
                                multiline
                                rows={3}
                            />
                            <TextField
                                fullWidth
                                type="number"
                                label="Порядок сортировки"
                                value={sortOrder}
                                onChange={(e) => setSortOrder(Number(e.target.value))}
                            />
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={isActive}
                                        onChange={(e) => setIsActive(e.target.checked)}
                                    />
                                }
                                label="Активен (доступен врачам)"
                            />
                        </Stack>
                        <Box sx={{ pt: 2, display: "flex", gap: 1 }}>
                            <Button fullWidth variant="outlined" onClick={() => setEditDrawerOpen(false)}>Отмена</Button>
                            <Button fullWidth variant="contained" onClick={handleUpdate} startIcon={<SaveOutlined />}>Сохранить</Button>
                        </Box>
                    </Box>
                </Drawer>

                {/* Delete Drawer (Confirmation Panel) */}
                <Drawer
                    anchor="right"
                    open={deleteDrawerOpen}
                    onClose={() => setDeleteDrawerOpen(false)}
                    PaperProps={{ sx: { width: { xs: "100%", sm: 360 }, p: 0 } }}
                >
                    <Box sx={{ p: 3, display: "flex", flexDirection: "column", height: "100%" }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                            <Typography variant="h6">Удаление диагноза</Typography>
                            <IconButton onClick={() => setDeleteDrawerOpen(false)} size="small">
                                <CloseOutlined />
                            </IconButton>
                        </Stack>
                        <Divider sx={{ mb: 3 }} />
                        <Box sx={{ flex: 1 }}>
                            <Typography variant="body1" gutterBottom>
                                Вы уверены, что хотите удалить диагноз:
                            </Typography>
                            <Paper variant="outlined" sx={{ p: 2, bgcolor: "error.lighter", borderColor: "error.light", mb: 3 }}>
                                <Typography variant="subtitle1" color="error.dark" sx={{ fontWeight: 600 }}>
                                    {selectedClinicDiagnosis?.title}
                                </Typography>
                                <Typography variant="caption" color="error.main">
                                    Код: {selectedClinicDiagnosis?.diagnosis_code}
                                </Typography>
                            </Paper>
                            <Typography variant="body2" color="text.secondary">
                                Это действие удалит диагноз из списка клиники. Это не повлияет на уже существующие медицинские заключения.
                            </Typography>
                        </Box>
                        <Box sx={{ pt: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                            <Button fullWidth variant="contained" color="error" onClick={handleDelete} startIcon={<DeleteOutline />}>
                                Да, удалить
                            </Button>
                            <Button fullWidth variant="outlined" onClick={() => setDeleteDrawerOpen(false)}>
                                Отмена
                            </Button>
                        </Box>
                    </Box>
                </Drawer>
            </Box>
        </Box>
    );
};

export default DiagnosesPage;

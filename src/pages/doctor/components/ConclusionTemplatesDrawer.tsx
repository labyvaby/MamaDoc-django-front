import React, { useState, useEffect } from "react";
import {
    Drawer,
    Box,
    Typography,
    Stack,
    Button,
    IconButton,
    CircularProgress,
    Paper,
    Divider,
    Chip,
    Collapse
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { subtleBg } from "../../../theme";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlined from "@mui/icons-material/ExpandLessOutlined";
import CheckCircleOutlineOutlined from "@mui/icons-material/CheckCircleOutlineOutlined";
import { DB_TABLES } from "../../../utility/constants";
import { supabase } from "../../../utility/supabaseClient";

// Элемент диагноза в массиве diagnosis_data медицинского заключения
type ConclusionDiagnosisItem = {
    id: string;
    diagnosis_code: string;
    title: string;
};

// Строка из таблицы MedicalConclusionRevisions (минимально нужные поля)
type MedicalConclusionRevision = {
    id: string;
    created_at: string;
    conclusion: string | null;
    anamnesis: string | null;
    objective: string | null;
    diagnosis_data: ConclusionDiagnosisItem[] | null;
    photo_urls: string[] | null;
    internal_comment: string | null;
    is_template?: boolean;
};

type ConclusionTemplatesDrawerProps = {
    open: boolean;
    onClose: () => void;
    onApplyTemplate: (rev: MedicalConclusionRevision) => void;
};

export const ConclusionTemplatesDrawer: React.FC<ConclusionTemplatesDrawerProps> = ({
    open,
    onClose,
    onApplyTemplate
}) => {
    const [revisions, setRevisions] = useState<MedicalConclusionRevision[]>([]);
    const [loadingRevisions, setLoadingRevisions] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            loadRevisions();
        }
    }, [open]);

    const loadRevisions = async () => {
        try {
            setLoadingRevisions(true);
            const { data, error } = await supabase
                .from(DB_TABLES.MEDICAL_CONCLUSION_REVISIONS)
                .select("*")
                .eq("is_template", true)
                .order("created_at", { ascending: false })
                .limit(20);

            if (error) throw error;
            setRevisions((data ?? []) as MedicalConclusionRevision[]);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingRevisions(false);
        }
    };

    const toggleExpanded = (id: string) => {
        setExpandedId(expandedId === id ? null : id);
    };
    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: {
                    width: { xs: "100%", sm: 440, md: 560 },
                    bgcolor: "background.default"
                }
            }}
        >
            <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                {/* Header */}
                <Box
                    sx={{
                        p: 2,
                        borderBottom: "1px solid",
                        borderColor: "divider",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        bgcolor: "background.paper"
                    }}
                >
                    <Box>
                        <Typography variant="h6">Шаблоны заключений</Typography>
                        <Typography variant="caption" color="text.secondary">
                            Выберите шаблон из истории изменений
                        </Typography>
                    </Box>
                    <IconButton onClick={onClose} size="small">
                        <CloseOutlined />
                    </IconButton>
                </Box>

                {/* Content */}
                <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
                    {loadingRevisions ? (
                        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                            <CircularProgress />
                        </Box>
                    ) : revisions.length === 0 ? (
                        <Box sx={{ textAlign: "center", py: 4, color: "text.secondary" }}>
                            <Typography variant="body2">Нет сохраненных шаблонов</Typography>
                        </Box>
                    ) : (
                        <Stack spacing={2}>
                            {revisions.map((rev) => {
                                const isExpanded = expandedId === rev.id;
                                const hasContent = rev.conclusion || rev.anamnesis || rev.objective;
                                const hasDiagnoses = rev.diagnosis_data && rev.diagnosis_data.length > 0;

                                return (
                                    <Paper
                                        key={rev.id}
                                        variant="outlined"
                                        sx={(t) => ({
                                            overflow: "hidden",
                                            transition: "background-color .15s ease, border-color .15s ease",
                                            "&:hover": {
                                                bgcolor: subtleBg(t, true),
                                                borderColor: alpha(t.palette.primary.main, 0.28)
                                            }
                                        })}
                                    >
                                        {/* Template Card Header */}
                                        <Box
                                            sx={{
                                                p: 2,
                                                cursor: "pointer",
                                                bgcolor: isExpanded ? "action.hover" : "transparent"
                                            }}
                                            onClick={() => toggleExpanded(rev.id)}
                                        >
                                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                                <Box sx={{ flex: 1 }}>
                                                    {/* Diagnosis chips - теперь вверху вместо даты */}
                                                    {hasDiagnoses && (
                                                        <Box sx={{ mb: 1, display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                                                            {rev.diagnosis_data!.slice(0, 3).map((d, i) => (
                                                                <Chip
                                                                    key={i}
                                                                    label={d.title}
                                                                    size="small"
                                                                    color="primary"
                                                                    variant="outlined"
                                                                    sx={{ height: 22, fontSize: "0.75rem", fontWeight: 500 }}
                                                                />
                                                            ))}
                                                            {rev.diagnosis_data!.length > 3 && (
                                                                <Chip
                                                                    label={`+${rev.diagnosis_data!.length - 3}`}
                                                                    size="small"
                                                                    color="primary"
                                                                    variant="outlined"
                                                                    sx={{ height: 22, fontSize: "0.75rem", fontWeight: 500 }}
                                                                />
                                                            )}
                                                        </Box>
                                                    )}

                                                    {/* Preview of conclusion */}
                                                    <Typography
                                                        variant="body2"
                                                        color="text.secondary"
                                                        sx={{
                                                            display: "-webkit-box",
                                                            WebkitLineClamp: isExpanded ? "unset" : 2,
                                                            WebkitBoxOrient: "vertical",
                                                            overflow: "hidden",
                                                            textOverflow: "ellipsis"
                                                        }}
                                                    >
                                                        {rev.conclusion || rev.anamnesis || rev.objective || "Без текста"}
                                                    </Typography>
                                                </Box>

                                                <IconButton size="small" sx={{ ml: 1 }}>
                                                    {isExpanded ? <ExpandLessOutlined /> : <ExpandMoreOutlined />}
                                                </IconButton>
                                            </Stack>
                                        </Box>

                                        {/* Expanded Details */}
                                        <Collapse in={isExpanded}>
                                            <Divider />
                                            <Box sx={{ p: 2, bgcolor: "background.default" }}>
                                                <Stack spacing={2}>
                                                    {/* Diagnoses */}
                                                    {hasDiagnoses && (
                                                        <Box>
                                                            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                                                Диагнозы (МКБ-10)
                                                            </Typography>
                                                            <Box display="flex" gap={0.5} flexWrap="wrap">
                                                                {rev.diagnosis_data!.map((d, i) => (
                                                                    <Chip
                                                                        key={i}
                                                                        label={`${d.title} - ${d.diagnosis_code}`}
                                                                        size="small"
                                                                        variant="outlined"
                                                                    />
                                                                ))}
                                                            </Box>
                                                        </Box>
                                                    )}

                                                    {/* Anamnesis */}
                                                    {rev.anamnesis && (
                                                        <Box>
                                                            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                                                Анамнез
                                                            </Typography>
                                                            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "background.paper" }}>
                                                                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                                                                    {rev.anamnesis}
                                                                </Typography>
                                                            </Paper>
                                                        </Box>
                                                    )}

                                                    {/* Objective */}
                                                    {rev.objective && (
                                                        <Box>
                                                            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                                                Объективно
                                                            </Typography>
                                                            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "background.paper" }}>
                                                                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                                                                    {rev.objective}
                                                                </Typography>
                                                            </Paper>
                                                        </Box>
                                                    )}

                                                    {/* Conclusion */}
                                                    {rev.conclusion && (
                                                        <Box>
                                                            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                                                Заключение
                                                            </Typography>
                                                            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "background.paper" }}>
                                                                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", fontWeight: 500 }}>
                                                                    {rev.conclusion}
                                                                </Typography>
                                                            </Paper>
                                                        </Box>
                                                    )}

                                                    {/* Internal Comment */}
                                                    {rev.internal_comment && (
                                                        <Box>
                                                            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                                                Внутренний комментарий
                                                            </Typography>
                                                            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: (theme) => alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.15 : 0.12) }}>
                                                                <Typography variant="body2">
                                                                    {rev.internal_comment}
                                                                </Typography>
                                                            </Paper>
                                                        </Box>
                                                    )}

                                                    {/* Photos indicator */}
                                                    {rev.photo_urls && rev.photo_urls.length > 0 && (
                                                        <Box>
                                                            <Typography variant="caption" color="text.secondary">
                                                                Фотографии: {rev.photo_urls.length} шт.
                                                            </Typography>
                                                        </Box>
                                                    )}

                                                    {/* Apply Button */}
                                                    <Button
                                                        variant="contained"
                                                        fullWidth
                                                        startIcon={<CheckCircleOutlineOutlined />}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onApplyTemplate(rev);
                                                        }}
                                                        disabled={!hasContent}
                                                    >
                                                        Использовать этот шаблон
                                                    </Button>
                                                </Stack>
                                            </Box>
                                        </Collapse>
                                    </Paper>
                                );
                            })}
                        </Stack>
                    )}
                </Box>
            </Box>
        </Drawer>
    );
};

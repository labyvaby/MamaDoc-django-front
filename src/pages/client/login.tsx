import React, { useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Box,
  Stack,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  CircularProgress,
} from "@mui/material";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
import logo from "../../assets/img/logo.png";
import { supabase } from "../../utility/supabaseClient";
import { PhoneCountryCodeSelect } from "../../components/ui";
import {
  composePhone,
  DEFAULT_PHONE_COUNTRY_CODE,
  getPhoneLocalMaxLength,
  type PhoneCountryCode,
} from "../../utility/phone";
import { useClientSession } from "../../contexts/client-session-context";

const ClientLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { patient, setPatient } = useClientSession();

  const [phoneCountryCode, setPhoneCountryCode] = React.useState<PhoneCountryCode>(DEFAULT_PHONE_COUNTRY_CODE);
  const [phoneLocal, setPhoneLocal] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  useEffect(() => {
    if (patient) navigate("/client/profile", { replace: true });
  }, [patient, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const digits = phoneLocal.replace(/[^0-9]/g, "");
    const maxLen = getPhoneLocalMaxLength(phoneCountryCode);
    if (digits.length < maxLen) {
      setErrorMsg("Введите полный номер телефона");
      return;
    }

    const fullPhone = composePhone(phoneCountryCode, phoneLocal);
    if (!fullPhone) {
      setErrorMsg("Введите номер телефона");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_patient_by_phone", {
        p_phone: fullPhone,
      });

      if (error) throw error;

      const patient = Array.isArray(data) ? data[0] : data;

      if (!patient) {
        setErrorMsg("Номер телефона не найден. Обратитесь в клинику.");
        return;
      }

      setPatient({
        id: patient.id,
        fio: patient.fio,
        phone: patient.phone,
        birth_date: patient.birth_date,
        photo: patient.photo,
      });

      navigate("/client/profile", { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Ошибка. Попробуйте ещё раз.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #e0f7fa 0%, #e8f5e9 100%)",
        px: 2,
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: 400,
          bgcolor: "background.paper",
          borderRadius: 3,
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          p: { xs: 3, sm: 4 },
        }}
      >
        <Stack alignItems="center" spacing={1} mb={3}>
          <Box component="img" src={logo} alt="Мама Доктор" sx={{ height: 56, objectFit: "contain" }} />
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Введите ваш номер телефона для входа в личный кабинет
          </Typography>
        </Stack>

        {errorMsg && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMsg}
          </Alert>
        )}

        <Stack component="form" onSubmit={handleSubmit} spacing={2}>
          <TextField
            value={phoneLocal}
            onChange={(e) => {
              const maxLen = getPhoneLocalMaxLength(phoneCountryCode);
              setPhoneLocal(e.target.value.replace(/[^0-9]/g, "").slice(0, maxLen));
            }}
            fullWidth
            autoFocus
            placeholder={getPhoneLocalMaxLength(phoneCountryCode) === 10 ? "0000000000" : "000000000"}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start" sx={{ mr: 1, ml: "-14px" }}>
                  <PhoneCountryCodeSelect
                    value={phoneCountryCode}
                    onChange={(code) => setPhoneCountryCode(code)}
                  />
                </InputAdornment>
              ),
              endAdornment: loading ? (
                <InputAdornment position="end">
                  <CircularProgress size={20} />
                </InputAdornment>
              ) : (
                <InputAdornment position="end">
                  <PhoneIphoneIcon color="action" />
                </InputAdornment>
              ),
            }}
          />

          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            disabled={loading}
            sx={{ borderRadius: 2, py: 1.5 }}
          >
            {loading ? "Проверка..." : "Войти"}
          </Button>
        </Stack>

        <Typography variant="caption" color="text.disabled" textAlign="center" display="block" mt={3}>
          Для регистрации обратитесь на ресепшен клиники
        </Typography>
      </Box>
    </Box>
  );
};

export default ClientLoginPage;

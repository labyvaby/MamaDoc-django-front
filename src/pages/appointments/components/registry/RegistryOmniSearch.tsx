/**
 * RegistryOmniSearch — командная строка журнала: один инпут вместо Drawer
 * «Фильтры» и ленты аватарок.
 *
 * Ввод предлагает уточнение (пациент / исполнитель / услуга) и превращает его в
 * условие-чип. Условия видны всегда и снимаются по одному; свободный текст
 * работает как прежний поиск по строке.
 */
import React from "react";
import {
  Box,
  Chip,
  ClickAwayListener,
  IconButton,
  InputBase,
  Paper,
  Popper,
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import type { DjangoAppointment } from "../../../../api/appointments";
import { subtleBg } from "../../../../theme";
import { useT } from "../../../../i18n/VerticalProvider";
import {
  suggestTokens,
  tokenKey,
  type RegistryToken,
  type RegistryTokenKind,
  type TokenSuggestion,
} from "./registryFilters";
import type { LinesOf } from "./registryStats";

interface Props {
  items: DjangoAppointment[];
  linesOf: LinesOf;
  tokens: RegistryToken[];
  onTokensChange: (tokens: RegistryToken[]) => void;
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
  /** Подпись группы исполнителей: «Врач» / «Медсестра». */
  employeeGroupLabel: string;
}

export const RegistryOmniSearch: React.FC<Props> = ({
  items,
  linesOf,
  tokens,
  onTokensChange,
  query,
  onQueryChange,
  placeholder,
  employeeGroupLabel,
}) => {
  const { t } = useT("appointments");
  const anchorRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [cursor, setCursor] = React.useState(0);

  const suggestions = React.useMemo(
    () => suggestTokens(items, query, linesOf, tokens),
    [items, query, linesOf, tokens],
  );

  React.useEffect(() => setCursor(0), [query]);

  const groupLabel = (kind: RegistryTokenKind) =>
    kind === "patient"
      ? t("journal.omni.groupPatient")
      : kind === "employee"
      ? employeeGroupLabel
      : t("journal.omni.groupService");

  const addToken = (token: TokenSuggestion) => {
    onTokensChange([...tokens, { kind: token.kind, id: token.id, label: token.label }]);
    onQueryChange("");
    setOpen(false);
    inputRef.current?.focus();
  };

  const removeToken = (token: RegistryToken) => {
    onTokensChange(tokens.filter((item) => tokenKey(item) !== tokenKey(token)));
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Backspace" && !query && tokens.length > 0) {
      onTokensChange(tokens.slice(0, -1));
      return;
    }
    if (!open || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => (c + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => (c - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      addToken(suggestions[cursor]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  // Подсказки группируем на лету: порядок из suggestTokens уже нужный
  // (пациенты → исполнители → услуги), достаточно вставить заголовок при смене.
  let previousKind: RegistryTokenKind | null = null;

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box sx={{ position: "relative" }}>
        <Paper
          ref={anchorRef}
          elevation={0}
          variant="outlined"
          onClick={() => inputRef.current?.focus()}
          sx={(theme) => ({
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 1,
            px: 1.25,
            py: 0.75,
            minHeight: 44,
            cursor: "text",
            transition: "border-color .15s ease",
            "&:focus-within": { borderColor: alpha(theme.palette.primary.main, 0.4) },
          })}
        >
          <SearchOutlined sx={{ fontSize: 19, color: "text.disabled" }} />

          {tokens.map((token) => (
            <Chip
              key={tokenKey(token)}
              size="small"
              onDelete={() => removeToken(token)}
              deleteIcon={<CloseOutlined />}
              label={
                <span>
                  <Box component="span" sx={{ opacity: 0.65, mr: 0.5 }}>
                    {groupLabel(token.kind)}:
                  </Box>
                  {token.label}
                </span>
              }
              sx={(theme) => ({
                height: 26,
                borderRadius: "7px",
                fontWeight: 500,
                color: "primary.onSurface",
                bgcolor: alpha(
                  theme.palette.primary.main,
                  theme.palette.mode === "dark" ? 0.18 : 0.1,
                ),
                "& .MuiChip-deleteIcon": { fontSize: 15, color: "inherit", opacity: 0.6 },
                "& .MuiChip-deleteIcon:hover": { opacity: 1, color: "inherit" },
              })}
            />
          ))}

          <InputBase
            inputRef={inputRef}
            value={query}
            placeholder={tokens.length > 0 ? t("journal.omni.addMore") : placeholder}
            onChange={(event) => {
              onQueryChange(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            sx={{ flex: 1, minWidth: 180, fontSize: 14 }}
          />

          {(query || tokens.length > 0) && (
            <IconButton
              size="small"
              aria-label={t("journal.omni.clear")}
              onClick={(event) => {
                event.stopPropagation();
                onQueryChange("");
                onTokensChange([]);
              }}
              sx={{ color: "text.secondary" }}
            >
              <CloseOutlined sx={{ fontSize: 17 }} />
            </IconButton>
          )}
        </Paper>

        <Popper
          open={open && suggestions.length > 0}
          anchorEl={anchorRef.current}
          placement="bottom-start"
          style={{ zIndex: 1300, width: anchorRef.current?.clientWidth }}
        >
          <Paper
            elevation={0}
            variant="outlined"
            sx={{ mt: 0.75, p: 0.75, maxHeight: 340, overflowY: "auto" }}
          >
            {suggestions.map((item, index) => {
              const showGroup = item.kind !== previousKind;
              previousKind = item.kind;
              return (
                <React.Fragment key={tokenKey(item)}>
                  {showGroup && (
                    <Typography
                      variant="caption"
                      sx={{
                        display: "block",
                        px: 1.25,
                        pt: 1,
                        pb: 0.5,
                        color: "text.disabled",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        fontSize: "0.68rem",
                      }}
                    >
                      {groupLabel(item.kind)}
                    </Typography>
                  )}
                  <Stack
                    direction="row"
                    alignItems="center"
                    gap={1}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => addToken(item)}
                    sx={(theme) => ({
                      px: 1.25,
                      py: 0.75,
                      borderRadius: "8px",
                      cursor: "pointer",
                      bgcolor: index === cursor ? subtleBg(theme, true) : "transparent",
                    })}
                  >
                    <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                      {item.label}
                    </Typography>
                    <Typography variant="caption" color="text.disabled">
                      {item.count}
                    </Typography>
                  </Stack>
                </React.Fragment>
              );
            })}
          </Paper>
        </Popper>
      </Box>
    </ClickAwayListener>
  );
};

export default RegistryOmniSearch;

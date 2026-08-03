/**
 * Backward-compatible re-export.  Page and settings access now live in one
 * registry so menu visibility cannot drift away from route protection.
 */
export {
  SETTINGS_TAB_PERMISSIONS,
  type SettingsTabKey,
} from "./accessPermissions";

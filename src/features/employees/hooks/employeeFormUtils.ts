// Supabase-only form utilities. This file is imported only by Supabase drawers
// (AddEmployeeDrawer, EditEmployeeDrawer) which are loaded via React.lazy —
// so supabaseClient stays out of the Django bundle.
import {
  sanitizeKGLocal,
  isKGLocalValid,
  composeKGPhone,
  parseKGLocalFrom,
  assignEmployeeToServices,
  fetchEmployeeServiceIds,
  replaceEmployeeServices,
} from "../api";
import { fetchServices } from "../../../services/services";
import { translateAuthError } from "./useEmployeesPage";

export const employeeFormUtils = {
  sanitizeKGLocal,
  isKGLocalValid,
  composeKGPhone,
  parseKGLocalFrom,
  assignEmployeeToServices,
  fetchServices,
  fetchEmployeeServiceIds,
  replaceEmployeeServices,
  translateAuthError,
};

import React from "react";
import { IS_DJANGO_BACKEND } from "../../config/backend";
import DjangoPatientsPage from "./DjangoPatientsPage";

// This page only exists in Django backend mode.
// In Supabase mode patient management lives in /patient-search.
const PatientsPage: React.FC = () => {
  if (!IS_DJANGO_BACKEND) return null;
  return <DjangoPatientsPage />;
};

export default PatientsPage;

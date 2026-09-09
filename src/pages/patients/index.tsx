import React from "react";
import { Navigate } from "react-router";
import { useVertical } from "../../i18n/VerticalProvider";
import DjangoPatientsPage from "./DjangoPatientsPage";

const PatientsPage: React.FC = () => {
  const { vertical } = useVertical();
  if (vertical === "retail") return <Navigate to="/clients" replace />;
  return <DjangoPatientsPage />;
};

export default PatientsPage;

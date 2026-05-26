import React from "react";
import { EmployeesPage as FeatureEmployeesPage } from "../../features/employees";

// Thin wrapper: the full implementation now lives in src/features/employees/EmployeesPage.tsx
const EmployeesPageWrapper: React.FC = () => {
  return <FeatureEmployeesPage />;
};

export default EmployeesPageWrapper;

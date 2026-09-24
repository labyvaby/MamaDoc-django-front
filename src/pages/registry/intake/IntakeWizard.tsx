import React from "react";

import type { ActiveScope } from "../../../hooks/useActiveScope";

export interface IntakeWizardProps {
  open: boolean;
  scope: ActiveScope;
  onClose: () => void;
  onDone: () => void;
}

// Мастер постановки — следующим коммитом.
export const IntakeWizard: React.FC<IntakeWizardProps> = () => null;

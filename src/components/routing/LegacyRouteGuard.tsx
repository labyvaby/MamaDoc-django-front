import { Navigate } from "react-router";
import { IS_DJANGO_BACKEND } from "../../config/backend";

type Props = {
  redirectTo: string;
  children: React.ReactNode;
};

/**
 * Blocks legacy Supabase-only routes in Django mode.
 * In Supabase mode the children render normally.
 */
export const LegacyRouteGuard: React.FC<Props> = ({ redirectTo, children }) => {
  if (IS_DJANGO_BACKEND) {
    return <Navigate to={redirectTo} replace />;
  }
  return <>{children}</>;
};

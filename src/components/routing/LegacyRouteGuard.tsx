import { Navigate } from "react-router";
import { IS_DJANGO_BACKEND } from "../../config/backend";
import { DjangoUnderConstructionPage } from "./DjangoUnderConstructionPage";

type Props = {
  children: React.ReactNode;
  /**
   * Truly-wrong alias only: in Django mode redirect here instead of mounting
   * the legacy Supabase page. Used when there is a real Django equivalent
   * (e.g. /patient-search → /patients).
   */
  redirectTo?: string;
  /**
   * Under-construction placeholder. When set, Django mode renders
   * DjangoUnderConstructionPage (the menu item stays, the page opens as
   * "в разработке") instead of redirecting away or hitting Supabase.
   */
  title?: string;
  description?: string;
  backTo?: string;
};

/**
 * Guards legacy Supabase-only routes in Django mode.
 *
 * - In Supabase mode children always render normally.
 * - In Django mode:
 *     • `title` set  → show the under-construction placeholder (preferred for
 *       product routes — the section must not disappear from the menu);
 *     • only `redirectTo` set → redirect (for true aliases that have a Django page).
 */
export const LegacyRouteGuard: React.FC<Props> = ({
  children,
  redirectTo,
  title,
  description,
  backTo,
}) => {
  if (IS_DJANGO_BACKEND) {
    if (title) {
      return (
        <DjangoUnderConstructionPage
          title={title}
          description={description}
          backTo={backTo}
        />
      );
    }
    if (redirectTo) {
      return <Navigate to={redirectTo} replace />;
    }
  }
  return <>{children}</>;
};

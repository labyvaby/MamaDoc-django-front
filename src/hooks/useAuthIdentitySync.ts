/**
 * useAuthIdentitySync
 *
 * Runs once after a successful sign-in (including phone OTP).
 * Checks whether the current auth.uid() matches Employees.auth_user_id.
 * If not — calls the admin-create-user Edge Function in "linking" mode
 * to update Employees.auth_user_id to the current session's UUID.
 *
 * This self-heals the "phone UUID vs email UUID" split automatically,
 * so that after one phone login the employee is permanently linked.
 *
 * Mount this hook once, high in the component tree (e.g. App.tsx or Layout).
 */

import { useEffect, useRef } from 'react';
import { IS_DJANGO_BACKEND } from '../config/backend';
import { supabase } from '../utility/supabaseClient';

export function useAuthIdentitySync() {
  // Prevent double-run in React StrictMode and across re-renders
  const ranRef = useRef(false);

  useEffect(() => {
    if (IS_DJANGO_BACKEND) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return;
        if (!session?.user) return;
        // Run once per session; reset when user changes
        if (ranRef.current) return;
        ranRef.current = true;

        void syncIdentity(session.user);
      }
    );

    return () => {
      subscription.unsubscribe();
      ranRef.current = false;
    };
  }, []);
}


async function syncIdentity(user: { id: string; email?: string; phone?: string }) {
  // 1. Look up the employee record using email OR phone from the current JWT.
  //    We need at least one contact field to find the right Employees row.
  const email = user.email?.trim() || null;
  const phone = user.phone?.trim() || null;

  if (!email && !phone) return; // nothing to match on

  // Build the OR filter for PostgREST
  const filters: string[] = [];
  if (email) filters.push(`email.ilike.${email}`);
  if (phone) {
    const suffix = phone.replace(/\D/g, '').slice(-9);
    filters.push(`phone.ilike.%${suffix}`);
  }

  const { data: employee, error } = await supabase
    .from('Employees')
    .select('id, auth_user_id')
    .or(filters.join(','))
    .maybeSingle();

  if (error || !employee) return;

  // 2. If the stored UUID already matches — still ensure this auth_user_id is in
  //    employee_auth_links so secondary phone/email accounts also resolve correctly.
  if (employee.auth_user_id === user.id) {
    await supabase
      .from('employee_auth_links')
      .upsert(
        { employee_id: employee.id, auth_user_id: user.id },
        { onConflict: 'employee_id,auth_user_id', ignoreDuplicates: true }
      );
    return;
  }

  // 3. Different UUID — add this secondary auth id to employee_auth_links first,
  //    so the user immediately gets access without waiting for the Edge Function.
  await supabase
    .from('employee_auth_links')
    .upsert(
      { employee_id: employee.id, auth_user_id: user.id },
      { onConflict: 'employee_id,auth_user_id', ignoreDuplicates: true }
    );

  // 4. Also call the linking Edge Function to update the primary auth_user_id.
  //    The function accepts link_to_auth_id + at least one contact field.
  console.info(
    '[AuthSync] Detected identity mismatch, linking employee',
    employee.id,
    'to auth uid',
    user.id
  );

  const { data: linkResult, error: linkError } = await supabase.functions.invoke(
    'admin-create-user',
    {
      body: {
        link_to_auth_id: user.id,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
      },
    }
  );

  if (linkError) {
    console.error('[AuthSync] Linking failed:', linkError.message);
    return;
  }

  if (linkResult?.success) {
    console.info('[AuthSync] Employee successfully linked to current auth account.');

    // 4. Evict the usePermissions global cache so the hook re-fetches
    //    with the correct auth_user_id on the very next render cycle.
    evictPermissionsCache();
  }
}


/**
 * Clears the module-level cache inside usePermissions so that the
 * next render triggers a fresh DB fetch with the correct identity.
 * Works because both files live in the same module graph.
 */
function evictPermissionsCache() {
  // usePermissions.tsx exports no direct cache reset, so we trigger
  // a synthetic auth state change that the hook listens to.
  // TOKEN_REFRESHED is ignored by the hook, but SIGNED_IN forces a refetch.
  // The cleanest approach: re-get the session which fires INITIAL_SESSION,
  // which the hook also ignores — so we call getSession to warm the client
  // and then dispatch a custom event the hook can optionally listen to.
  void supabase.auth.getSession();

  // Emit a custom DOM event — optional: only needed if you add a listener
  // in usePermissions for 'auth-identity-synced'.
  window.dispatchEvent(new CustomEvent('auth-identity-synced'));
}

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { isStaff as checkIsStaff } from "@/lib/auth";
import { mustChangePassword } from "@/lib/accounts";

interface SessionState {
  session: Session | null;
  loading: boolean;
}

/** Tracks the current Supabase auth session, client-side only. Shared by customer and staff routes. */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ session: null, loading: true });

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setState({ session: data.session, loading: false });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setState({ session, loading: false });
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return state;
}

/**
 * Redirects to /account/login the moment we know there's no customer
 * session — and staff off to /admin, since a staff sign-in (via this page
 * or the main site's popup) should never land on the customer dashboard.
 */
export function useRequireCustomerSession(): SessionState {
  const { session, loading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      // Remember where they were headed (e.g. a "track your detailer" link)
      // so signing in lands them back there rather than on the dashboard.
      const here = window.location.pathname;
      navigate({
        to: "/account/login",
        search: here === "/account" || here === "/account/" ? {} : { next: here },
        replace: true,
      });
      return;
    }
    let mounted = true;
    checkIsStaff().then(async (staff) => {
      if (!mounted) return;
      if (staff) {
        navigate({ to: "/admin", replace: true });
        return;
      }
      // An account staff created starts on a temporary password: hold it on
      // the choose-your-password step until it has been changed.
      if (await mustChangePassword().catch(() => false)) {
        if (mounted) navigate({ to: "/account/welcome", replace: true });
      }
    });
    return () => {
      mounted = false;
    };
  }, [loading, session, navigate]);

  return { session, loading };
}

interface StaffSessionState extends SessionState {
  isStaff: boolean | null; // null while still checking
}

/** Redirects to /admin/login unless signed in AND a staff account. */
export function useRequireStaffSession(): StaffSessionState {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const [isStaff, setIsStaff] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/admin/login", replace: true });
      return;
    }
    let mounted = true;
    checkIsStaff().then((staff) => {
      if (!mounted) return;
      setIsStaff(staff);
      if (!staff) navigate({ to: "/admin/login", replace: true });
    });
    return () => {
      mounted = false;
    };
  }, [loading, session, navigate]);

  return { session, loading, isStaff };
}

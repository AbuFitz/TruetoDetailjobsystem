/** Staff tools for customer sign-ins, and the customer's own "choose a new password" step. */
import { supabase } from "./supabase";

export interface TempCredentials {
  email: string;
  temp_password: string;
}

export async function createCustomerAccount(
  customerId: string,
  tempPassword?: string,
): Promise<TempCredentials> {
  const { data, error } = await supabase.rpc("admin_create_customer_account", {
    p_customer_id: customerId,
    p_temp_password: tempPassword ?? null,
  });
  if (error) throw new Error(error.message, { cause: error });
  return data as TempCredentials;
}

export async function resetCustomerPassword(
  customerId: string,
  tempPassword?: string,
): Promise<TempCredentials> {
  const { data, error } = await supabase.rpc("admin_reset_customer_password", {
    p_customer_id: customerId,
    p_temp_password: tempPassword ?? null,
  });
  if (error) throw new Error(error.message, { cause: error });
  return data as TempCredentials;
}

/** Called after the customer sets their own password; clears the "change your password" step. */
export async function confirmPasswordChanged(): Promise<void> {
  const { error } = await supabase.rpc("customer_password_changed");
  if (error) throw new Error(error.message, { cause: error });
}

export async function mustChangePassword(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("customers")
    .select("must_change_password")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return Boolean((data as { must_change_password?: boolean } | null)?.must_change_password);
}

/** Sends the self-service reset email. Always looks successful, so it never reveals who has an account. */
export async function requestPasswordReset(email: string): Promise<void> {
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/account/reset`,
  });
}

export async function signUpWithEmail(input: {
  email: string;
  password: string;
  firstName: string;
  phone?: string | undefined;
}): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: `${window.location.origin}/account`,
      data: { first_name: input.firstName, phone: input.phone ?? null },
    },
  });
  if (error) throw new Error(error.message, { cause: error });
  return { needsConfirmation: !data.session };
}

/**
 * Shared Supabase Auth plumbing for both customer and staff sign-in. There
 * is exactly one auth system in this app (unlike FixNow, where only admin
 * had accounts) — `public.is_staff()` / `isStaff()` below is what tells a
 * staff account apart from an ordinary customer one, not a separate login.
 */
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export interface SignUpInput {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  phone?: string;
}

export async function signUpCustomer(input: SignUpInput): Promise<void> {
  const { error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        first_name: input.firstName,
        last_name: input.lastName ?? null,
        phone: input.phone ?? null,
      },
    },
  });
  if (error) throw new Error(error.message, { cause: error });
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message, { cause: error });
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** True if the signed-in user has a row in staff_users (True To Detail staff). */
export async function isStaff(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_staff");
  if (error) return false;
  return Boolean(data);
}

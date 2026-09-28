import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export interface Customer {
  id: string;
  auth_user_id: string | null;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
}

function dbError(error: PostgrestError, fallback: string): Error {
  return new Error(error.message ? `${fallback} (${error.message})` : fallback, { cause: error });
}

export async function getMyProfile(): Promise<Customer | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) throw dbError(error, "Couldn't load your profile.");
  return data as Customer | null;
}

/**
 * The signed-in user's own customers.id — their identity row, no longer the
 * same value as their auth user id now that a customer can exist without a
 * login (a staff-created walk-in). Null if signed out, or if the signed-in
 * account has no customers row at all (e.g. staff). Every "mine" query for
 * addresses/vehicles/bookings needs this rather than the raw auth user id.
 */
export async function getMyCustomerId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) throw dbError(error, "Couldn't load your account.");
  return (data as { id: string } | null)?.id ?? null;
}

export interface WalkInCustomerInput {
  first_name: string;
  last_name?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
}

/**
 * Staff-only: creates a customer record with no login — for booking someone
 * in who hasn't signed up. If they later sign up with a matching email,
 * handle_new_user() links their new account onto this same row instead of
 * creating a duplicate, so their history carries over.
 */
export async function createWalkInCustomer(input: WalkInCustomerInput): Promise<Customer> {
  const { data, error } = await supabase.from("customers").insert(input).select("*").single();
  if (error) throw dbError(error, "Couldn't create this customer.");
  return data as Customer;
}

export interface CustomerProfileUpdate {
  first_name?: string;
  last_name?: string | null;
  phone?: string | null;
}

/** Staff-only: every customer, signed up or walk-in — for the admin "Customers" list. */
export async function listCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw dbError(error, "Couldn't load customers.");
  return (data ?? []) as Customer[];
}

/** Staff-only: a specific customer, for the admin customer detail page. */
export async function getCustomerById(id: string): Promise<Customer> {
  const { data, error } = await supabase.from("customers").select("*").eq("id", id).single();
  if (error) throw dbError(error, "Couldn't load this customer.");
  return data as Customer;
}

export interface StaffCustomerUpdate {
  first_name?: string;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
}

/** Staff-only: edits any customer's identity details, signed up or walk-in. */
export async function updateCustomer(id: string, patch: StaffCustomerUpdate): Promise<Customer> {
  const { data, error } = await supabase
    .from("customers")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw dbError(error, "Couldn't update this customer.");
  return data as Customer;
}

/** Staff-only: search customers by name/email/phone, for the "New booking" flow. */
export async function searchCustomers(query: string): Promise<Customer[]> {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
    .limit(10);
  if (error) throw dbError(error, "Couldn't search customers.");
  return (data ?? []) as Customer[];
}

export async function updateMyProfile(patch: CustomerProfileUpdate): Promise<Customer> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data, error } = await supabase
    .from("customers")
    .update(patch)
    .eq("auth_user_id", user.id)
    .select("*")
    .single();
  if (error) throw dbError(error, "Couldn't update your profile.");
  return data as Customer;
}

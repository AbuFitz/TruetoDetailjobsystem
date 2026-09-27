import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export interface Customer {
  id: string;
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
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw dbError(error, "Couldn't load your profile.");
  return data as Customer | null;
}

export interface CustomerProfileUpdate {
  first_name?: string;
  last_name?: string | null;
  phone?: string | null;
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
    .eq("id", user.id)
    .select("*")
    .single();
  if (error) throw dbError(error, "Couldn't update your profile.");
  return data as Customer;
}

import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type AddressLabel = "Home" | "Work" | "Other";

export interface CustomerAddress {
  id: string;
  customer_id: string;
  label: AddressLabel;
  line1: string;
  line2: string | null;
  city: string | null;
  postcode: string;
  lat: number | null;
  lng: number | null;
  is_default: boolean;
  created_at: string;
}

const TABLE = "customer_addresses";

function dbError(error: PostgrestError, fallback: string): Error {
  return new Error(error.message ? `${fallback} (${error.message})` : fallback, { cause: error });
}

export async function listMyAddresses(): Promise<CustomerAddress[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  // Explicit customer_id filter, not just RLS: a staff caller's RLS grant is
  // "any row", so without this a staff account would get every customer's
  // addresses back instead of their own (staff don't normally call this —
  // see getCustomerAddresses for the admin "view this customer" case — but
  // the function name promises "mine", so it must actually mean that).
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("customer_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw dbError(error, "Couldn't load your addresses.");
  return (data ?? []) as CustomerAddress[];
}

/** Staff-only: a specific customer's saved addresses (for the "New booking" flow). */
export async function getCustomerAddresses(customerId: string): Promise<CustomerAddress[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("customer_id", customerId)
    .order("is_default", { ascending: false });
  if (error) throw dbError(error, "Couldn't load this customer's addresses.");
  return (data ?? []) as CustomerAddress[];
}

export interface AddressInput {
  label: AddressLabel;
  line1: string;
  line2?: string | undefined;
  city?: string | undefined;
  postcode: string;
  lat?: number | undefined;
  lng?: number | undefined;
  is_default?: boolean | undefined;
}

export async function createAddress(input: AddressInput): Promise<CustomerAddress> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...input, customer_id: user.id })
    .select("*")
    .single();
  if (error) throw dbError(error, "Couldn't save this address.");
  return data as CustomerAddress;
}

export async function updateAddress(
  id: string,
  patch: Partial<AddressInput>,
): Promise<CustomerAddress> {
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw dbError(error, "Couldn't update this address.");
  return data as CustomerAddress;
}

export async function deleteAddress(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw dbError(error, "Couldn't remove this address.");
}

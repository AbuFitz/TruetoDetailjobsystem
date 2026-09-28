import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { getMyCustomerId } from "./customers";

export interface Vehicle {
  id: string;
  customer_id: string;
  make: string | null;
  model: string | null;
  registration: string;
  colour: string | null;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
}

const TABLE = "vehicles";

function dbError(error: PostgrestError, fallback: string): Error {
  return new Error(error.message ? `${fallback} (${error.message})` : fallback, { cause: error });
}

export function vehicleDescription(v: Pick<Vehicle, "make" | "model">): string | null {
  const parts = [v.make, v.model].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

export async function listMyVehicles(): Promise<Vehicle[]> {
  const customerId = await getMyCustomerId();
  if (!customerId) return [];
  // See listMyAddresses's comment: a staff caller's RLS grant is "any row",
  // so this filter is what actually makes "mine" mean mine.
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: true });
  if (error) throw dbError(error, "Couldn't load your garage.");
  return (data ?? []) as Vehicle[];
}

/** Staff-only: a specific customer's saved vehicles (for the "New booking" flow). */
export async function getCustomerVehicles(customerId: string): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: true });
  if (error) throw dbError(error, "Couldn't load this customer's vehicles.");
  return (data ?? []) as Vehicle[];
}

export interface VehicleInput {
  make?: string | undefined;
  model?: string | undefined;
  registration: string;
  colour?: string | undefined;
  photo_url?: string | undefined;
  notes?: string | undefined;
}

export async function createVehicle(input: VehicleInput): Promise<Vehicle> {
  const customerId = await getMyCustomerId();
  if (!customerId) throw new Error("Not signed in.");
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...input, customer_id: customerId })
    .select("*")
    .single();
  if (error) throw dbError(error, "Couldn't save this vehicle.");
  return data as Vehicle;
}

/** Staff-only: adds a saved vehicle directly onto a given customer (e.g. the "New booking" flow). */
export async function createVehicleForCustomer(
  customerId: string,
  input: VehicleInput,
): Promise<Vehicle> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...input, customer_id: customerId })
    .select("*")
    .single();
  if (error) throw dbError(error, "Couldn't save this vehicle.");
  return data as Vehicle;
}

export async function updateVehicle(id: string, patch: Partial<VehicleInput>): Promise<Vehicle> {
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw dbError(error, "Couldn't update this vehicle.");
  return data as Vehicle;
}

export async function deleteVehicle(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw dbError(error, "Couldn't remove this vehicle.");
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, Check, Link2, Mail, MapPin, Phone, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/ttd/AppShell";
import { StatusBadge } from "@/components/ttd/StatusBadge";
import { VehicleCard } from "@/components/ttd/VehicleTag";
import { BookingTimeline, timelineForStatus } from "@/components/ttd/BookingTimeline";
import { StageChecklist } from "@/components/ttd/StageChecklist";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { useRequireStaffSession } from "@/hooks/use-session";
import {
  assignDetailer,
  cancelBooking,
  confirmRequest,
  getBookingById,
  setTravelTimeMinutes,
  updateBookingDetails,
  CANCELLATION_REASONS,
  type CancellationReason,
} from "@/lib/bookings";
import { listDetailers } from "@/lib/detailers";
import { getCustomerById } from "@/lib/customers";
import { getCheckInForBooking, listCheckInPhotos } from "@/lib/checkin";
import { formatAppointment, formatRelativeUpdate } from "@/lib/format";
import { sendBookingEmail, type BookingEmailKind } from "@/lib/portal-email";
import { formatDuration } from "@/lib/progress";
import { ttdSiteLinks } from "@/lib/constants";
import { geocodePostcode } from "@/lib/postcode";
import { copyText } from "@/lib/clipboard";
import { supabase } from "@/lib/supabase";
import type { StageProgress } from "@/lib/detailers";

export const Route = createFileRoute("/admin/bookings/$id")({
  head: () => ({
    meta: [{ title: "Booking | True To Detail" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminBookingDetail,
});

function AdminBookingDetail() {
  useRequireStaffSession();
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [cancelReason, setCancelReason] = useState<CancellationReason>("Customer cancelled");
  const [travelInput, setTravelInput] = useState("");

  const { data: booking, isLoading } = useQuery({
    queryKey: ["admin-booking", id],
    queryFn: () => getBookingById(id),
    refetchInterval: 8_000,
  });
  const { data: detailers } = useQuery({ queryKey: ["admin-detailers"], queryFn: listDetailers });
  const { data: customer } = useQuery({
    queryKey: ["admin-customer", booking?.customer_id],
    queryFn: () => getCustomerById(booking!.customer_id),
    enabled: Boolean(booking),
  });
  const { data: checkIn } = useQuery({
    queryKey: ["check-in", id],
    queryFn: () => getCheckInForBooking(id),
    enabled: Boolean(booking),
  });
  const { data: photos } = useQuery({
    queryKey: ["check-in-photos", checkIn?.id],
    queryFn: () => listCheckInPhotos(checkIn!.id),
    enabled: Boolean(checkIn),
  });
  const { data: stages } = useQuery({
    queryKey: ["admin-booking-stages", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_stage_progress")
        .select("stage_key, completed_at")
        .eq("booking_id", id);
      if (error) throw error;
      return data as unknown as StageProgress[];
    },
    enabled:
      booking?.status === "in_progress" ||
      booking?.status === "qc" ||
      booking?.status === "handover" ||
      booking?.status === "completed",
  });

  const { data: sentEmails } = useQuery({
    queryKey: ["booking-notifications", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_notifications")
        .select("kind, sent_at")
        .eq("booking_id", id);
      if (error) throw error;
      return (data ?? []) as { kind: BookingEmailKind; sent_at: string }[];
    },
    enabled: Boolean(booking),
    refetchInterval: 15_000,
  });

  const [addr, setAddr] = useState({ line1: "", line2: "", city: "", postcode: "" });
  const [addrOpen, setAddrOpen] = useState(false);
  const [pickDetailer, setPickDetailer] = useState("");
  const [emailNote, setEmailNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const emailMutation = useMutation({
    mutationFn: ({ kind, force }: { kind: BookingEmailKind; force?: boolean }) =>
      sendBookingEmail(id, kind, force ? { force: true } : {}),
    onSuccess: (res) => {
      setEmailNote(res.sent ? "Email sent." : `Not sent: ${res.reason ?? "unknown reason"}`);
      void queryClient.invalidateQueries({ queryKey: ["booking-notifications", id] });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      await confirmRequest(id, booking?.service_postcode);
      return sendBookingEmail(id, "booked_in");
    },
    onSuccess: (res) => {
      setEmailNote(
        res.sent
          ? "Confirmed. The customer has been emailed."
          : `Confirmed. Email not sent: ${res.reason ?? "unknown reason"}`,
      );
      void queryClient.invalidateQueries({ queryKey: ["admin-booking", id] });
      void queryClient.invalidateQueries({ queryKey: ["booking-notifications", id] });
    },
  });

  async function saveAddress() {
    const postcode = addr.postcode.trim() || booking?.service_postcode || "";
    let coords: { destination_lat: number; destination_lng: number } | Record<string, never> = {};
    try {
      const g = await geocodePostcode(postcode);
      coords = { destination_lat: g.lat, destination_lng: g.lng };
    } catch {
      coords = {};
    }
    await updateBookingDetails(id, {
      service_address_line1: addr.line1.trim(),
      service_address_line2: addr.line2.trim() || null,
      service_address_city: addr.city.trim() || null,
      service_postcode: postcode.toUpperCase(),
      ...coords,
    });
  }

  const addressMutation = useMutation({
    mutationFn: saveAddress,
    onSuccess: () => {
      setAddrOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["admin-booking", id] });
    },
  });

  // One button for a website request: address, confirm, detailer and both emails.
  const confirmAssignMutation = useMutation({
    mutationFn: async () => {
      if (needsAddressNow && addr.line1.trim()) await saveAddress();
      await confirmRequest(id, addr.postcode.trim() || booking?.service_postcode);
      const notes: string[] = [];
      const booked = await sendBookingEmail(id, "booked_in");
      notes.push(
        booked.sent
          ? "Customer emailed their booking."
          : `Booking email not sent: ${booked.reason ?? "unknown reason"}`,
      );
      if (pickDetailer) {
        await assignDetailer(id, pickDetailer);
        const assigned = await sendBookingEmail(id, "assigned");
        if (assigned.sent) notes.push("Customer told who their detailer is.");
      }
      return notes.join(" ");
    },
    onSuccess: (note) => {
      setEmailNote(note);
      void queryClient.invalidateQueries({ queryKey: ["admin-booking", id] });
      void queryClient.invalidateQueries({ queryKey: ["booking-notifications", id] });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (detailerId: string) => {
      await assignDetailer(id, detailerId);
      return sendBookingEmail(id, "assigned");
    },
    onSuccess: (res) => {
      setEmailNote(res.sent ? "Detailer assigned. The customer has been emailed." : null);
      void queryClient.invalidateQueries({ queryKey: ["admin-booking", id] });
      void queryClient.invalidateQueries({ queryKey: ["booking-notifications", id] });
    },
  });

  const travelMutation = useMutation({
    mutationFn: (minutes: number | null) => setTravelTimeMinutes(id, minutes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-booking", id] }),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      await cancelBooking(id, cancelReason);
      return sendBookingEmail(id, "cancelled");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-booking", id] });
      void queryClient.invalidateQueries({ queryKey: ["booking-notifications", id] });
    },
  });

  if (isLoading || !booking) {
    return (
      <div className="min-h-screen bg-background">
        <BrandedLoading label="Loading booking" />
      </div>
    );
  }

  const { dayLabel, timeLabel } = formatAppointment(booking.scheduled_start);
  const detailerLink = booking.detailer
    ? `${window.location.origin}/d/${booking.detailer.link_token}`
    : null;

  const needsAddress = booking.service_address_line1 === "Address to be confirmed";
  const needsAddressNow = needsAddress;
  const trackUrl = `${ttdSiteLinks.website}/account/track/${booking.tracking_token}`;
  async function copyTrackLink() {
    const ok = await copyText(trackUrl);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2500);
  }
  const EMAIL_LABELS: Record<BookingEmailKind, string> = {
    booked_in: "Booked in",
    assigned: "Detailer assigned",
    on_the_way: "On the way",
    completed: "Job complete",
    cancelled: "Cancelled",
  };
  const sentKinds = new Map((sentEmails ?? []).map((e) => [e.kind, e.sent_at]));

  return (
    <AppShell
      area="admin"
      eyebrow={booking.booking_reference}
      title={booking.package_name}
      back={{ to: "/admin", label: "Today" }}
      actions={<StatusBadge status={booking.status} />}
    >
      {booking.status === "requested" ? (
        <div className="mb-5 rounded-2xl border border-warning/40 bg-warning/8 p-5">
          <p className="font-display text-[26px] leading-none">NEEDS CONFIRMING</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            This came in from the website. One button books it in, plots the address, assigns a
            detailer and emails the customer their booking and tracking link.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {needsAddressNow ? (
              <>
                <div>
                  <label htmlFor="req-line1" className="eyebrow block text-muted-foreground">
                    House number and street
                  </label>
                  <input
                    id="req-line1"
                    value={addr.line1}
                    onChange={(e) => setAddr((a) => ({ ...a, line1: e.target.value }))}
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-surface px-3.5 text-sm outline-none focus:border-signal"
                  />
                </div>
                <div>
                  <label htmlFor="req-city" className="eyebrow block text-muted-foreground">
                    Town or city
                  </label>
                  <input
                    id="req-city"
                    value={addr.city}
                    onChange={(e) => setAddr((a) => ({ ...a, city: e.target.value }))}
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-surface px-3.5 text-sm outline-none focus:border-signal"
                  />
                </div>
              </>
            ) : null}
            <div className={needsAddressNow ? "sm:col-span-2" : ""}>
              <label htmlFor="req-detailer" className="eyebrow block text-muted-foreground">
                Detailer (optional, you can assign later)
              </label>
              <select
                id="req-detailer"
                value={pickDetailer}
                onChange={(e) => setPickDetailer(e.target.value)}
                className="select-field mt-1.5 min-h-11 w-full rounded-xl border border-input bg-surface px-3.5 text-sm outline-none focus:border-signal"
              >
                <option value="">Decide later</option>
                {(detailers ?? [])
                  .filter((d) => d.active)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          {confirmAssignMutation.isError ? (
            <p role="alert" className="mt-3 text-[13px] text-destructive">
              {confirmAssignMutation.error instanceof Error
                ? confirmAssignMutation.error.message
                : "Couldn't confirm this booking."}
            </p>
          ) : null}
          <PrimaryActionButton
            className="mt-4"
            loading={confirmAssignMutation.isPending}
            onClick={() => confirmAssignMutation.mutate()}
          >
            {pickDetailer ? "Confirm and assign" : "Confirm booking"}
          </PrimaryActionButton>
        </div>
      ) : null}
      {emailNote ? (
        <p className="mb-4 rounded-xl bg-surface-2 px-4 py-3 text-[13px] font-medium">
          {emailNote}
        </p>
      ) : null}

      <div className="lg:columns-2 lg:gap-5">
        <section className="mb-4 break-inside-avoid rounded-2xl border border-hairline bg-surface p-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <p className="mono-ref text-muted-foreground">{booking.booking_reference}</p>
            </div>
          </div>

          <VehicleCard
            className="mt-4 rounded-xl border-0 bg-surface-2 p-3"
            vehicle={{
              description: booking.vehicle_description,
              registration: booking.vehicle_registration,
            }}
          />

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Tile icon={CalendarClock} label="Scheduled">
              {dayLabel}, {timeLabel}
            </Tile>
            <Tile icon={MapPin} label="Address">
              {booking.service_address_line1}, {booking.service_postcode}
              {!needsAddress ? (
                <button
                  type="button"
                  onClick={() => {
                    setAddr({
                      line1: booking.service_address_line1,
                      line2: booking.service_address_line2 ?? "",
                      city: booking.service_address_city ?? "",
                      postcode: booking.service_postcode,
                    });
                    setAddrOpen(true);
                  }}
                  className="mt-1 block text-[12px] font-medium text-muted-foreground underline underline-offset-2"
                >
                  Edit
                </button>
              ) : null}
            </Tile>
          </div>

          <dl className="mt-4 flex flex-col gap-2 text-[14px]">
            {booking.addon_labels.length > 0 ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Add-ons</dt>
                <dd className="text-right font-medium">{booking.addon_labels.join(", ")}</dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-4 border-t border-hairline pt-3">
              <dt className="eyebrow text-foreground">Total</dt>
              <dd className="font-display text-[28px] leading-none">£{booking.price.toFixed(2)}</dd>
            </div>
          </dl>
          {booking.customer_notes ? (
            <p className="mt-3 rounded-xl bg-surface-2 px-3.5 py-3 text-[13px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Customer notes: </span>
              {booking.customer_notes}
            </p>
          ) : null}
          {booking.internal_notes ? (
            <p className="mt-2 rounded-xl border border-signal/25 bg-signal/8 px-3.5 py-3 text-[13px] leading-relaxed text-foreground">
              <span className="font-semibold">Job notes for the detailer: </span>
              {booking.internal_notes}
            </p>
          ) : null}
        </section>

        {customer ? (
          <section className="mb-4 break-inside-avoid rounded-2xl border border-hairline bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="eyebrow text-muted-foreground">Customer</p>
                <Link
                  to="/admin/customers/$id"
                  params={{ id: customer.id }}
                  className="mt-1 block truncate text-[16px] font-semibold underline-offset-2 hover:underline"
                >
                  {customer.first_name} {customer.last_name}
                </Link>
              </div>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  customer.auth_user_id
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-hairline bg-surface-2 text-muted-foreground"
                }`}
              >
                {customer.auth_user_id ? "Signed up" : "Walk-in"}
              </span>
            </div>
            {customer.phone || customer.email ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {customer.phone ? (
                  <a
                    href={`tel:${customer.phone.replace(/\s+/g, "")}`}
                    className="press inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-hairline bg-surface-2 text-[13px] font-semibold"
                  >
                    <Phone className="h-4 w-4" strokeWidth={2.2} />
                    {customer.phone}
                  </a>
                ) : null}
                {customer.email ? (
                  <a
                    href={`mailto:${customer.email}`}
                    className="press inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-hairline bg-surface-2 px-2 text-[13px] font-semibold"
                  >
                    <Mail className="h-4 w-4 shrink-0" strokeWidth={2.2} />
                    <span className="truncate">Email</span>
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-[13px] text-muted-foreground">No contact details saved.</p>
            )}
          </section>
        ) : null}

        {(needsAddress && booking.status !== "requested") || addrOpen ? (
          <section className="mb-4 break-inside-avoid rounded-2xl border border-warning/40 bg-warning/8 p-5">
            <p className="eyebrow text-warning-text">
              {needsAddress ? "Full address needed" : "Edit address"}
            </p>
            {needsAddress ? (
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                The website only asks for a postcode. Get the full address from the customer, then
                save it here so the detailer and the customer&rsquo;s map know where to go.
              </p>
            ) : null}
            <div className="mt-3 grid gap-2.5">
              {(
                [
                  ["line1", "House number and street"],
                  ["line2", "Flat or building (optional)"],
                  ["city", "Town or city"],
                  ["postcode", "Postcode"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label htmlFor={`addr-${key}`} className="eyebrow block text-muted-foreground">
                    {label}
                  </label>
                  <input
                    id={`addr-${key}`}
                    value={
                      addr[key] ||
                      (key === "postcode" && !addr.postcode ? booking.service_postcode : "")
                    }
                    onChange={(e) => setAddr((a) => ({ ...a, [key]: e.target.value }))}
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-surface px-3.5 text-sm outline-none focus:border-signal"
                  />
                </div>
              ))}
            </div>
            {addressMutation.isError ? (
              <p role="alert" className="mt-2 text-[13px] text-destructive">
                {addressMutation.error instanceof Error
                  ? addressMutation.error.message
                  : "Couldn't save the address."}
              </p>
            ) : null}
            <PrimaryActionButton
              className="mt-3"
              size="md"
              loading={addressMutation.isPending}
              disabled={!addr.line1.trim()}
              onClick={() => addressMutation.mutate()}
            >
              Save address
            </PrimaryActionButton>
          </section>
        ) : null}

        <section className="mb-4 break-inside-avoid rounded-2xl border border-hairline bg-surface p-5">
          <label htmlFor="assign-detailer" className="eyebrow block text-muted-foreground">
            Detailer
          </label>
          <select
            id="assign-detailer"
            value={booking.assigned_detailer_id ?? ""}
            onChange={(e) => e.target.value && assignMutation.mutate(e.target.value)}
            className="select-field mt-2 min-h-11 w-full rounded-xl border border-input bg-surface-2 px-3.5 text-sm outline-none focus:border-signal"
          >
            <option value="">Unassigned</option>
            {(detailers ?? [])
              .filter((d) => d.active)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
          {detailerLink ? (
            <p className="mt-2 truncate text-[12px] text-muted-foreground">
              Detailer link:{" "}
              <a href={detailerLink} className="underline">
                {detailerLink}
              </a>
            </p>
          ) : null}

          <label htmlFor="travel-time" className="eyebrow mt-4 block text-muted-foreground">
            Travel time before this job (minutes)
          </label>
          <div className="mt-2 flex items-center gap-2">
            <input
              id="travel-time"
              type="number"
              placeholder="e.g. 20"
              defaultValue={booking.travel_time_minutes ?? ""}
              onChange={(e) => setTravelInput(e.target.value)}
              className="min-h-10 flex-1 rounded-xl border border-input bg-surface-2 px-3 text-sm outline-none focus:border-signal"
            />
            <PrimaryActionButton
              size="sm"
              className="w-auto px-4"
              loading={travelMutation.isPending}
              onClick={() => travelMutation.mutate(travelInput.trim() ? Number(travelInput) : null)}
            >
              Save
            </PrimaryActionButton>
          </div>
        </section>

        {stages && stages.length > 0 ? (
          <section className="mb-4 break-inside-avoid rounded-2xl border border-hairline bg-surface p-5">
            <p className="eyebrow mb-3 text-muted-foreground">Detail checklist</p>
            <StageChecklist stages={stages} />
          </section>
        ) : null}

        {checkIn ? (
          <section className="mb-4 break-inside-avoid rounded-2xl border border-hairline bg-surface p-5">
            <p className="eyebrow mb-3 text-muted-foreground">Check-in record</p>
            <dl className="flex flex-col gap-2 text-[13px]">
              {checkIn.mileage != null ? (
                <Row label="Mileage">{checkIn.mileage.toLocaleString()} mi</Row>
              ) : null}
              {checkIn.exterior_damage_notes ? (
                <Row label="Exterior damage">{checkIn.exterior_damage_notes}</Row>
              ) : null}
              {checkIn.wheel_damage_notes ? (
                <Row label="Wheel damage">{checkIn.wheel_damage_notes}</Row>
              ) : null}
              {checkIn.interior_condition_notes ? (
                <Row label="Interior">{checkIn.interior_condition_notes}</Row>
              ) : null}
              {checkIn.valuables_notes ? (
                <Row label="Valuables">{checkIn.valuables_notes}</Row>
              ) : null}
              {checkIn.customer_requests ? (
                <Row label="Customer requests">{checkIn.customer_requests}</Row>
              ) : null}
              {checkIn.access_notes ? <Row label="Access">{checkIn.access_notes}</Row> : null}
              <Row label="Water / electric">
                {checkIn.water_available == null
                  ? "Water: not recorded"
                  : checkIn.water_available
                    ? "Water: yes"
                    : "Water: no"}{" "}
                ·{" "}
                {checkIn.electric_available == null
                  ? "Electric: not recorded"
                  : checkIn.electric_available
                    ? "Electric: yes"
                    : "Electric: no"}
              </Row>
              {checkIn.vehicle_position_notes ? (
                <Row label="Vehicle position">{checkIn.vehicle_position_notes}</Row>
              ) : null}
              {checkIn.blocking_issue ? (
                <Row label="Blocking issue">
                  <span className="flex items-center gap-1.5 text-destructive">
                    <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2.2} />
                    {checkIn.blocking_issue}
                  </span>
                </Row>
              ) : null}
              <Row label="Customer ack">
                {checkIn.customer_ack_at
                  ? `Confirmed by ${checkIn.customer_ack_name}`
                  : "Not yet confirmed"}
              </Row>
            </dl>
            {photos && photos.length > 0 ? (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {photos.map((p) => (
                  <a
                    key={p.id}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aspect-square overflow-hidden border border-hairline"
                  >
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {booking.status === "en_route" ? (
          <section className="mb-4 break-inside-avoid rounded-2xl border border-signal/30 bg-signal/8 p-5">
            <p className="eyebrow text-muted-foreground">Live</p>
            <p className="mt-1 font-display text-[30px] leading-none">
              {booking.eta_seconds != null
                ? `${formatDuration(booking.eta_seconds)} away`
                : "On the way"}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {booking.eta_updated_at
                ? `ETA from the detailer's phone, updated ${formatRelativeUpdate(booking.eta_updated_at)}.`
                : "Waiting for the detailer's phone to share an ETA."}
            </p>
          </section>
        ) : null}

        <section className="mb-4 break-inside-avoid rounded-2xl border border-hairline bg-surface p-5">
          <p className="eyebrow text-muted-foreground">Customer link and emails</p>
          <button
            type="button"
            onClick={copyTrackLink}
            className="press mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-2 px-3.5 py-3 text-left text-[13px] font-semibold hover:bg-surface"
          >
            <span className="min-w-0 truncate">
              {copied ? "Tracking link copied" : "Copy the customer's tracking link"}
            </span>
            {copied ? (
              <Check className="h-4 w-4 shrink-0 text-success" />
            ) : (
              <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </button>
          <ul className="mt-3 flex flex-col divide-y divide-hairline text-[13px]">
            {(Object.keys(EMAIL_LABELS) as BookingEmailKind[]).map((kind) => {
              const at = sentKinds.get(kind);
              return (
                <li key={kind} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block font-medium">{EMAIL_LABELS[kind]}</span>
                    <span className="block text-[12px] text-muted-foreground">
                      {at ? `Sent ${formatRelativeUpdate(at)}` : "Not sent"}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={emailMutation.isPending || !customer?.email}
                    onClick={() => emailMutation.mutate({ kind, force: Boolean(at) })}
                    className="press shrink-0 border border-hairline px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] hover:bg-surface-2 disabled:opacity-40"
                  >
                    {at ? "Resend" : "Send"}
                  </button>
                </li>
              );
            })}
          </ul>
          {!customer?.email ? (
            <p className="mt-2 text-[12px] text-muted-foreground">
              Add an email to this customer to send them updates.
            </p>
          ) : null}
        </section>

        <section className="mb-4 break-inside-avoid rounded-2xl border border-hairline bg-surface p-5">
          <p className="eyebrow text-muted-foreground">Progress</p>
          <BookingTimeline className="mt-4" steps={timelineForStatus(booking.status)} />
        </section>

        {booking.status !== "completed" && booking.status !== "cancelled" ? (
          <section className="mb-4 break-inside-avoid rounded-2xl border border-destructive/25 bg-destructive/5 p-5">
            <label htmlFor="cancel-reason" className="eyebrow block text-destructive">
              Cancel booking
            </label>
            <select
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value as CancellationReason)}
              className="select-field mt-2 min-h-10 w-full rounded-xl border border-destructive/25 bg-surface px-3 text-sm outline-none"
            >
              {CANCELLATION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <PrimaryActionButton
              variant="ghostDestructive"
              className="mt-2"
              loading={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              Cancel this booking
            </PrimaryActionButton>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-hairline bg-surface-2 p-3.5">
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
        <span className="min-w-0 text-[10px] font-semibold uppercase leading-tight tracking-[0.04em]">
          {label}
        </span>
      </span>
      <p className="mt-1.5 text-[15px] font-semibold leading-tight">{children}</p>
    </div>
  );
}

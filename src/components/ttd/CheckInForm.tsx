import { useState } from "react";
import { useForm } from "react-hook-form";
import { Camera, Trash2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field, TextareaField, YesNoField } from "./FormField";
import { PrimaryActionButton } from "./PrimaryActionButton";
import {
  detailerAddCheckInPhoto,
  detailerSubmitCheckIn,
  uploadCheckInPhoto,
  type SubmitCheckInInput,
} from "@/lib/detailers";

interface CheckInFormValues {
  mileage: string;
  exteriorDamageNotes: string;
  wheelDamageNotes: string;
  interiorConditionNotes: string;
  valuablesNotes: string;
  customerRequests: string;
  accessNotes: string;
  vehiclePositionNotes: string;
  blockingIssue: string;
}

/**
 * The on-arrival vehicle/property inspection: mileage, existing bodywork/
 * wheel damage, interior condition, valuables, access considerations,
 * water/electric availability, vehicle position, any blocking issue,
 * customer requests, and photos around the vehicle — exactly the list from
 * the product brief. One "Save check-in" action submits the record and
 * uploads every staged photo, then advances the booking to IN_PROGRESS.
 */
export function CheckInForm({
  token,
  bookingId,
  onSubmitted,
  className,
}: {
  token: string;
  bookingId: string;
  onSubmitted: () => void;
  className?: string;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CheckInFormValues>({
    defaultValues: {
      mileage: "",
      exteriorDamageNotes: "",
      wheelDamageNotes: "",
      interiorConditionNotes: "",
      valuablesNotes: "",
      customerRequests: "",
      accessNotes: "",
      vehiclePositionNotes: "",
      blockingIssue: "",
    },
  });

  const [waterAvailable, setWaterAvailable] = useState<boolean | null>(null);
  const [electricAvailable, setElectricAvailable] = useState<boolean | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function onSubmit(values: CheckInFormValues) {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const input: SubmitCheckInInput = {
        mileage: values.mileage.trim() ? Number(values.mileage) : null,
        exteriorDamageNotes: values.exteriorDamageNotes.trim(),
        wheelDamageNotes: values.wheelDamageNotes.trim(),
        interiorConditionNotes: values.interiorConditionNotes.trim(),
        valuablesNotes: values.valuablesNotes.trim(),
        customerRequests: values.customerRequests.trim(),
        accessNotes: values.accessNotes.trim(),
        waterAvailable,
        electricAvailable,
        vehiclePositionNotes: values.vehiclePositionNotes.trim(),
        blockingIssue: values.blockingIssue.trim(),
      };
      await detailerSubmitCheckIn(token, bookingId, input);

      for (const photo of photos) {
        const url = await uploadCheckInPhoto(photo);
        await detailerAddCheckInPhoto(token, bookingId, url);
      }

      onSubmitted();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Couldn't save the check-in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className={cn("flex flex-col gap-4", className)}>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Walk round the car with the customer, take a few photos and note anything already there.
        Everything else is optional.
      </p>

      <PhotoGrid photos={photos} onChange={setPhotos} />

      <TextareaField
        id="exteriorDamageNotes"
        label="Existing damage"
        placeholder="Scratches, dents, chips, kerbed wheels: where and how bad. Leave blank if none."
        inputProps={register("exteriorDamageNotes")}
      />

      <TextareaField
        id="valuablesNotes"
        label="Valuables / items to note"
        placeholder="Anything left in the vehicle the customer wants noted"
        inputProps={register("valuablesNotes")}
      />

      <TextareaField
        id="blockingIssue"
        label="Anything stopping the booked service?"
        placeholder="Leave blank if none"
        inputProps={register("blockingIssue")}
        error={errors.blockingIssue?.message}
      />

      <details className="group rounded-xl border border-hairline bg-surface-2 px-3.5 py-3">
        <summary className="cursor-pointer text-[13px] font-semibold marker:content-none">
          More details (optional)
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <Field
            id="mileage"
            label="Mileage"
            type="number"
            placeholder="e.g. 42150"
            inputProps={register("mileage")}
          />
          <TextareaField
            id="wheelDamageNotes"
            label="Existing wheel damage"
            placeholder="Kerb rash, scuffs: note which wheel"
            inputProps={register("wheelDamageNotes")}
          />
          <TextareaField
            id="interiorConditionNotes"
            label="Interior condition"
            placeholder="Stains, wear, existing damage"
            inputProps={register("interiorConditionNotes")}
          />
          <TextareaField
            id="customerRequests"
            label="Customer requests"
            placeholder="Anything the customer specifically asked for"
            inputProps={register("customerRequests")}
          />
          <TextareaField
            id="accessNotes"
            label="Access considerations"
            placeholder="Gate code, parking, where to find the vehicle"
            inputProps={register("accessNotes")}
          />
          <div className="grid grid-cols-2 gap-3">
            <YesNoField
              label="Water available"
              value={waterAvailable}
              onChange={setWaterAvailable}
            />
            <YesNoField
              label="Electric available"
              value={electricAvailable}
              onChange={setElectricAvailable}
            />
          </div>
          <TextareaField
            id="vehiclePositionNotes"
            label="Where the vehicle is positioned"
            placeholder="Driveway, street, underground car park"
            inputProps={register("vehiclePositionNotes")}
          />
        </div>
      </details>

      {submitError ? (
        <p className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/8 px-3.5 py-3 text-[13px] leading-relaxed text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />
          {submitError}
        </p>
      ) : null}

      <PrimaryActionButton type="submit" loading={submitting}>
        Save and start detailing
      </PrimaryActionButton>
    </form>
  );
}

function PhotoGrid({ photos, onChange }: { photos: File[]; onChange: (files: File[]) => void }) {
  return (
    <div>
      <span className="eyebrow block text-muted-foreground">Photos around the vehicle</span>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {photos.map((file, i) => (
          <PhotoThumb
            key={i}
            file={file}
            onRemove={() => onChange(photos.filter((_, j) => j !== i))}
          />
        ))}
        <label className="press flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-hairline bg-surface-2 text-muted-foreground hover:bg-surface">
          <Camera className="h-5 w-5" strokeWidth={1.8} />
          <span className="text-[10px] font-semibold uppercase tracking-wide">Add</span>
          <input
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (picked.length) onChange([...photos, ...picked]);
            }}
          />
        </label>
      </div>
    </div>
  );
}

function PhotoThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const url = URL.createObjectURL(file);
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl border border-hairline">
      <img
        src={url}
        alt=""
        className="h-full w-full object-cover"
        onLoad={() => URL.revokeObjectURL(url)}
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove photo"
        className="press absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-ink/80 text-white"
      >
        <Trash2 className="h-3 w-3" strokeWidth={2.4} />
      </button>
    </div>
  );
}

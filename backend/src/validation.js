import { z } from "zod";
import { DateTime } from "luxon";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
export const ZONE = "America/Argentina/Buenos_Aires";
export class ApiError extends Error {
  constructor(status, message, code = "INVALID_REQUEST", details) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}
export const name = z.string().trim().min(2).max(100);
export const id = z.string().regex(/^[a-f\d]{24}$/i);
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => DateTime.fromISO(v, { zone: ZONE }).isValid, "Fecha inválida");
export const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export function phone(value) {
  if (typeof value !== "string" || value.length > 40)
    throw new ApiError(400, "Ingresá un teléfono válido con código de área");
  const number = parsePhoneNumberFromString(value, "AR");
  if (!number?.isValid() || number.ext)
    throw new ApiError(400, "Ingresá un teléfono válido con código de área");
  return number.number;
}
export const phoneSchema = z.string().transform(phone);
export const bookingInput = z
  .object({ slotId: id, name, phone: phoneSchema })
  .strict();
export const clientInput = z
  .object({
    name,
    phone: phoneSchema,
    bookingBlocked: z.boolean().optional(),
    notes: z.string().trim().max(1000).default(""),
  })
  .strict();
export const password = z
  .string()
  .min(12)
  .max(72)
  .refine((v) => Buffer.byteLength(v, "utf8") <= 72, "Máximo 72 bytes");
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,60}$/);
export function localInstant(day, hour = "00:00") {
  date.parse(day);
  time.parse(hour);
  return DateTime.fromISO(`${day}T${hour}`, { zone: ZONE }).toJSDate();
}
export function dayBounds(day) {
  const start = localInstant(day);
  return {
    start,
    end: DateTime.fromJSDate(start, { zone: ZONE })
      .plus({ days: 1 })
      .toJSDate(),
  };
}
export function today() {
  return DateTime.now().setZone(ZONE).toISODate();
}
export function validateFutureDay(day, horizon) {
  const start = DateTime.fromISO(date.parse(day), { zone: ZONE });
  const now = DateTime.now().setZone(ZONE).startOf("day");
  if (start < now || start >= now.plus({ days: horizon }))
    throw new ApiError(400, "La fecha está fuera del período de reservas");
}
export const settingsInput = z
  .object({
    name,
    phone: z
      .string()
      .max(40)
      .transform((v) => (v ? phone(v) : "")),
    address: z.string().trim().max(200),
    duration: z.number().int().min(5).max(240),
    horizon: z.number().int().min(1).max(90),
    revision: z.number().int().nonnegative(),
    weekly: z.record(z.string(), z.array(z.tuple([time, time])).max(4)),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (Object.keys(v.weekly).sort().join(",") !== "1,2,3,4,5,6,7")
      ctx.addIssue({
        code: "custom",
        message: "La semana debe incluir los siete días",
      });
    for (const ranges of Object.values(v.weekly)) {
      const sorted = [...ranges].sort((a, b) => a[0].localeCompare(b[0]));
      sorted.forEach(([a, b], i) => {
        if (a >= b || (i > 0 && sorted[i - 1][1] > a))
          ctx.addIssue({
            code: "custom",
            message: "Los rangos deben estar ordenados y no superponerse",
          });
      });
    }
  });
export const overlap = (start, end) => ({
  start: { $lt: end },
  end: { $gt: start },
});

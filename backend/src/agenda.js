import { DateTime } from "luxon";
import { z } from "zod";
import {
  Settings,
  Slot,
  Block,
  Booking,
  Client,
  Event,
  Request,
} from "./models.js";
import { transaction } from "./transaction.js";
import {
  ApiError,
  ZONE,
  overlap,
  dayBounds,
  validateFutureDay,
  localInstant,
  date,
  time,
  id,
  settingsInput,
  clientInput,
} from "./validation.js";
import { digest } from "./security.js";
const conflict = (message, details) =>
  new ApiError(409, message, "AGENDA_CONFLICT", details);
const publicSlot = (s) => ({ id: String(s._id), start: s.start, end: s.end });
export async function shop() {
  const s = await Settings.findById("shop").lean();
  return {
    name: s.name,
    phone: s.phone,
    address: s.address,
    duration: s.duration,
    horizon: s.horizon,
    timezone: ZONE,
  };
}
export async function availability(day) {
  const s = await Settings.findById("shop");
  validateFutureDay(day, s.horizon);
  const { start, end } = dayBounds(day);
  const [slots, blocks, bookings] = await Promise.all([
    Slot.find({
      enabled: true,
      start: { $gte: start, $lt: end, $gt: new Date() },
    })
      .sort({ start: 1 })
      .lean(),
    Block.find(overlap(start, end)).lean(),
    Booking.find({ ...overlap(start, end), status: "confirmado" }).lean(),
  ]);
  return slots
    .filter(
      (s) =>
        ![...blocks, ...bookings].some(
          (b) => b.start < s.end && b.end > s.start,
        ),
    )
    .map(publicSlot);
}
async function validSlot(slotId, session, excludeBooking) {
  const s = await Slot.findById(slotId).session(session);
  if (!s || !s.enabled || s.start <= new Date())
    throw conflict("El horario ya no está disponible");
  const settings = await Settings.findById("shop").session(session);
  validateFutureDay(
    DateTime.fromJSDate(s.start, { zone: ZONE }).toISODate(),
    settings.horizon,
  );
  const query = { ...overlap(s.start, s.end), status: "confirmado" };
  if (excludeBooking) query._id = { $ne: excludeBooking };
  if (
    (await Block.exists(overlap(s.start, s.end)).session(session)) ||
    (await Booking.exists(query).session(session))
  )
    throw conflict("El horario ya no está disponible");
  return s;
}
export async function reserve(input, key, source = "public") {
  if (!/^[\da-f-]{36}$/i.test(key || ""))
    throw new ApiError(400, "Falta un identificador válido del intento");
  const requestId = digest(`${source}:${key}`),
    fingerprint = digest(JSON.stringify(input));
  return transaction(async (session) => {
    const prior = await Request.findById(requestId).session(session);
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw conflict("El intento corresponde a otros datos");
      return prior.response;
    }
    const s = await validSlot(input.slotId, session);
    let client = await Client.findOne({ phone: input.phone }).session(session);
    if (!client)
      [client] = await Client.create(
        [{ name: input.name, phone: input.phone }],
        { session },
      );
    const [booking] = await Booking.create(
      [
        {
          slot: s._id,
          client: client._id,
          name: input.name,
          phone: input.phone,
          start: s.start,
          end: s.end,
          source,
        },
      ],
      { session },
    );
    await Event.create(
      [{ booking: booking._id, action: "creado", actor: source }],
      { session },
    );
    const response = { start: s.start, end: s.end, status: "confirmado" };
    await Request.create(
      [
        {
          _id: requestId,
          fingerprint,
          response,
          expires: new Date(Date.now() + 86400000),
        },
      ],
      { session },
    );
    return response;
  });
}
export async function agenda(day) {
  const { start, end } = dayBounds(day);
  const [slots, blocks, bookings] = await Promise.all([
    Slot.find({ start: { $gte: start, $lt: end }, enabled: true })
      .sort({ start: 1 })
      .lean(),
    Block.find(overlap(start, end)).lean(),
    Booking.find({ start: { $gte: start, $lt: end } })
      .populate("client", "name phone")
      .sort({ start: 1 })
      .lean(),
  ]);
  return { slots, blocks, bookings };
}
export async function changeBooking(bookingId, input) {
  const data = z
    .object({
      revision: z.number().int().nonnegative(),
      status: z.enum(["cancelado", "atendido", "ausente"]).optional(),
      slotId: id.optional(),
      clientId: id.optional(),
    })
    .strict()
    .refine(
      (v) => [v.status, v.slotId, v.clientId].filter(Boolean).length === 1,
    )
    .parse(input);
  return transaction(async (session) => {
    const b = await Booking.findById(id.parse(bookingId)).session(session);
    if (!b) throw new ApiError(404, "Reserva inexistente");
    if (b.revision !== data.revision)
      throw conflict("La reserva cambió. Actualizá la agenda.");
    const from = {
      start: b.start,
      end: b.end,
      status: b.status,
      slot: b.slot,
      client: b.client,
    };
    if (data.clientId) {
      if (!(await Client.exists({ _id: data.clientId }).session(session)))
        throw new ApiError(404, "Cliente inexistente");
      b.client = data.clientId;
    } else {
      if (b.status !== "confirmado")
        throw conflict("La reserva ya está finalizada");
      if (data.slotId) {
        if (b.start <= new Date())
          throw conflict("No se puede reprogramar un turno pasado");
        const s = await validSlot(data.slotId, session, b._id);
        b.slot = s._id;
        b.start = s.start;
        b.end = s.end;
      } else {
        if (data.status === "atendido" && b.start > new Date())
          throw conflict("El turno todavía no comenzó");
        if (data.status === "ausente" && b.end > new Date())
          throw conflict(
            "Esperá a que termine el horario para marcar ausencia",
          );
        b.status = data.status;
      }
    }
    b.revision++;
    await b.save({ session });
    await Event.create(
      [
        {
          booking: b._id,
          action: data.clientId
            ? "cliente_corregido"
            : data.slotId
              ? "reprogramado"
              : data.status,
          actor: "admin",
          from,
          to: {
            start: b.start,
            end: b.end,
            status: b.status,
            slot: b.slot,
            client: b.client,
          },
        },
      ],
      { session },
    );
    return b;
  });
}
export async function saveSettings(input) {
  const data = settingsInput.parse(input);
  return transaction(async (session) => {
    const s = await Settings.findById("shop").session(session);
    if (s.revision !== data.revision)
      throw conflict("La configuración cambió. Recargá la página.");
    // La plantilla no cambia horarios ya publicados. Su aplicación se previsualiza.
    Object.assign(s, data, { revision: s.revision + 1 });
    await s.save({ session });
    return s;
  });
}
const generationInput = z
  .object({
    from: date,
    to: date,
    replace: z.boolean(),
    preserveReservations: z.boolean(),
    settingsRevision: z.number().int().nonnegative(),
  })
  .strict();
async function generationPlan(input, session) {
  const data = generationInput.parse(input);
  const settings = await Settings.findById("shop").session(session);
  if (settings.revision !== data.settingsRevision)
    throw conflict("La configuración cambió. Recargá la página.");
  validateFutureDay(data.from, settings.horizon);
  validateFutureDay(data.to, settings.horizon);
  if (data.from > data.to) throw new ApiError(400, "El período está invertido");
  const start = localInstant(data.from),
    end = dayBounds(data.to).end;
  const slots = await Slot.find({ ...overlap(start, end), enabled: true })
    .session(session)
    .lean();
  const bookings = await Booking.find({
    ...overlap(start, end),
    status: "confirmado",
  })
    .session(session)
    .lean();
  const blocks = await Block.find(overlap(start, end)).session(session).lean();
  const retiredPreviously = data.replace
    ? []
    : await Slot.find({ ...overlap(start, end), enabled: false })
        .session(session)
        .lean();
  const affected = data.replace ? bookings : [];
  const bookingSlots = new Set(bookings.map((b) => String(b.slot)));
  const retired = data.replace
    ? slots.filter(
        (s) => s.start > new Date() && !bookingSlots.has(String(s._id)),
      )
    : [];
  const retiredIds = new Set(retired.map((s) => String(s._id)));
  const retained = slots.filter((s) => !retiredIds.has(String(s._id)));
  const candidates = [];
  for (
    let day = DateTime.fromJSDate(start, { zone: ZONE });
    day.toJSDate() < end;
    day = day.plus({ days: 1 })
  ) {
    for (const [a, b] of settings.weekly[day.weekday] || []) {
      let cursor = DateTime.fromJSDate(localInstant(day.toISODate(), a), {
        zone: ZONE,
      });
      const limit = localInstant(day.toISODate(), b);
      while (cursor.plus({ minutes: settings.duration }).toJSDate() <= limit) {
        const item = {
          start: cursor.toJSDate(),
          end: cursor.plus({ minutes: settings.duration }).toJSDate(),
        };
        if (
          item.start > new Date() &&
          ![...retained, ...bookings, ...blocks, ...retiredPreviously].some(
            (x) => x.start < item.end && x.end > item.start,
          )
        )
          candidates.push(item);
        cursor = cursor.plus({ minutes: settings.duration });
      }
    }
  }
  if (candidates.length + retired.length > 5000)
    throw new ApiError(
      400,
      "El período genera demasiados cambios. Publicá un rango más corto (máximo 5000 cambios).",
    );
  return { data, retired, candidates, affected };
}
export async function generate(input, preview = false) {
  return transaction(async (session) => {
    const plan = await generationPlan(input, session);
    const summary = {
      create: plan.candidates.length,
      retire: plan.retired.length,
      conflicts: plan.affected.map((b) => ({
        id: b._id,
        start: b.start,
        end: b.end,
      })),
    };
    if (preview) return summary;
    if (plan.affected.length && !plan.data.preserveReservations)
      throw conflict(
        "Hay reservas existentes. Elegí conservarlas o resolvelas antes de aplicar.",
        summary,
      );
    await Slot.updateMany(
      { _id: { $in: plan.retired.map((s) => s._id) } },
      { $set: { enabled: false } },
      { session },
    );
    if (plan.candidates.length) {
      await Slot.bulkWrite(
        plan.candidates.map((candidate) => ({
          updateOne: {
            filter: candidate,
            update: plan.data.replace
              ? {
                  $set: { enabled: true },
                  $setOnInsert: { source: "generated" },
                }
              : { $setOnInsert: { enabled: true, source: "generated" } },
            upsert: true,
          },
        })),
        { session, ordered: true },
      );
    }
    return summary;
  });
}
export async function addSlot(input) {
  const data = z.object({ date, time }).strict().parse(input);
  return transaction(async (session) => {
    const settings = await Settings.findById("shop").session(session);
    validateFutureDay(data.date, settings.horizon);
    const start = localInstant(data.date, data.time),
      end = new Date(+start + settings.duration * 60000);
    if (start <= new Date() || end > dayBounds(data.date).end)
      throw new ApiError(
        400,
        "El turno debe ser futuro y terminar dentro del día",
      );
    if (
      (await Slot.exists({ ...overlap(start, end), enabled: true }).session(
        session,
      )) ||
      (await Booking.exists({
        ...overlap(start, end),
        status: "confirmado",
      }).session(session)) ||
      (await Block.exists(overlap(start, end)).session(session))
    )
      throw conflict("El horario se superpone con otro horario o bloqueo");
    return Slot.findOneAndUpdate(
      { start, end },
      { $set: { enabled: true, source: "manual" } },
      { session, upsert: true, new: true },
    );
  });
}
export async function addBlock(input) {
  const data = z
    .object({
      date,
      from: time.optional(),
      to: time.optional(),
      reason: z.string().trim().max(200),
    })
    .strict()
    .refine((v) => Boolean(v.from) === Boolean(v.to))
    .parse(input);
  return transaction(async (session) => {
    const settings = await Settings.findById("shop").session(session);
    validateFutureDay(data.date, settings.horizon);
    const start = data.from
      ? localInstant(data.date, data.from)
      : dayBounds(data.date).start;
    const end = data.to
      ? localInstant(data.date, data.to)
      : dayBounds(data.date).end;
    if (start >= end || end <= new Date())
      throw new ApiError(400, "Intervalo inválido");
    const bookings = await Booking.find({
      ...overlap(start, end),
      status: "confirmado",
    }).session(session);
    if (bookings.length)
      throw conflict(
        "Reprogramá o cancelá las reservas afectadas antes de bloquear.",
        { conflicts: bookings.map((b) => ({ id: b._id, start: b.start })) },
      );
    if (await Block.exists(overlap(start, end)).session(session))
      throw conflict("Ya existe un bloqueo en ese intervalo");
    const [block] = await Block.create([{ start, end, reason: data.reason }], {
      session,
    });
    return block;
  });
}
export async function removeBlock(blockId) {
  return transaction(async (session) => {
    const b = await Block.findByIdAndDelete(id.parse(blockId), { session });
    if (!b) throw new ApiError(404, "Bloqueo inexistente");
  });
}
export async function saveClient(input, clientId) {
  const schema = clientId
    ? clientInput.extend({ revision: z.number().int().nonnegative() })
    : clientInput;
  const data = schema.parse(input);
  return transaction(async (session) => {
    if (!clientId) {
      const [client] = await Client.create([data], { session });
      return client;
    }
    const c = await Client.findById(id.parse(clientId)).session(session);
    if (!c) throw new ApiError(404, "Cliente inexistente");
    if (c.revision !== data.revision)
      throw conflict("El cliente cambió. Recargá la ficha.");
    Object.assign(c, data, { revision: c.revision + 1 });
    await c.save({ session });
    return c;
  });
}

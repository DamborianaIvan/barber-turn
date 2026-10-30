import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import supertest from "supertest";
import bcrypt from "bcryptjs";
import { DateTime } from "luxon";
process.env.NODE_ENV = "test";
process.env.APP_ORIGIN = "http://localhost:5174";
process.env.JWT_SECRET = "test-session-secret-at-least-32-characters";
process.env.ABUSE_SECRET = "test-abuse-secret-at-least-32-characters";
const { default: app } = await import("../src/app.js");
const m = await import("../src/models.js");
const a = await import("../src/agenda.js");
const v = await import("../src/validation.js");
const http = supertest(app),
  origin = process.env.APP_ORIGIN;
const future = () =>
  DateTime.now().setZone(v.ZONE).plus({ days: 2 }).toISODate();
const phone = "+5492266551234";
let mongo;
before(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: "7.0.24" },
  });
  await mongoose.connect(mongo.getUri());
  await m.initialize();
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(async () => {
  for (const model of [
    m.Booking,
    m.Slot,
    m.Block,
    m.Client,
    m.Request,
    m.Event,
    m.Rate,
    m.Admin,
    m.Revoked,
  ])
    await model.deleteMany({});
  await m.Settings.deleteMany({});
  await m.initialize();
});
async function slot(time = "10:00") {
  return a.addSlot({ date: future(), time });
}
const data = (s) => ({ slotId: String(s._id), name: "Iván Cliente", phone });
async function session() {
  await m.Admin.create({
    _id: "owner",
    username: "dueno",
    password: await bcrypt.hash("password-test-1234", 10),
  });
  const r = await http
    .post("/api/auth/login")
    .set("Origin", origin)
    .send({ username: "dueno", password: "password-test-1234" })
    .expect(200);
  return {
    cookie: r.headers["set-cookie"][0].split(";")[0],
    csrf: r.body.csrf,
  };
}
function auth(req, s) {
  return req
    .set("Cookie", s.cookie)
    .set("Origin", origin)
    .set("X-CSRF-Token", s.csrf);
}
test("20 reservas simultáneas: exactamente una confirmada y un cliente", async () => {
  const s = await slot();
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, () => a.reserve(data(s), randomUUID())),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await m.Booking.countDocuments(), 1);
  assert.equal(await m.Client.countDocuments(), 1);
  assert.ok(
    results
      .filter((r) => r.status === "rejected")
      .every((r) => r.reason.status === 409),
  );
});
test("índice de base de datos impide dos reservas confirmadas por horario", async () => {
  const s = await slot();
  await a.reserve(data(s), randomUUID());
  const b = await m.Booking.findOne().lean();
  delete b._id;
  await assert.rejects(m.Booking.create(b), (e) => e.code === 11000);
});
test("reintentos idempotentes no duplican y no aceptan otro payload", async () => {
  const s = await slot(),
    key = randomUUID();
  await Promise.all([a.reserve(data(s), key), a.reserve(data(s), key)]);
  assert.equal(await m.Booking.countDocuments(), 1);
  await assert.rejects(
    a.reserve({ ...data(s), name: "Otro" }, key),
    (e) => e.status === 409,
  );
});
test("rechaza horarios inexistentes, pasados y bloqueados", async () => {
  await assert.rejects(
    a.reserve(
      { ...data({ _id: new mongoose.Types.ObjectId() }) },
      randomUUID(),
    ),
    (e) => e.status === 409,
  );
  const s = await slot();
  await a.addBlock({
    date: future(),
    from: "10:00",
    to: "10:30",
    reason: "Pausa",
  });
  await assert.rejects(
    a.reserve(data(s), randomUUID()),
    (e) => e.status === 409,
  );
  await m.Block.deleteMany({});
  await m.Slot.updateOne(
    { _id: s._id },
    { $set: { start: new Date(Date.now() - 60000) } },
  );
  await assert.rejects(
    a.reserve(data(s), randomUUID()),
    (e) => e.status === 409,
  );
});
test("cancelar libera un futuro habilitado y conserva historial", async () => {
  const s = await slot();
  await a.reserve(data(s), randomUUID());
  const b = await m.Booking.findOne();
  await a.changeBooking(String(b._id), { status: "cancelado", revision: 0 });
  assert.equal((await a.availability(future())).length, 1);
  await a.reserve(data(s), randomUUID());
  assert.equal(await m.Booking.countDocuments(), 2);
});
test("cancelar no libera un horario deshabilitado ni pasado", async () => {
  const s = await slot();
  await a.reserve(data(s), randomUUID());
  const b = await m.Booking.findOne();
  await m.Slot.updateOne({ _id: s._id }, { $set: { enabled: false } });
  await a.changeBooking(String(b._id), { status: "cancelado", revision: 0 });
  assert.deepEqual(await a.availability(future()), []);
});
test("reprogramación ocupada conserva el original; libre actualiza con evento", async () => {
  const s = await slot(),
    t = await slot("11:00"),
    u = await slot("12:00");
  await a.reserve(data(s), randomUUID());
  await a.reserve(data(t), randomUUID());
  const b = await m.Booking.findOne({ slot: s._id });
  await assert.rejects(
    a.changeBooking(String(b._id), { slotId: String(t._id), revision: 0 }),
    (e) => e.status === 409,
  );
  assert.equal(String((await m.Booking.findById(b._id)).slot), String(s._id));
  await a.changeBooking(String(b._id), { slotId: String(u._id), revision: 0 });
  assert.equal(String((await m.Booking.findById(b._id)).slot), String(u._id));
  assert.equal(await m.Event.countDocuments({ action: "reprogramado" }), 1);
});
test("reserva contra bloqueo concurrente: nunca sobreviven ambos", async () => {
  const s = await slot();
  const results = await Promise.allSettled([
    a.reserve(data(s), randomUUID()),
    a.addBlock({ date: future(), reason: "Cerrado" }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await m.Block.countDocuments()) + (await m.Booking.countDocuments()),
    1,
  );
});
test("horarios solapados concurrentes: solo uno; contiguos válidos", async () => {
  const results = await Promise.allSettled([slot("10:00"), slot("10:15")]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  await slot("11:00");
});
test("mismo teléfono asocia sin sobrescribir nombre, notas ni instantánea", async () => {
  const s = await slot(),
    t = await slot("11:00");
  await a.reserve(data(s), randomUUID());
  await m.Client.updateOne({ phone }, { $set: { notes: "Nota privada" } });
  await a.reserve({ ...data(t), name: "Nombre diferente" }, randomUUID());
  const c = await m.Client.findOne();
  assert.equal(await m.Client.countDocuments(), 1);
  assert.equal(c.name, "Iván Cliente");
  assert.equal(c.notes, "Nota privada");
  assert.ok(
    await m.Booking.exists({ name: "Nombre diferente", client: c._id }),
  );
});
test("normalización argentina y zona horaria independiente del host", () => {
  assert.equal(v.phone("02266 15 551234"), phone);
  assert.equal(v.phone("+54 9 2266 551234"), phone);
  assert.throws(() => v.phone("12345"));
  assert.equal(
    v.localInstant("2026-11-01", "10:00").toISOString(),
    "2026-11-01T13:00:00.000Z",
  );
  assert.equal(
    v.dayBounds("2026-11-01").end.toISOString(),
    "2026-11-02T03:00:00.000Z",
  );
});
test("generar es idempotente; reemplazar con reservas requiere elección y conserva duración", async () => {
  const d = future();
  const weekday = DateTime.fromISO(d, { zone: v.ZONE }).weekday;
  await m.Settings.updateOne(
    { _id: "shop" },
    { $set: { [`weekly.${weekday}`]: [["10:00", "12:00"]] } },
  );
  const input = {
    from: d,
    to: d,
    replace: false,
    preserveReservations: false,
    settingsRevision: 0,
  };
  await a.generate(input);
  await a.generate(input);
  assert.equal(await m.Slot.countDocuments({ enabled: true }), 4);
  const s = await m.Slot.findOne().sort({ start: 1 });
  await a.reserve(data(s), randomUUID());
  const settings = (await m.Settings.findById("shop")).toObject();
  await a.saveSettings({
    name: settings.name,
    phone: "",
    address: "",
    duration: 45,
    horizon: 30,
    weekly: settings.weekly,
    revision: 0,
  });
  const replace = { ...input, replace: true, settingsRevision: 1 };
  await assert.rejects(a.generate(replace), (e) => e.status === 409);
  assert.equal(await m.Slot.countDocuments({ enabled: true }), 4);
  await a.generate({ ...replace, preserveReservations: true });
  const b = await m.Booking.findOne();
  assert.equal(+b.end - +b.start, 30 * 60000);
  const slots = await m.Slot.find({ enabled: true }).sort({ start: 1 });
  for (let i = 1; i < slots.length; i++)
    assert.ok(slots[i - 1].end <= slots[i].start);
});
test("bloquear día ocupado no aplica parcialmente", async () => {
  const s = await slot();
  await a.reserve(data(s), randomUUID());
  await assert.rejects(
    a.addBlock({ date: future(), reason: "Vacaciones" }),
    (e) => e.status === 409,
  );
  assert.equal(await m.Block.countDocuments(), 0);
});
test("estados no permiten atender futuros, ausencia anticipada ni reabrir finales", async () => {
  const s = await slot();
  await a.reserve(data(s), randomUUID());
  const b = await m.Booking.findOne();
  for (const status of ["atendido", "ausente"])
    await assert.rejects(
      a.changeBooking(String(b._id), { status, revision: 0 }),
      (e) => e.status === 409,
    );
  await a.changeBooking(String(b._id), { status: "cancelado", revision: 0 });
  await assert.rejects(
    a.changeBooking(String(b._id), { status: "atendido", revision: 1 }),
    (e) => e.status === 409,
  );
});
test("acceso HTTP privado, registro inexistente, CSRF, logout y revocación", async () => {
  for (const route of ["agenda?date=" + future(), "clientes", "configuracion"])
    await http.get("/api/admin/" + route).expect(401);
  await http
    .post("/api/auth/register")
    .set("Origin", origin)
    .send({})
    .expect(404);
  const s = await session();
  await auth(http.get("/api/admin/clientes"), s).expect(200);
  await http
    .post("/api/auth/logout")
    .set("Origin", origin)
    .set("Cookie", s.cookie)
    .expect(403);
  await http
    .post("/api/auth/logout")
    .set("Origin", "https://evil.example")
    .set("Cookie", s.cookie)
    .set("X-CSRF-Token", s.csrf)
    .expect(403);
  await auth(http.post("/api/auth/logout"), s).expect(204);
  await auth(http.get("/api/admin/clientes"), s).expect(401);
});
test("cambio de contraseña/version invalida sesiones", async () => {
  const s = await session();
  await m.Admin.updateOne({ _id: "owner" }, { $inc: { sessionVersion: 1 } });
  await auth(http.get("/api/auth/session"), s).expect(401);
});
test("respuestas públicas nunca exponen cliente, notas ni IDs privados", async () => {
  const s = await slot();
  const r = await http
    .post("/api/public/reservas")
    .set("Origin", origin)
    .set("Idempotency-Key", randomUUID())
    .send(data(s))
    .expect(201);
  assert.deepEqual(Object.keys(r.body).sort(), ["end", "start", "status"]);
  assert.equal(r.headers["cache-control"], "no-store");
  const available = await http
    .get("/api/public/disponibilidad?date=" + future())
    .expect(200);
  assert.deepEqual(available.body, []);
  await http.get("/api/public/clientes?phone=" + phone).expect(404);
});
test("reserva manual no ignora bloqueos y cliente inexistente no aparece durante errores", async () => {
  const s = await slot();
  await a.addBlock({ date: future(), reason: "Cerrado" });
  const owner = await session();
  await auth(http.post("/api/admin/reservas"), owner)
    .set("Idempotency-Key", randomUUID())
    .send(data(s))
    .expect(409);
  await auth(
    http.get("/api/admin/clientes/" + new mongoose.Types.ObjectId()),
    owner,
  ).expect(404);
});
test("límites persistentes de login y validación estricta", async () => {
  for (let i = 0; i < 10; i++)
    await http
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ username: "nadie", password: "incorrecta" })
      .expect(401);
  await http
    .post("/api/auth/login")
    .set("Origin", origin)
    .send({ username: "nadie", password: "incorrecta" })
    .expect(429);
  await http
    .post("/api/public/reservas")
    .set("Origin", origin)
    .send({ name: { $ne: "" }, phone })
    .expect(400);
});
test("edición de cliente detecta duplicados y versiones obsoletas", async () => {
  const c = await a.saveClient({ name: "Cliente Uno", phone, notes: "" });
  await a.saveClient({
    name: "Cliente Dos",
    phone: "+5492266551235",
    notes: "",
  });
  await assert.rejects(
    a.saveClient(
      { name: "Cambio", phone: "+5492266551235", notes: "", revision: 0 },
      String(c._id),
    ),
    (e) => e.code === 11000,
  );
  await a.saveClient(
    { name: "Corregido", phone, notes: "Privado", revision: 0 },
    String(c._id),
  );
  await assert.rejects(
    a.saveClient(
      { name: "Viejo", phone, notes: "", revision: 0 },
      String(c._id),
    ),
    (e) => e.status === 409,
  );
});

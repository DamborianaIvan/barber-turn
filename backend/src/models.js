import mongoose from "mongoose";
const { Schema } = mongoose;
const model = (name, fields, options = {}) =>
  mongoose.model(name, new Schema(fields, { timestamps: true, ...options }));
export const Admin = model("Admin", {
  _id: { type: String, default: "owner" },
  username: { type: String, required: true },
  password: { type: String, required: true, select: false },
  sessionVersion: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
});
export const Revoked = model("Revoked", {
  _id: String,
  expires: { type: Date, expires: 0 },
});
export const Rate = model("Rate", {
  _id: String,
  count: Number,
  expires: { type: Date, expires: 0 },
});
export const Control = model("Control", {
  _id: String,
  revision: { type: Number, default: 0 },
});
export const Settings = model("Settings", {
  _id: String,
  name: { type: String, default: "Barber Turn" },
  phone: { type: String, default: "" },
  address: { type: String, default: "" },
  duration: { type: Number, default: 30 },
  horizon: { type: Number, default: 30 },
  revision: { type: Number, default: 0 },
  autoPublish: { type: Boolean, default: false },
  publishedThrough: String,
  schedules: { type: Schema.Types.Mixed, default: () => [] },
  weekly: {
    type: Schema.Types.Mixed,
    default: () =>
      Object.fromEntries(
        [1, 2, 3, 4, 5, 6, 7].map((d) => [
          d,
          d < 7
            ? [
                ["09:00", "13:00"],
                ["16:00", "20:00"],
              ]
            : [],
        ]),
      ),
  },
});
export const Slot = model("Slot", {
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  enabled: { type: Boolean, default: true },
  source: { type: String, enum: ["generated", "manual"] },
});
Slot.schema.index({ start: 1, end: 1 }, { unique: true });
export const Block = model("Block", { start: Date, end: Date, reason: String });
export const Client = model("Client", {
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  notes: { type: String, default: "" },
  revision: { type: Number, default: 0 },
});
export const Booking = model("Booking", {
  managementHash: { type: String, select: false, index: true },
  slot: { type: Schema.Types.ObjectId, ref: "Slot", required: true },
  client: { type: Schema.Types.ObjectId, ref: "Client", required: true },
  name: String,
  phone: String,
  start: Date,
  end: Date,
  status: {
    type: String,
    enum: ["confirmado", "atendido", "cancelado", "ausente"],
    default: "confirmado",
  },
  source: { type: String, enum: ["public", "admin"] },
  revision: { type: Number, default: 0 },
});
Booking.schema.index(
  { slot: 1 },
  { unique: true, partialFilterExpression: { status: "confirmado" } },
);
Booking.schema.index({ start: 1 });
Booking.schema.index({ client: 1, start: -1 });
export const Event = model("Event", {
  booking: Schema.Types.ObjectId,
  action: String,
  actor: String,
  from: Schema.Types.Mixed,
  to: Schema.Types.Mixed,
});
export const Request = model("Request", {
  _id: String,
  fingerprint: String,
  response: Schema.Types.Mixed,
  expires: { type: Date, expires: 0 },
});
export async function initialize() {
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  await Control.updateOne(
    { _id: "agenda" },
    { $setOnInsert: { revision: 0 } },
    { upsert: true },
  );
  await Settings.updateOne(
    { _id: "shop" },
    { $setOnInsert: {} },
    { upsert: true },
  );
}

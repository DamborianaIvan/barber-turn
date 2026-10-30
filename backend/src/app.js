import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { z, ZodError } from "zod";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import mongoose from "mongoose";
import { config } from "./config.js";
import {
  originGuard,
  rateLimit,
  parseLogin,
  login,
  protect,
  logout,
} from "./security.js";
import { Settings, Client, Booking, Event } from "./models.js";
import { ApiError, bookingInput, id } from "./validation.js";
import * as agenda from "./agenda.js";
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", config.proxy || false);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.production ? [] : null,
      },
    },
  }),
);
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(originGuard);
app.use(express.json({ limit: "16kb", strict: true, inflate: false }));
app.use(cookieParser());
app.get("/api/health", (_req, res) =>
  res
    .status(mongoose.connection.readyState === 1 ? 200 : 503)
    .json({ ok: mongoose.connection.readyState === 1 }),
);
app.get("/api/public/barberia", rateLimit("read", 240), async (_req, res) =>
  res.json(await agenda.shop()),
);
app.get(
  "/api/public/disponibilidad",
  rateLimit("read", 240),
  async (req, res) => res.json(await agenda.availability(req.query.date)),
);
app.post(
  "/api/public/reservas",
  rateLimit("reserve-ip", 10),
  (req, _res, next) => {
    req.body = bookingInput.parse(req.body);
    next();
  },
  rateLimit("reserve-phone", 5, (req) => req.body.phone, 3600000),
  async (req, res) =>
    res
      .status(201)
      .json(await agenda.reserve(req.body, req.get("idempotency-key"))),
);
app.post(
  "/api/auth/login",
  rateLimit("login-ip", 30),
  parseLogin,
  rateLimit("login-account", 10, (req) => req.body.username),
  login,
);
app.get("/api/auth/session", protect, (req, res) =>
  res.json({ username: req.auth.username, csrf: req.auth.csrf }),
);
app.post("/api/auth/logout", protect, logout);
app.use("/api/admin", protect);
app.get("/api/admin/agenda", async (req, res) =>
  res.json(await agenda.agenda(req.query.date)),
);
app.post("/api/admin/reservas", async (req, res) =>
  res
    .status(201)
    .json(
      await agenda.reserve(
        bookingInput.parse(req.body),
        req.get("idempotency-key"),
        "admin",
      ),
    ),
);
app.patch("/api/admin/reservas/:id", async (req, res) =>
  res.json(await agenda.changeBooking(req.params.id, req.body)),
);
app.get("/api/admin/reservas/:id/eventos", async (req, res) =>
  res.json(
    await Event.find({ booking: id.parse(req.params.id) })
      .sort({ createdAt: 1 })
      .lean(),
  ),
);
app.get("/api/admin/configuracion", async (_req, res) =>
  res.json(await Settings.findById("shop").lean()),
);
app.put("/api/admin/configuracion", async (req, res) =>
  res.json(await agenda.saveSettings(req.body)),
);
app.post("/api/admin/disponibilidad/previsualizar", async (req, res) =>
  res.json(await agenda.generate(req.body, true)),
);
app.post("/api/admin/disponibilidad/generar", async (req, res) =>
  res.json(await agenda.generate(req.body)),
);
app.post("/api/admin/horarios", async (req, res) =>
  res.status(201).json(await agenda.addSlot(req.body)),
);
app.post("/api/admin/bloqueos", async (req, res) =>
  res.status(201).json(await agenda.addBlock(req.body)),
);
app.delete("/api/admin/bloqueos/:id", async (req, res) => {
  await agenda.removeBlock(req.params.id);
  res.status(204).end();
});
app.get("/api/admin/clientes", async (req, res) => {
  const q = z
    .string()
    .trim()
    .max(100)
    .parse(req.query.q || "");
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .parse(req.query.page || 1);
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const filter = q
    ? {
        $or: [
          { name: { $regex: escaped, $options: "i" } },
          { phone: { $regex: escaped } },
        ],
      }
    : {};
  const rows = await Client.find(filter)
    .sort({ name: 1, _id: 1 })
    .skip((page - 1) * 25)
    .limit(26)
    .lean();
  res.json({ items: rows.slice(0, 25), hasMore: rows.length > 25, page });
});
app.post("/api/admin/clientes", async (req, res) =>
  res.status(201).json(await agenda.saveClient(req.body)),
);
app.get("/api/admin/clientes/:id", async (req, res) => {
  const c = await Client.findById(id.parse(req.params.id)).lean();
  if (!c) throw new ApiError(404, "Cliente inexistente");
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .parse(req.query.page || 1);
  const bookings = await Booking.find({ client: c._id })
    .sort({ start: -1, _id: 1 })
    .skip((page - 1) * 25)
    .limit(26)
    .lean();
  res.json({
    client: c,
    bookings: bookings.slice(0, 25),
    hasMore: bookings.length > 25,
    page,
  });
});
app.put("/api/admin/clientes/:id", async (req, res) =>
  res.json(await agenda.saveClient(req.body, req.params.id)),
);
app.use("/api", (_req, _res, next) =>
  next(new ApiError(404, "Ruta inexistente", "NOT_FOUND")),
);
const dist = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../panel/dist",
);
if (existsSync(dist)) {
  app.use(express.static(dist, { maxAge: 0 }));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve(dist, "index.html")));
}
app.use((error, _req, res, _next) => {
  let status = 500,
    body = {
      error: {
        code: "INTERNAL_ERROR",
        message: "No se pudo completar la operación. Intentá nuevamente.",
      },
    };
  if (error instanceof ZodError) {
    status = 400;
    body = {
      error: {
        code: "VALIDATION_ERROR",
        message: "Revisá los datos ingresados.",
        fields: [
          ...new Set(error.issues.map((e) => e.path[0]).filter(Boolean)),
        ],
      },
    };
  } else if (error instanceof ApiError) {
    status = error.status;
    body = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    };
  } else if (error.code === 11000) {
    status = 409;
    body = {
      error: {
        code: "CONFLICT",
        message:
          "Ya existe un registro con esos datos. Actualizá y revisá la operación.",
      },
    };
  } else if (
    error.type === "entity.parse.failed" ||
    error.type === "entity.too.large" ||
    error.status === 415
  ) {
    status = 400;
    body = {
      error: { code: "INVALID_BODY", message: "Formato de solicitud inválido" },
    };
  }
  // No registrar error.message, objetos, URLs ni cuerpos: pueden contener PII.
  if (status >= 500)
    console.error(
      JSON.stringify({ event: "request_failed", code: body.error.code }),
    );
  res.status(status).json(body);
});
export default app;

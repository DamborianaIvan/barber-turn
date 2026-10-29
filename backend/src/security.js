import {
  createHmac,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Admin, Rate, Revoked } from "./models.js";
import { config, cookieName, cookieOptions } from "./config.js";
import { ApiError, username } from "./validation.js";
import { z } from "zod";
export const digest = (value) =>
  createHmac("sha256", config.abuse).update(value).digest("hex");
export function originGuard(req, _res, next) {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.get("origin") !== config.origin
  )
    throw new ApiError(403, "Origen no permitido", "ORIGIN_REJECTED");
  next();
}
export function rateLimit(
  scope,
  limit,
  key = (req) => req.ip,
  windowMs = 15 * 60 * 1000,
) {
  return async (req, res, next) => {
    const bucket = Math.floor(Date.now() / windowMs);
    const _id = `${scope}:${digest(String(key(req)))}:${bucket}`;
    const expires = new Date((bucket + 1) * windowMs);
    let row;
    try {
      row = await Rate.findOneAndUpdate(
        { _id },
        { $inc: { count: 1 }, $setOnInsert: { expires } },
        { upsert: true, new: true },
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      row = await Rate.findOneAndUpdate(
        { _id },
        { $inc: { count: 1 } },
        { new: true },
      );
    }
    if (row.count > limit) {
      res.set(
        "Retry-After",
        String(Math.max(1, Math.ceil((expires - Date.now()) / 1000))),
      );
      throw new ApiError(
        429,
        "Demasiados intentos. Esperá unos minutos.",
        "RATE_LIMITED",
      );
    }
    next();
  };
}
export const parseLogin = (req, _res, next) => {
  req.body = z
    .object({ username, password: z.string().min(1).max(1024) })
    .strict()
    .parse(req.body);
  next();
};
const dummyHash = bcrypt.hashSync("not-an-account-password", 10);
export async function login(req, res) {
  const admin = await Admin.findById("owner").select("+password");
  const matches = await bcrypt.compare(
    req.body.password,
    admin?.password || dummyHash,
  );
  if (!admin?.active || admin.username !== req.body.username || !matches)
    throw new ApiError(
      401,
      "Usuario o contraseña incorrectos",
      "INVALID_LOGIN",
    );
  const csrf = randomBytes(32).toString("hex");
  const token = jwt.sign(
    { id: "owner", sv: admin.sessionVersion, csrf },
    config.jwt,
    {
      algorithm: "HS256",
      expiresIn: "12h",
      jwtid: randomBytes(24).toString("hex"),
      issuer: "barber-turn",
      audience: "barber-admin",
    },
  );
  res
    .cookie(cookieName, token, {
      ...cookieOptions,
      maxAge: 12 * 60 * 60 * 1000,
    })
    .json({ username: admin.username, csrf });
}
export async function protect(req, _res, next) {
  const token = req.cookies[cookieName];
  if (typeof token !== "string")
    throw new ApiError(401, "Iniciá sesión para continuar", "AUTH_REQUIRED");
  let payload;
  try {
    payload = jwt.verify(token, config.jwt, {
      algorithms: ["HS256"],
      issuer: "barber-turn",
      audience: "barber-admin",
    });
  } catch {
    throw new ApiError(
      401,
      "La sesión venció. Iniciá sesión nuevamente.",
      "AUTH_REQUIRED",
    );
  }
  if (
    payload.id !== "owner" ||
    !Number.isInteger(payload.sv) ||
    typeof payload.csrf !== "string" ||
    !Number.isFinite(payload.exp)
  )
    throw new ApiError(401, "Sesión inválida", "AUTH_REQUIRED");
  const hash = createHash("sha256").update(token).digest("hex");
  const admin = await Admin.findById("owner");
  if (
    !admin?.active ||
    admin.sessionVersion !== payload.sv ||
    (await Revoked.exists({ _id: hash }))
  )
    throw new ApiError(401, "Sesión inválida", "AUTH_REQUIRED");
  req.auth = { ...payload, hash, username: admin.username };
  if (!["GET", "HEAD"].includes(req.method)) {
    const received = Buffer.from(req.get("x-csrf-token") || "");
    const expected = Buffer.from(payload.csrf);
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    )
      throw new ApiError(
        403,
        "Actualizá la página antes de continuar",
        "CSRF_REJECTED",
      );
  }
  next();
}
export async function logout(req, res) {
  await Revoked.updateOne(
    { _id: req.auth.hash },
    { $setOnInsert: { expires: new Date(req.auth.exp * 1000) } },
    { upsert: true },
  );
  res.clearCookie(cookieName, cookieOptions).status(204).end();
}

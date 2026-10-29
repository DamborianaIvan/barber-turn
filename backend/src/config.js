export const config = {
  port: Number(process.env.PORT || 5001),
  production: process.env.NODE_ENV === "production",
  origin: process.env.APP_ORIGIN || "http://localhost:5174",
  mongo: process.env.MONGODB_URI,
  jwt: process.env.JWT_SECRET,
  abuse: process.env.ABUSE_SECRET,
  proxy: Number(process.env.TRUST_PROXY || 0),
};
export function validateConfig() {
  if (
    !config.mongo ||
    !config.jwt ||
    config.jwt.length < 32 ||
    !config.abuse ||
    config.abuse.length < 32 ||
    config.abuse === config.jwt
  )
    throw new Error(
      "Configurar MongoDB y dos secretos independientes de al menos 32 caracteres",
    );
  const origin = new URL(config.origin);
  if (
    origin.origin !== config.origin ||
    (config.production && origin.protocol !== "https:")
  )
    throw new Error(
      "APP_ORIGIN debe ser un origen exacto; HTTPS en producción",
    );
  if (!Number.isInteger(config.proxy) || config.proxy < 0 || config.proxy > 5)
    throw new Error("TRUST_PROXY inválido");
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535)
    throw new Error("PORT inválido");
}
export const cookieName = config.production
  ? "__Host-barber-session"
  : "barber-session";
export const cookieOptions = {
  httpOnly: true,
  secure: config.production,
  sameSite: "strict",
  path: "/",
};

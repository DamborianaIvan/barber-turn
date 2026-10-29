import { useEffect, useState } from "react";
let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export class ApiError extends Error {
  status: number;
  details: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...options.headers,
    },
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    if (response.status === 401 && path.startsWith("/admin/"))
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(
      body?.error?.message || "No se pudo completar la operación",
      response.status,
      body?.error?.details,
    );
  }
  return body;
}
export const send = <T>(
  path: string,
  method: string,
  body?: unknown,
  key?: string,
) =>
  api<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: key ? { "Idempotency-Key": key } : {},
  });
export function useData<T>(path: string, version = 0) {
  const [result, setResult] = useState<{
    key: string;
    version: number;
    data?: T;
    error?: string;
  }>({ key: "", version: -1 });
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    api<T>(path, { signal: controller.signal })
      .then((data) => {
        if (current) setResult({ key: path, version, data });
      })
      .catch((e) => {
        if (current && e.name !== "AbortError")
          setResult({ key: path, version, error: e.message });
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [path, version]);
  return result.key === path && result.version === version
    ? { ...result, loading: false }
    : { data: undefined, error: undefined, loading: true };
}
export const zone = "America/Argentina/Buenos_Aires";
export function localDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)?.value)
    .join("-");
}
export function addDays(day: string, n: number) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const hour = (s: string) =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(s));
export const fullDate = (s: string) =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone: zone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(s));
export const whatsapp = (phone: string) =>
  "https://wa.me/" + phone.replace(/\D/g, "");

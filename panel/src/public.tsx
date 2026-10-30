import { useRef, useState } from "react";
import { Alert, Button, Chip, Paper, Stack, TextField } from "@mui/material";
import { Link } from "react-router-dom";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import {
  addDays,
  ApiError,
  fullDate,
  hour,
  localDay,
  send,
  useData,
  whatsapp,
} from "./api";
import { Load } from "./ui";
import type { Shop, Slot } from "./types";
export function PublicBooking() {
  const shop = useData<Shop>("/public/barberia");
  const [day, setDay] = useState(localDay()),
    [version, setVersion] = useState(0);
  const slots = useData<Slot[]>("/public/disponibilidad?date=" + day, version);
  const [selected, setSelected] = useState<Slot>(),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState<Slot & { managementCode?: string }>();
  const attempt = useRef<{ fingerprint: string; key: string } | undefined>(
    undefined,
  );
  const parsed = parsePhoneNumberFromString(phone, "AR");
  async function confirm() {
    if (!selected || !parsed?.isValid()) return;
    const body = {
      slotId: selected.id,
      name: name.trim(),
      phone: parsed.number,
    };
    const fingerprint = JSON.stringify(body);
    if (attempt.current?.fingerprint !== fingerprint)
      attempt.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const result = await send<Slot & { managementCode?: string }>(
        "/public/reservas",
        "POST",
        body,
        attempt.current.key,
      );
      setDone(result);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 409) {
        setSelected(undefined);
        setReview(false);
        setVersion((v) => v + 1);
        attempt.current = undefined;
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="public-page">
      <header className="public-header">
        <Link to="/" className="brand">
          <span className="brand-symbol">B/</span>
          {shop.data?.name || "Barber Turn"}
        </Link>
        <Link to="/login" className="owner-link">
          Acceso del dueño ↗
        </Link>
      </header>
      <div style={{ textAlign: "center", padding: "12px 16px 0" }}><Button component={Link} to="/mi-turno">Consultar o modificar mi turno</Button></div>
      <main className="public-main">
        <section className="intro">
          <span className="eyebrow">BARBERÍA · RESERVAS ONLINE</span>
          <h1>
            Tu corte.
            <br />
            <em>Tu horario.</em>
          </h1>
          <p>
            Elegí tu turno y vení tranquilo.
            <br />
            Elegí el día. Nosotros te esperamos.
          </p>
          <div className="intro-detail">
            <span>01 / Elegí</span>
            <span>02 / Reservá</span>
            <span>03 / Vení</span>
          </div>
          {shop.data?.address && (
            <p className="address">↳ {shop.data.address}</p>
          )}
          <div className="barber-line" aria-hidden="true" />
        </section>
        <Paper component="section" className="booking-panel" variant="outlined">
          <Load loading={shop.loading} error={shop.error} />
          {shop.data &&
            (done ? (
              <Stack spacing={2} role="status">
                <Chip
                  label="Turno confirmado"
                  color="primary"
                  sx={{ alignSelf: "start" }}
                />
                <h2>Nos vemos en la barbería.</h2>
                <p className="confirmation-date">
                  {fullDate(done.start)}
                  <br />
                  <strong>{hour(done.start)} hs</strong>
                </p>
                <p>
                  {shop.data.name}
                  {shop.data.address && <> · {shop.data.address}</>}
                </p>
                <Alert severity="success">
                  Tu reserva quedó guardada. Podés guardar una captura de esta
                  confirmación.
                </Alert>
                {done.managementCode && <Paper variant="outlined" className="review">
                  <h3>Guardá tu código de gestión</h3>
                  <p>Desde acá podés cambiar o cancelar este turno. Quien tenga el código podrá administrarlo.</p>
                  <TextField label="Código de gestión" value={done.managementCode.match(/.{1,4}/g)?.join("-") || ""}
                    slotProps={{ input: { readOnly: true } }}
                    onFocus={(e) => e.target.select()} />
                  <Button onClick={async () => {
                    try { await navigator.clipboard.writeText(done.managementCode!.match(/.{1,4}/g)!.join("-"));
                      setError("Código copiado."); }
                    catch { setError("Seleccioná el código para copiarlo manualmente."); }
                  }}>Copiar código</Button>
                  <Button href="/mi-turno">Administrar mi turno</Button>
                  {error && <p role="status">{error}</p>}
                </Paper>}
                {shop.data.phone ? (
                  <Button
                    href={whatsapp(shop.data.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="outlined"
                  >
                    Contactar por cambios o cancelaciones
                  </Button>
                ) : (
                  <p>
                    Para cambios o cancelaciones, comunicate directamente con la
                    barbería.
                  </p>
                )}
                <Button
                  onClick={() => {
                    setDone(undefined);
                    setSelected(undefined);
                    setReview(false);
                    setVersion((v) => v + 1);
                    attempt.current = undefined;
                  }}
                >
                  Volver a los horarios
                </Button>
              </Stack>
            ) : (
              <>
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">TU PRÓXIMA VISITA</span>
                    <h2>
                      {review ? "Revisá tu turno" : "Encontrá tu horario"}
                    </h2>
                  </div>
                  <Chip label={`${shop.data.duration} min`} />
                </div>
                {error && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                  </Alert>
                )}
                {review && selected ? (
                  <Stack spacing={2}>
                    <Paper className="review" variant="outlined">
                      <b>{fullDate(selected.start)}</b>
                      <p>
                        {hour(selected.start)} — {hour(selected.end)} hs
                      </p>
                      <p>
                        {name.trim()}
                        <br />
                        {parsed?.formatInternational()}
                      </p>
                    </Paper>
                    <p className="small">
                      La reserva se confirma al guardarla. Para modificarla,
                      contactá a la barbería.
                    </p>
                    <Button
                      variant="contained"
                      disabled={busy}
                      onClick={confirm}
                    >
                      {busy ? "Confirmando…" : "Confirmar mi turno"}
                    </Button>
                    <Button disabled={busy} onClick={() => setReview(false)}>
                      Volver y corregir
                    </Button>
                  </Stack>
                ) : (
                  <Stack spacing={2}>
                    <TextField
                      label="Fecha"
                      type="date"
                      value={day}
                      inputProps={{
                        min: localDay(),
                        max: addDays(localDay(), shop.data.horizon - 1),
                      }}
                      slotProps={{ inputLabel: { shrink: true } }}
                      onChange={(e) => {
                        if (e.target.value) {
                          setDay(e.target.value);
                          setSelected(undefined);
                        }
                      }}
                    />
                    <Load
                      loading={slots.loading}
                      error={slots.error}
                      retry={() => setVersion((v) => v + 1)}
                    />
                    {slots.data && (
                      <>
                        <div
                          className="time-grid"
                          role="group"
                          aria-label="Horarios disponibles"
                        >
                          {slots.data.map((s) => (
                            <Button
                              key={s.id}
                              variant={
                                selected?.id === s.id ? "contained" : "outlined"
                              }
                              aria-pressed={selected?.id === s.id}
                              onClick={() => setSelected(s)}
                            >
                              {hour(s.start)}
                            </Button>
                          ))}
                        </div>
                        {!slots.data.length && (
                          <Alert severity="info">
                            No hay horarios disponibles para esta fecha. Probá
                            con otro día.
                          </Alert>
                        )}
                      </>
                    )}
                    {selected && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!parsed?.isValid() || parsed.ext) {
                            setError(
                              "Ingresá un teléfono válido con código de área.",
                            );
                            return;
                          }
                          setError("");
                          setReview(true);
                        }}
                      >
                        <Stack spacing={2}>
                          <div className="chosen">
                            Tu horario:{" "}
                            <strong>{hour(selected.start)} hs</strong> ·{" "}
                            {fullDate(selected.start)}
                          </div>
                          <TextField
                            label="Nombre"
                            autoComplete="name"
                            required
                            value={name}
                            inputProps={{ minLength: 2, maxLength: 100 }}
                            onChange={(e) => setName(e.target.value)}
                          />
                          <TextField
                            label="Teléfono con código de área"
                            type="tel"
                            autoComplete="tel"
                            required
                            value={phone}
                            inputProps={{ maxLength: 40 }}
                            helperText="Ejemplo: +54 9 2266 551234"
                            onChange={(e) => setPhone(e.target.value)}
                          />
                          <p className="small">
                            Usamos estos datos para gestionar tu turno. Tu
                            teléfono no se publica.
                          </p>
                          <Button type="submit" variant="contained">
                            Revisar reserva →
                          </Button>
                        </Stack>
                      </form>
                    )}
                  </Stack>
                )}
              </>
            ))}
        </Paper>
      </main>
      <footer className="public-footer">
        {shop.data?.name || "Barber Turn"}{" "}
        <span>Horarios de Buenos Aires · Argentina</span>
      </footer>
    </div>
  );
}

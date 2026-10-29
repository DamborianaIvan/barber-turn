import { useRef, useState } from "react";
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  TextField,
} from "@mui/material";
import { Link } from "react-router-dom";
import {
  addDays,
  fullDate,
  hour,
  localDay,
  send,
  useData,
  whatsapp,
} from "./api";
import { Load, PageTitle } from "./ui";
import type { Agenda, Booking, Client, Slot } from "./types";
export function AgendaPage() {
  const [day, setDay] = useState(localDay()),
    [version, setVersion] = useState(0),
    [manual, setManual] = useState(false),
    [selected, setSelected] = useState<Booking>();
  const data = useData<Agenda>("/admin/agenda?date=" + day, version);
  const refresh = () => setVersion((v) => v + 1);
  const confirmed =
    data.data?.bookings.filter((b) => b.status === "confirmado") || [];
  const next = confirmed.find((b) => new Date(b.start) > new Date());
  return (
    <>
      <PageTitle
        eyebrow="CADA TURNO, EN SU LUGAR"
        title="Tu agenda"
        description="Una mirada a tu día. Más tiempo para hacer lo tuyo."
      />
      <div className="toolbar">
        <div className="date-controls">
          <Button
            aria-label="Día anterior"
            onClick={() => setDay(addDays(day, -1))}
          >
            ←
          </Button>
          <TextField
            label="Fecha de la agenda"
            type="date"
            value={day}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(e) => e.target.value && setDay(e.target.value)}
          />
          <Button
            aria-label="Día siguiente"
            onClick={() => setDay(addDays(day, 1))}
          >
            →
          </Button>
          <Button onClick={() => setDay(localDay())}>Hoy</Button>
        </div>
        <Button variant="contained" onClick={() => setManual(true)}>
          + Nueva reserva
        </Button>
      </div>
      <Load loading={data.loading} error={data.error} retry={refresh} />
      {data.data && (
        <>
          <div className="stats">
            <Paper variant="outlined">
              <span>Confirmados</span>
              <strong>{confirmed.length}</strong>
            </Paper>
            <Paper variant="outlined">
              <span>Atendidos</span>
              <strong>
                {
                  data.data.bookings.filter((b) => b.status === "atendido")
                    .length
                }
              </strong>
            </Paper>
            <Paper variant="outlined">
              <span>Próximo turno</span>
              <strong>{next ? hour(next.start) : "—"}</strong>
            </Paper>
          </div>
          <div className="section-heading">
            <h2>{fullDate(day + "T12:00:00-03:00")}</h2>
            <Button onClick={refresh}>Actualizar</Button>
          </div>
          {data.data.blocks.map((b) => (
            <Alert key={b._id} severity="warning" sx={{ mb: 1 }}>
              Bloqueado {hour(b.start)}–{hour(b.end)} ·{" "}
              {b.reason || "Sin motivo"}
            </Alert>
          ))}
          {!data.data.slots.length && !data.data.bookings.length && (
            <Paper className="empty" variant="outlined">
              <h3>Tu agenda está por empezar.</h3>
              <p>No hay horarios publicados ni reservas para este día.</p>
              <Button
                component={Link}
                to="/admin/disponibilidad"
                variant="outlined"
              >
                Configurar disponibilidad
              </Button>
            </Paper>
          )}
          <div className="agenda-list">
            {[
              ...data.data.slots.map((s) => ({
                s,
                b: data.data!.bookings.find(
                  (b) => b.slot === s._id && b.status !== "cancelado",
                ),
              })),
              ...data.data.bookings
                .filter(
                  (b) =>
                    b.status !== "cancelado" &&
                    !data.data!.slots.some((s) => s._id === b.slot),
                )
                .map((b) => ({
                  s: { _id: b.slot, start: b.start, end: b.end },
                  b,
                })),
            ]
              .sort((a, b) => a.s.start.localeCompare(b.s.start))
              .map(({ s, b }) => {
                const blocked = data.data!.blocks.some(
                  (x) => x.start < s.end && x.end > s.start,
                );
                const past = new Date(s.start) <= new Date();
                return (
                  <Paper
                    variant="outlined"
                    className={"agenda-row " + (b ? "occupied" : "")}
                    key={s._id}
                  >
                    <div className="agenda-time">
                      {hour(s.start)}
                      <small>{hour(s.end)}</small>
                    </div>
                    <div className="agenda-person">
                      <strong>
                        {b
                          ? b.name
                          : blocked
                            ? "Horario bloqueado"
                            : past
                              ? "Sin reserva"
                              : "Horario disponible"}
                      </strong>
                      {b && <span>{b.phone}</span>}
                    </div>
                    <Chip
                      size="small"
                      label={
                        b
                          ? b.status
                          : blocked
                            ? "Bloqueado"
                            : past
                              ? "Pasado"
                              : "Libre"
                      }
                      color={b?.status === "confirmado" ? "primary" : "default"}
                      variant={b ? "filled" : "outlined"}
                    />
                    {b ? (
                      <Button onClick={() => setSelected(b)}>Ver turno</Button>
                    ) : (
                      !blocked &&
                      !past && (
                        <Button onClick={() => setManual(true)}>
                          Reservar
                        </Button>
                      )
                    )}
                  </Paper>
                );
              })}
          </div>
          {data.data.bookings.some((b) => b.status === "cancelado") && (
            <details className="cancelled">
              <summary>
                Reservas canceladas (
                {
                  data.data.bookings.filter((b) => b.status === "cancelado")
                    .length
                }
                )
              </summary>
              {data.data.bookings
                .filter((b) => b.status === "cancelado")
                .map((b) => (
                  <p key={b._id}>
                    {hour(b.start)} · {b.name}{" "}
                    <Button onClick={() => setSelected(b)}>Ver</Button>
                  </p>
                ))}
            </details>
          )}
        </>
      )}
      {manual && (
        <ManualBooking
          day={day}
          onClose={() => setManual(false)}
          onSaved={() => {
            setManual(false);
            refresh();
          }}
        />
      )}
      {selected && (
        <BookingDetail
          booking={selected}
          onClose={() => setSelected(undefined)}
          onSaved={() => {
            setSelected(undefined);
            refresh();
          }}
        />
      )}
    </>
  );
}
function ManualBooking({
  day: onDay,
  onClose,
  onSaved,
}: {
  day: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [day, setDay] = useState(onDay),
    [slotId, setSlot] = useState(""),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  const slots = useData<Slot[]>("/public/disponibilidad?date=" + day, version);
  const attempt = useRef<{ fingerprint: string; key: string } | undefined>(
    undefined,
  );
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Nueva reserva manual</DialogTitle>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const body = { slotId, name, phone };
          const fingerprint = JSON.stringify(body);
          if (attempt.current?.fingerprint !== fingerprint)
            attempt.current = { fingerprint, key: crypto.randomUUID() };
          try {
            await send("/admin/reservas", "POST", body, attempt.current.key);
            onSaved();
          } catch (e) {
            setError((e as Error).message);
            setVersion((v) => v + 1);
            setSlot("");
          } finally {
            setBusy(false);
          }
        }}
      >
        <DialogContent>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Fecha"
              type="date"
              required
              value={day}
              inputProps={{ min: localDay() }}
              slotProps={{ inputLabel: { shrink: true } }}
              onChange={(e) => {
                setDay(e.target.value);
                setSlot("");
              }}
            />
            <Load loading={slots.loading} error={slots.error} />
            {slots.data && (
              <TextField
                select
                label="Horario"
                required
                value={slotId}
                onChange={(e) => setSlot(e.target.value)}
              >
                {slots.data.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {hour(s.start)}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {slots.data?.length === 0 && (
              <Alert severity="info">
                No hay horarios disponibles. Publicá horarios desde
                Disponibilidad o elegí otra fecha.
              </Alert>
            )}
            <TextField
              label="Nombre"
              value={name}
              required
              inputProps={{ minLength: 2, maxLength: 100 }}
              onChange={(e) => setName(e.target.value)}
            />
            <TextField
              label="Teléfono con código de área"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" variant="contained" disabled={busy || !slotId}>
            {busy ? "Guardando…" : "Confirmar reserva"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
export function BookingDetail({
  booking: b,
  onClose,
  onSaved,
}: {
  booking: Booking;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [day, setDay] = useState(localDay(new Date(b.start))),
    [target, setTarget] = useState(""),
    [mode, setMode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [q, setQ] = useState(""),
    [clientId, setClientId] = useState("");
  const slots = useData<Slot[]>("/public/disponibilidad?date=" + day);
  const clients = useData<{ items: Client[] }>(
    "/admin/clientes?q=" + encodeURIComponent(q),
  );
  const events = useData<{ _id: string; action: string; createdAt: string }[]>(
    "/admin/reservas/" + b._id + "/eventos",
  );
  const client = typeof b.client === "string" ? undefined : b.client;
  async function change(value: Record<string, string>) {
    setBusy(true);
    setError("");
    try {
      await send("/admin/reservas/" + b._id, "PATCH", {
        ...value,
        revision: b.revision,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{b.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <span>
            {fullDate(b.start)} · {hour(b.start)}–{hour(b.end)} hs
          </span>
          <Chip label={b.status} sx={{ alignSelf: "start" }} />
          <a href={whatsapp(b.phone)} target="_blank" rel="noopener noreferrer">
            WhatsApp · {b.phone} ↗
          </a>
          {client && client.name !== b.name && (
            <Alert severity="warning">
              El nombre declarado difiere del registro: {client.name}. Revisá la
              asociación; el teléfono no verifica identidad.
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {b.status === "confirmado" && (
            <div className="action-grid">
              <Button
                variant="outlined"
                disabled={busy || new Date(b.start) > new Date()}
                onClick={() => change({ status: "atendido" })}
              >
                Marcar atendido
              </Button>
              <Button
                variant="outlined"
                disabled={busy || new Date(b.end) > new Date()}
                onClick={() => change({ status: "ausente" })}
              >
                Marcar ausencia
              </Button>
              <Button
                disabled={busy || new Date(b.start) <= new Date()}
                onClick={() => setMode("move")}
              >
                Reprogramar
              </Button>
              <Button
                color="error"
                disabled={busy}
                onClick={() => setMode("cancel")}
              >
                Cancelar turno
              </Button>
            </div>
          )}
          {mode === "cancel" && (
            <Alert
              severity="warning"
              action={
                <Button
                  disabled={busy}
                  color="error"
                  onClick={() => change({ status: "cancelado" })}
                >
                  Sí, cancelar
                </Button>
              }
            >
              Se conservará el historial y se liberará el horario si
              corresponde.
            </Alert>
          )}
          {mode === "move" && (
            <>
              <TextField
                label="Nueva fecha"
                type="date"
                value={day}
                inputProps={{ min: localDay() }}
                slotProps={{ inputLabel: { shrink: true } }}
                onChange={(e) => {
                  setDay(e.target.value);
                  setTarget("");
                }}
              />
              <Load loading={slots.loading} error={slots.error} />
              {slots.data && (
                <TextField
                  label="Nuevo horario"
                  select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  {slots.data.map((s) => (
                    <MenuItem value={s.id} key={s.id}>
                      {hour(s.start)}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              {slots.data?.length === 0 && (
                <p>No hay horarios disponibles para esta fecha.</p>
              )}
              <Button
                variant="contained"
                disabled={busy || !target}
                onClick={() => change({ slotId: target })}
              >
                Confirmar reprogramación
              </Button>
            </>
          )}
          <Button onClick={() => setMode(mode === "client" ? "" : "client")}>
            Corregir cliente asociado
          </Button>
          {mode === "client" && (
            <>
              <TextField
                label="Buscar cliente por nombre o teléfono"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setClientId("");
                }}
              />
              <Load loading={clients.loading} error={clients.error} />
              {clients.data && (
                <TextField
                  label="Cliente correcto"
                  select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  {clients.data.items.map((c) => (
                    <MenuItem key={c._id} value={c._id}>
                      {c.name} · {c.phone}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              <Button
                disabled={busy || !clientId}
                onClick={() => change({ clientId })}
              >
                Guardar asociación
              </Button>
            </>
          )}
          <details>
            <summary>Historial de cambios</summary>
            <Load loading={events.loading} error={events.error} />
            {events.data?.map((e) => (
              <p key={e._id}>
                {fullDate(e.createdAt)} · {hour(e.createdAt)} ·{" "}
                {e.action.replaceAll("_", " ")}
              </p>
            ))}
          </details>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onClose}>
          Cerrar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

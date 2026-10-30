import { useState } from "react";
import {
  Alert,
  Checkbox,
  FormControlLabel,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
} from "@mui/material";
import { fullDate, hour, send, useData, whatsapp } from "./api";
import { Load, PageTitle } from "./ui";
import type { Booking, Client } from "./types";
import { BookingDetail } from "./ownerAgenda";
export function ClientsPage() {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [version, setVersion] = useState(0),
    [selected, setSelected] = useState<string>(),
    [creating, setCreating] = useState(false);
  const state = useData<{ items: Client[]; hasMore: boolean }>(
    "/admin/clientes?q=" + encodeURIComponent(q) + "&page=" + page,
    version,
  );
  return (
    <>
      <PageTitle
        eyebrow="PERSONAS QUE VUELVEN"
        title="Tus clientes"
        description="Datos de contacto, próximos turnos y una historia que sigue creciendo."
      />
      <div className="toolbar">
        <TextField
          label="Buscar por nombre o teléfono"
          value={q}
          sx={{ maxWidth: 450 }}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <Button variant="contained" onClick={() => setCreating(true)}>
          + Nuevo cliente
        </Button>
      </div>
      <Load
        loading={state.loading}
        error={state.error}
        retry={() => setVersion((v) => v + 1)}
      />
      {state.data && (
        <>
          <div className="client-list">
            {state.data.items.map((c) => (
              <Paper key={c._id} variant="outlined" className="client-row">
                <span className="avatar" aria-hidden="true">
                  {c.name.charAt(0).toUpperCase()}
                </span>
                <div>
                  <strong>{c.name}</strong>
                  <span>{c.phone}{c.bookingBlocked ? " · Reservas online bloqueadas" : ""}</span>
                </div>
                <Button onClick={() => setSelected(c._id)}>Ver ficha</Button>
              </Paper>
            ))}
          </div>
          {!state.data.items.length && (
            <Paper className="empty" variant="outlined">
              <h3>
                {q
                  ? "No encontramos coincidencias."
                  : "Tu lista de clientes empieza acá."}
              </h3>
              <p>
                {q
                  ? "Probá con otro nombre o teléfono."
                  : "Los clientes se agregan al reservar. También podés crearlos manualmente."}
              </p>
            </Paper>
          )}
          <div className="pagination">
            <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <span>Página {page}</span>
            <Button
              disabled={!state.data.hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </>
      )}
      {creating && (
        <ClientEditor
          onClose={() => setCreating(false)}
          saved={() => {
            setCreating(false);
            setVersion((v) => v + 1);
          }}
        />
      )}
      {selected && (
        <ClientDetail
          clientId={selected}
          onClose={() => {
            setSelected(undefined);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </>
  );
}
function ClientDetail({
  clientId,
  onClose,
}: {
  clientId: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1),
    [version, setVersion] = useState(0),
    [editing, setEditing] = useState(false),
    [booking, setBooking] = useState<Booking>();
  const state = useData<{
    client: Client;
    bookings: Booking[];
    hasMore: boolean;
  }>("/admin/clientes/" + clientId + "?page=" + page, version);
  return (
    <>
      <Dialog open onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle>Ficha del cliente</DialogTitle>
        <DialogContent>
          <Load
            loading={state.loading}
            error={state.error}
            retry={() => setVersion((v) => v + 1)}
          />
          {state.data && (
            <Stack spacing={2}>
              <h2>{state.data.client.name}</h2>
              {state.data.client.bookingBlocked && <Alert severity="warning">
                Este número no puede crear reservas online. Sus turnos existentes se conservan.
              </Alert>}
              <a
                href={whatsapp(state.data.client.phone)}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp · {state.data.client.phone} ↗
              </a>
              <Button variant="outlined" onClick={() => setEditing(true)}>
                Editar datos y notas
              </Button>
              <Paper variant="outlined" className="review">
                <b>Notas internas</b>
                <p style={{ whiteSpace: "pre-wrap" }}>
                  {state.data.client.notes || "Sin notas."}
                </p>
              </Paper>
              <h3>Turnos anteriores y próximos</h3>
              {!state.data.bookings.length && (
                <p>Todavía no tiene reservas asociadas.</p>
              )}
              {state.data.bookings.map((b) => (
                <div className="history-row" key={b._id}>
                  <div>
                    <strong>
                      {fullDate(b.start)} · {hour(b.start)}
                    </strong>
                    <small>
                      {b.status}
                      {new Date(b.start) > new Date() ? " · Próximo" : ""}
                    </small>
                  </div>
                  <Button onClick={() => setBooking(b)}>Ver</Button>
                </div>
              ))}
              <div className="pagination">
                <Button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <span>{page}</span>
                <Button
                  disabled={!state.data.hasMore}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogActions>
      </Dialog>
      {editing && state.data && (
        <ClientEditor
          initial={state.data.client}
          onClose={() => setEditing(false)}
          saved={() => {
            setEditing(false);
            setVersion((v) => v + 1);
          }}
        />
      )}
      {booking && (
        <BookingDetail
          booking={booking}
          onClose={() => setBooking(undefined)}
          onSaved={() => {
            setBooking(undefined);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </>
  );
}
function ClientEditor({
  initial,
  onClose,
  saved,
}: {
  initial?: Client;
  onClose: () => void;
  saved: () => void;
}) {
  const [name, setName] = useState(initial?.name || ""),
    [phone, setPhone] = useState(initial?.phone || ""),
    [bookingBlocked, setBookingBlocked] = useState(initial?.bookingBlocked || false),
    [notes, setNotes] = useState(initial?.notes || ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{initial ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await send(
              "/admin/clientes" + (initial ? "/" + initial._id : ""),
              initial ? "PUT" : "POST",
              {
                name,
                phone,
                notes,
                bookingBlocked,
                ...(initial ? { revision: initial.revision } : {}),
              },
            );
            saved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <DialogContent>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Nombre"
              required
              value={name}
              inputProps={{ minLength: 2, maxLength: 100 }}
              onChange={(e) => setName(e.target.value)}
            />
            <TextField
              disabled={Boolean(initial?.bookingBlocked)}
              label="Teléfono con código de área"
              type="tel"
              required
              value={phone}
              inputProps={{ maxLength: 40 }}
              onChange={(e) => setPhone(e.target.value)}
            />
            <FormControlLabel control={<Checkbox checked={bookingBlocked}
              onChange={(e) => setBookingBlocked(e.target.checked)} />}
              label="Bloquear nuevas reservas online de este número" />
            <p className="small">No cancela turnos existentes. Podés seguir reservando manualmente.
              Para cambiar un número bloqueado, guardá primero el desbloqueo.</p>
            <TextField
              label="Notas internas"
              multiline
              minRows={3}
              value={notes}
              inputProps={{ maxLength: 1000 }}
              helperText="Solo visibles para el administrador."
              onChange={(e) => setNotes(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? "Guardando…" : "Guardar cliente"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

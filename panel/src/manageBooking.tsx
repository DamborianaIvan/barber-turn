import { useEffect, useState } from "react";
import { Alert, Button, Paper, Stack, TextField } from "@mui/material";
import { Link } from "react-router-dom";
import { addDays, fullDate, hour, localDay, send, useData } from "./api";
import { Load } from "./ui";
import type { Shop, Slot } from "./types";
type Managed = { start: string; end: string; status: string; revision: number };
export function ManageBooking() {
  // Fragment never reaches HTTP access logs or Referrer headers.
  const [token] = useState(() => window.location.hash.slice(1));
  const [booking, setBooking] = useState<Managed>();
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"cancel" | "reschedule">();
  const [day, setDay] = useState(localDay()), [slot, setSlot] = useState<Slot>();
  const [version, setVersion] = useState(0);
  const shop = useData<Shop>("/public/barberia");
  useEffect(() => {
    let current = true;
    if (!/^[a-f0-9]{64}$/.test(token)) {
      setError("El enlace está incompleto. Usá el enlace privado de tu confirmación.");
      setLoading(false); return;
    }
    send<Managed>("/public/turno/consultar", "POST", { token })
      .then((b) => { if (current) setBooking(b); })
      .catch((e) => { if (current) setError(e.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [token]);
  async function apply() {
    if (!booking || !mode || (mode === "reschedule" && !slot)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const b = await send<Managed>("/public/turno/modificar", "POST", {
        token, revision: booking.revision, action: mode,
        ...(mode === "reschedule" ? { slotId: slot!.id } : {}),
      });
      setBooking(b); setMode(undefined); setSlot(undefined);
      setNotice(b.status === "cancelado" ? "Tu turno fue cancelado." : "Tu turno fue reprogramado.");
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message); setSlot(undefined); setVersion((v) => v + 1);
      // Recover current revision after competing edits or a lost response.
      try { setBooking(await send<Managed>("/public/turno/consultar", "POST", { token })); }
      catch { setBooking(undefined); }
    } finally { setBusy(false); }
  }
  return <main className="login shell">
    <Link to="/" className="brand">{shop.data?.name || "Barber Turn"}</Link>
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 4 }, width: "100%", maxWidth: 550 }}>
      <Stack spacing={2}>
        <h1>Tu turno</h1>
        <Load loading={loading} />
        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
        {booking && booking.status !== "cancelado" && <>
          <p className="confirmation-date">{fullDate(booking.start)}<br /><strong>{hour(booking.start)} hs</strong></p>
          <p>Podés modificarlo hasta antes de que comience. Si perdés el enlace, contactá a la barbería.</p>
          <div className="action-grid">
            <Button disabled={busy} variant="outlined" onClick={() => { setMode("reschedule"); setSlot(undefined); }}>Cambiar horario</Button>
            <Button disabled={busy} color="error" onClick={() => setMode("cancel")}>Cancelar turno</Button>
          </div>
          {mode === "cancel" && <Alert severity="warning">¿Querés cancelar este turno? El horario quedará libre y este enlace dejará de funcionar.</Alert>}
          {mode === "reschedule" && shop.data && <>
            <TextField label="Nueva fecha" type="date" value={day} disabled={busy}
              inputProps={{ min: localDay(), max: addDays(localDay(), shop.data.horizon - 1) }}
              slotProps={{ inputLabel: { shrink: true } }}
              onChange={(e) => { if (e.target.value) { setDay(e.target.value); setSlot(undefined); } }} />
            <Available day={day} version={version} selected={slot?.id} busy={busy} choose={setSlot} />
            {slot && <p>Nuevo turno: {fullDate(slot.start)} · {hour(slot.start)} hs. Tu turno actual se conserva hasta confirmar el cambio.</p>}
          </>}
          {mode && <Button variant="contained" color={mode === "cancel" ? "error" : "primary"}
            disabled={busy || (mode === "reschedule" && !slot)} onClick={apply}>
            {busy ? "Guardando…" : mode === "cancel" ? "Sí, cancelar mi turno" : "Confirmar nuevo horario"}
          </Button>}
        </>}
        <Button component={Link} to="/">Volver a la barbería</Button>
      </Stack>
    </Paper>
  </main>;
}
function Available({ day, version, selected, busy, choose }: {
  day: string; version: number; selected?: string; busy: boolean; choose: (slot: Slot) => void;
}) {
  const slots = useData<Slot[]>("/public/disponibilidad?date=" + day, version);
  return <>
    <Load loading={slots.loading} error={slots.error} />
    {slots.data && !slots.data.length && <Alert severity="info">No hay horarios libres. Elegí otro día.</Alert>}
    <div className="time-grid">{slots.data?.map((s) => <Button key={s.id} disabled={busy}
      aria-pressed={selected === s.id} variant={selected === s.id ? "contained" : "outlined"}
      onClick={() => choose(s)}>{hour(s.start)}</Button>)}</div>
  </>;
}

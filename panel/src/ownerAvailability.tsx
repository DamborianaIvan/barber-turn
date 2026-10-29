import { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
} from "@mui/material";
import { addDays, fullDate, hour, localDay, send, useData } from "./api";
import { Load, PageTitle } from "./ui";
import type { Agenda, Settings } from "./types";
const weekdays = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
export function AvailabilityPage() {
  const [version, setVersion] = useState(0),
    [tab, setTab] = useState(0);
  const state = useData<Settings>("/admin/configuracion", version);
  return (
    <>
      <PageTitle
        eyebrow="UNA AGENDA A TU MEDIDA"
        title="Disponibilidad"
        description="Definí cómo trabajás y publicá los horarios que tus clientes pueden reservar."
      />
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 3 }}
      >
        <Tab label="Horarios habituales" />
        <Tab label="Publicar agenda" />
        <Tab label="Excepciones" />
        <Tab label="Barbería" />
      </Tabs>
      <Load
        loading={state.loading}
        error={state.error}
        retry={() => setVersion((v) => v + 1)}
      />
      {state.data &&
        (tab === 0 || tab === 3 ? (
          <SettingsForm
            key={`${state.data.revision}-${tab}`}
            initial={state.data}
            shopOnly={tab === 3}
            saved={() => setVersion((v) => v + 1)}
          />
        ) : tab === 1 ? (
          <Publish settings={state.data} />
        ) : (
          <Exceptions />
        ))}
    </>
  );
}
function SettingsForm({
  initial,
  shopOnly,
  saved,
}: {
  initial: Settings;
  shopOnly: boolean;
  saved: () => void;
}) {
  const [value, setValue] = useState(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  function ranges(day: string, next: [string, string][]) {
    setValue((v) => ({ ...v, weekly: { ...v.weekly, [day]: next } }));
  }
  return (
    <Paper variant="outlined" className="editor">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const {
              name,
              phone,
              address,
              duration,
              horizon,
              weekly,
              revision,
            } = value;
            await send("/admin/configuracion", "PUT", {
              name,
              phone,
              address,
              duration,
              horizon,
              weekly,
              revision,
            });
            saved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Stack spacing={3}>
          {error && <Alert severity="error">{error}</Alert>}
          {shopOnly ? (
            <>
              <h2>Así te ven tus clientes</h2>
              <TextField
                label="Nombre de la barbería"
                required
                value={value.name}
                inputProps={{ maxLength: 100, minLength: 2 }}
                onChange={(e) => setValue({ ...value, name: e.target.value })}
              />
              <TextField
                label="Teléfono de contacto / WhatsApp"
                type="tel"
                value={value.phone}
                onChange={(e) => setValue({ ...value, phone: e.target.value })}
              />
              <TextField
                label="Dirección (opcional)"
                value={value.address}
                inputProps={{ maxLength: 200 }}
                onChange={(e) =>
                  setValue({ ...value, address: e.target.value })
                }
              />
            </>
          ) : (
            <>
              <Alert severity="info">
                Guardar cambia la plantilla. Los turnos ya publicados se
                conservan. Aplicá los nuevos horarios desde “Publicar agenda”,
                eligiendo una fecha de inicio.
              </Alert>
              <div className="two-fields">
                <TextField
                  label="Duración de cada turno (minutos)"
                  type="number"
                  value={value.duration}
                  inputProps={{ min: 5, max: 240 }}
                  onChange={(e) =>
                    setValue({ ...value, duration: Number(e.target.value) })
                  }
                />
                <TextField
                  label="Días habilitados hacia adelante"
                  type="number"
                  value={value.horizon}
                  inputProps={{ min: 1, max: 90 }}
                  onChange={(e) =>
                    setValue({ ...value, horizon: Number(e.target.value) })
                  }
                />
              </div>
              {value.horizon < initial.horizon && (
                <Alert severity="warning">
                  Se ocultarán al público fechas fuera del nuevo horizonte. Las
                  reservas existentes permanecerán en la agenda.
                </Alert>
              )}
              {weekdays.map((label, i) => {
                const key = String(i + 1),
                  items = value.weekly[key] || [];
                return (
                  <div className="weekly-row" key={key}>
                    <div>
                      <strong>{label}</strong>
                      <FormControlLabel
                        label={items.length ? "Abierto" : "Cerrado"}
                        control={
                          <Checkbox
                            checked={items.length > 0}
                            onChange={(e) =>
                              ranges(
                                key,
                                e.target.checked ? [["09:00", "13:00"]] : [],
                              )
                            }
                          />
                        }
                      />
                    </div>
                    <div>
                      {items.map(([from, to], j) => (
                        <div className="range-row" key={j}>
                          <TextField
                            label={`${label}: desde ${j + 1}`}
                            type="time"
                            value={from}
                            onChange={(e) =>
                              ranges(
                                key,
                                items.map((r, n) =>
                                  n === j ? [e.target.value, r[1]] : r,
                                ),
                              )
                            }
                          />
                          <TextField
                            label={`${label}: hasta ${j + 1}`}
                            type="time"
                            value={to}
                            onChange={(e) =>
                              ranges(
                                key,
                                items.map((r, n) =>
                                  n === j ? [r[0], e.target.value] : r,
                                ),
                              )
                            }
                          />
                          <Button
                            aria-label={`Quitar rango ${j + 1} del ${label}`}
                            onClick={() =>
                              ranges(
                                key,
                                items.filter((_, n) => n !== j),
                              )
                            }
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                      {items.length > 0 && items.length < 4 && (
                        <Button
                          onClick={() =>
                            ranges(key, [...items, ["16:00", "20:00"]])
                          }
                        >
                          + Agregar rango
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
          <Button
            type="submit"
            variant="contained"
            disabled={busy}
            sx={{ alignSelf: "start" }}
          >
            {busy ? "Guardando…" : "Guardar configuración"}
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}
type Preview = {
  create: number;
  retire: number;
  conflicts: { id: string; start: string; end: string }[];
};
function Publish({ settings }: { settings: Settings }) {
  const [from, setFrom] = useState(localDay()),
    [to, setTo] = useState(addDays(localDay(), settings.horizon - 1)),
    [replace, setReplace] = useState(false),
    [preserve, setPreserve] = useState(false),
    [preview, setPreview] = useState<Preview>(),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  const input = {
    from,
    to,
    replace,
    preserveReservations: preserve,
    settingsRevision: settings.revision,
  };
  async function run(apply = false) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await send<Preview>(
        "/admin/disponibilidad/" + (apply ? "generar" : "previsualizar"),
        "POST",
        input,
      );
      if (apply) {
        setSuccess(
          "Disponibilidad publicada. Las reservas conservan sus horarios.",
        );
        setPreview(undefined);
      } else setPreview(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Paper variant="outlined" className="editor">
      <Stack spacing={2}>
        <h2>Publicá un período</h2>
        <p>
          Se usarán tus horarios habituales y turnos de {settings.duration}{" "}
          minutos. Los bloqueos siempre se respetan.
        </p>
        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}
        <div className="two-fields">
          <TextField
            label="Desde / fecha de vigencia"
            type="date"
            value={from}
            inputProps={{
              min: localDay(),
              max: addDays(localDay(), settings.horizon - 1),
            }}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreview(undefined);
            }}
          />
          <TextField
            label="Hasta inclusive"
            type="date"
            value={to}
            inputProps={{
              min: from,
              max: addDays(localDay(), settings.horizon - 1),
            }}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(e) => {
              setTo(e.target.value);
              setPreview(undefined);
            }}
          />
        </div>
        <TextField
          select
          label="Qué hacer con los horarios actuales"
          value={replace ? "replace" : "append"}
          onChange={(e) => {
            setReplace(e.target.value === "replace");
            setPreview(undefined);
            setPreserve(false);
          }}
        >
          <MenuItem value="append">Agregar horarios faltantes</MenuItem>
          <MenuItem value="replace">
            Reemplazar horarios futuros libres del período
          </MenuItem>
        </TextField>
        <Button
          variant="outlined"
          disabled={busy || !from || !to}
          onClick={() => run()}
        >
          Previsualizar cambios
        </Button>
        {preview && (
          <Paper className="review" variant="outlined">
            <p>
              <strong>{preview.create}</strong> horarios para publicar ·{" "}
              <strong>{preview.retire}</strong> horarios para retirar
            </p>
            {preview.conflicts.length > 0 && (
              <>
                <Alert severity="warning">
                  Hay {preview.conflicts.length} reservas en el período. No se
                  cambiarán automáticamente.
                </Alert>
                <ul>
                  {preview.conflicts.map((b) => (
                    <li key={b.id}>
                      {fullDate(b.start)} · {hour(b.start)}–{hour(b.end)}
                    </li>
                  ))}
                </ul>
                <FormControlLabel
                  label="Conservar estas reservas como excepciones con su duración original"
                  control={
                    <Checkbox
                      checked={preserve}
                      onChange={(e) => setPreserve(e.target.checked)}
                    />
                  }
                />
                <p className="small">
                  Si necesitás cambiarlas, reprogramalas o cancelalas desde
                  Agenda y volvé a previsualizar.
                </p>
              </>
            )}
            <Button
              variant="contained"
              disabled={busy || (preview.conflicts.length > 0 && !preserve)}
              onClick={() => run(true)}
            >
              {busy ? "Publicando…" : "Aplicar y publicar"}
            </Button>
          </Paper>
        )}
      </Stack>
    </Paper>
  );
}
function Exceptions() {
  const [day, setDay] = useState(localDay()),
    [version, setVersion] = useState(0),
    [at, setAt] = useState("10:00"),
    [allDay, setAllDay] = useState(true),
    [from, setFrom] = useState("13:00"),
    [to, setTo] = useState("14:00"),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const agenda = useData<Agenda>("/admin/agenda?date=" + day, version);
  async function run(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await send(path, method, body);
      setVersion((v) => v + 1);
      setMessage("Cambio guardado.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}
      <TextField
        label="Fecha de la excepción"
        type="date"
        value={day}
        inputProps={{ min: localDay() }}
        slotProps={{ inputLabel: { shrink: true } }}
        onChange={(e) => e.target.value && setDay(e.target.value)}
        sx={{ maxWidth: 300 }}
      />
      <div className="two-panels">
        <Paper variant="outlined" className="editor">
          <Stack spacing={2}>
            <h2>Agregar un horario</h2>
            <p>
              Una excepción a la semana habitual, con la duración configurada.
            </p>
            <TextField
              label="Hora de inicio"
              type="time"
              value={at}
              onChange={(e) => setAt(e.target.value)}
            />
            <Button
              variant="outlined"
              disabled={busy}
              onClick={() =>
                run("/admin/horarios", "POST", { date: day, time: at })
              }
            >
              Agregar horario
            </Button>
          </Stack>
        </Paper>
        <Paper variant="outlined" className="editor">
          <Stack spacing={2}>
            <h2>Bloquear disponibilidad</h2>
            <FormControlLabel
              label="Día completo"
              control={
                <Checkbox
                  checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                />
              }
            />
            {!allDay && (
              <div className="two-fields">
                <TextField
                  label="Desde"
                  type="time"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
                <TextField
                  label="Hasta"
                  type="time"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            )}
            <TextField
              label="Motivo interno (opcional)"
              value={reason}
              inputProps={{ maxLength: 200 }}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button
              variant="outlined"
              disabled={busy}
              onClick={() =>
                run("/admin/bloqueos", "POST", {
                  date: day,
                  ...(!allDay ? { from, to } : {}),
                  reason,
                })
              }
            >
              Bloquear {allDay ? "día" : "rango"}
            </Button>
          </Stack>
        </Paper>
      </div>
      <Load
        loading={agenda.loading}
        error={agenda.error}
        retry={() => setVersion((v) => v + 1)}
      />
      {agenda.data && (
        <Paper variant="outlined" className="editor">
          <h2>Bloqueos del día</h2>
          {!agenda.data.blocks.length ? (
            <p>No hay bloqueos para esta fecha.</p>
          ) : (
            agenda.data.blocks.map((b) => (
              <div className="block-row" key={b._id}>
                <span>
                  {hour(b.start)}–{hour(b.end)} · {b.reason || "Sin motivo"}
                </span>
                <Button
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "¿Quitar el bloqueo y volver a habilitar los horarios publicados?",
                      )
                    )
                      run("/admin/bloqueos/" + b._id, "DELETE");
                  }}
                >
                  Quitar bloqueo
                </Button>
              </div>
            ))
          )}
        </Paper>
      )}
    </Stack>
  );
}

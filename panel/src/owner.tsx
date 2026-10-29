import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { Alert, Button, Paper, Stack, TextField } from "@mui/material";
import { api, send, setCsrf } from "./api";
import { Load } from "./ui";
import { AgendaPage } from "./ownerAgenda";
import { AvailabilityPage } from "./ownerAvailability";
import { ClientsPage } from "./ownerClients";
export function Login() {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  return (
    <main className="login shell">
      <Link to="/" className="brand">
        <span className="brand-symbol">B/</span>Barber Turn
      </Link>
      <Paper variant="outlined" sx={{ p: 4, width: "100%", maxWidth: 430 }}>
        <span className="eyebrow">TU BARBERÍA, ORGANIZADA</span>
        <h1>Bienvenido de nuevo.</h1>
        <p>Ingresá para administrar tu agenda.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const s = await send<{ csrf: string }>("/auth/login", "POST", {
                username,
                password,
              });
              setCsrf(s.csrf);
              navigate("/admin", { replace: true });
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Usuario"
              required
              value={username}
              autoComplete="username"
              onChange={(e) => setUsername(e.target.value)}
            />
            <TextField
              label="Contraseña"
              required
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" variant="contained" disabled={busy}>
              {busy ? "Ingresando…" : "Entrar al panel"}
            </Button>
          </Stack>
        </form>
        <p className="small">
          El acceso es exclusivo del dueño. No necesitás cuenta para reservar.
        </p>
      </Paper>
    </main>
  );
}
export function Owner() {
  const [session, setSession] = useState<{
      username: string;
      csrf: string;
    } | null>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    api<{ username: string; csrf: string }>("/auth/session")
      .then((s) => {
        if (active) {
          setCsrf(s.csrf);
          setSession(s);
          setError("");
        }
      })
      .catch((e) => {
        if (active) {
          if (e.status === 401) setSession(null);
          else setError(e.message);
        }
      });
    return () => {
      active = false;
    };
  }, [version]);
  useEffect(() => {
    const handler = () => {
      setCsrf("");
      setSession(null);
    };
    window.addEventListener("session-expired", handler);
    return () => window.removeEventListener("session-expired", handler);
  }, []);
  if (session === null) return <Navigate to="/login" replace />;
  if (!session)
    return (
      <main className="shell">
        <Load
          loading={!error}
          error={error}
          retry={() => setVersion((v) => v + 1)}
        />
      </main>
    );
  return (
    <div className="owner-shell">
      <aside className="sidebar">
        <Link to="/admin" className="brand">
          <span className="brand-symbol">B/</span>Barber Turn
        </Link>
        <span className="eyebrow nav-label">ESPACIO DEL DUEÑO</span>
        <nav aria-label="Panel">
          <NavLink to="/admin" end>
            ◷ <span>Agenda</span>
          </NavLink>
          <NavLink to="/admin/disponibilidad">
            ▦ <span>Disponibilidad</span>
          </NavLink>
          <NavLink to="/admin/clientes">
            ♧ <span>Clientes</span>
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <a href="/" target="_blank" rel="noopener noreferrer">
            Ver reservas públicas ↗
          </a>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await send("/auth/logout", "POST");
                setCsrf("");
                setSession(null);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Cerrar sesión
          </Button>
        </div>
      </aside>
      <main className="owner-content">
        {error && (
          <Alert severity="error" onClose={() => setError("")} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Routes>
          <Route index element={<AgendaPage />} />
          <Route path="disponibilidad" element={<AvailabilityPage />} />
          <Route path="clientes" element={<ClientsPage />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  );
}

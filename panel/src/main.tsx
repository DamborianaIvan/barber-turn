import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import { PublicBooking } from "./public";
import { Load } from "./ui";
const Owner = React.lazy(() =>
  import("./owner").then((m) => ({ default: m.Owner })),
);
const Login = React.lazy(() =>
  import("./owner").then((m) => ({ default: m.Login })),
);
import "./style.css";
const theme = createTheme({
  palette: {
    primary: { main: "#183f34" },
    secondary: { main: "#a2512c" },
    background: { default: "#f5f3ed", paper: "#ffffff" },
    text: { primary: "#172e28", secondary: "#596a62" },
  },
  typography: {
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    button: { textTransform: "none", fontWeight: 650 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { minHeight: 44 } },
    },
    MuiTextField: { defaultProps: { size: "small", fullWidth: true } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
  },
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <React.Suspense
          fallback={
            <main className="shell">
              <Load loading />
            </main>
          }
        >
          <Routes>
            <Route path="/" element={<PublicBooking />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin/*" element={<Owner />} />
            <Route
              path="*"
              element={
                <main className="shell">
                  <h1>Página no encontrada</h1>
                  <a href="/">Volver al inicio</a>
                </main>
              }
            />
          </Routes>
        </React.Suspense>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);

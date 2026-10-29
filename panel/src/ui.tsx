import {
  Alert,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
export function Load({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error?: string;
  retry?: () => void;
}) {
  if (error)
    return (
      <Alert
        severity="error"
        action={retry ? <Button onClick={retry}>Reintentar</Button> : undefined}
      >
        {error}
      </Alert>
    );
  if (loading)
    return (
      <Stack
        role="status"
        aria-live="polite"
        aria-busy="true"
        direction="row"
        spacing={2}
        sx={{ p: 3 }}
      >
        <CircularProgress size={22} />
        <Typography>Cargando…</Typography>
      </Stack>
    );
  return null;
}
export function PageTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="page-title">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
  );
}

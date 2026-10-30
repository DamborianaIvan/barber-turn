import mongoose from "mongoose";
import app from "./app.js";
import { config, validateConfig } from "./config.js";
import { initialize } from "./models.js";
import { ensurePublished } from "./agenda.js";
validateConfig();
await mongoose.connect(config.mongo, { serverSelectionTimeoutMS: 10000 });
const hello = await mongoose.connection.db.admin().command({ hello: 1 });
if (!hello.setName && hello.msg !== "isdbgrid")
  throw new Error("MongoDB debe soportar transacciones (replica set)");
await initialize();
// Also refreshed on availability reads, including after a sleeping host wakes up.
let publishing = false;
const refresh = async () => {
  if (publishing) return;
  publishing = true;
  try { await ensurePublished(); }
  catch { console.error(JSON.stringify({ event: "publication_failed" })); }
  finally { publishing = false; }
};
await refresh();
const publicationTimer = setInterval(refresh, 15 * 60 * 1000);
publicationTimer.unref();
const server = app.listen(config.port, () =>
  console.log(`Turnero disponible en puerto ${config.port}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    clearInterval(publicationTimer);
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  });

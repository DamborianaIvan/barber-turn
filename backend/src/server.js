import mongoose from "mongoose";
import app from "./app.js";
import { config, validateConfig } from "./config.js";
import { initialize } from "./models.js";
validateConfig();
await mongoose.connect(config.mongo, { serverSelectionTimeoutMS: 10000 });
const hello = await mongoose.connection.db.admin().command({ hello: 1 });
if (!hello.setName && hello.msg !== "isdbgrid")
  throw new Error("MongoDB debe soportar transacciones (replica set)");
await initialize();
const server = app.listen(config.port, () =>
  console.log(`Turnero disponible en puerto ${config.port}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  });

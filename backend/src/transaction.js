import mongoose from "mongoose";
import { Control } from "./models.js";
// Patrón withTransaction reutilizado de Pepe’s; todas las escrituras de agenda
// toman primero este documento común, incluso con varias instancias de la API.
export async function transaction(fn) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(
      async () => {
        await Control.updateOne(
          { _id: "agenda" },
          { $inc: { revision: 1 } },
          { session },
        );
        return fn(session);
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        maxCommitTimeMS: 10000,
      },
    );
  } finally {
    await session.endSession();
  }
}

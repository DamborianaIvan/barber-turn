import { createInterface } from "node:readline/promises";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Admin, initialize } from "../src/models.js";
import { config, validateConfig } from "../src/config.js";
import { username, password } from "../src/validation.js";
validateConfig();
const mode = process.argv[2];
if (!["create", "reset"].includes(mode)) throw new Error("Modo inválido");
const rl = createInterface({ input: process.stdin, output: process.stdout });
const user = username.parse(await rl.question("Usuario administrador: "));
// Deshabilitar eco para que la contraseña no quede visible en la terminal.
if (!process.stdin.isTTY) {
  rl.close();
  throw new Error("Ejecutá este comando en una terminal interactiva");
}
rl.close();
process.stdout.write("Contraseña (mínimo 12 caracteres, no se muestra): ");
const secret = await new Promise((resolve, reject) => {
  let value = "";
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  const finish = () => {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdin.removeListener("data", handle);
    process.stdout.write("\n");
  };
  const handle = (chunk) => {
    for (const c of chunk) {
      if (c === "\u0003") {
        finish();
        reject(new Error("Cancelado"));
        return;
      }
      if (c === "\r" || c === "\n") {
        finish();
        resolve(value);
        return;
      }
      if (c === "\u007f" || c === "\b") value = value.slice(0, -1);
      else value += c;
    }
  };
  process.stdin.on("data", handle);
});
password.parse(secret);
try {
  await mongoose.connect(config.mongo);
  await initialize();
  const hash = await bcrypt.hash(secret, 10);
  if (mode === "create") {
    if (await Admin.exists({ _id: "owner" }))
      throw new Error(
        "El administrador ya existe. Usá admin:reset si necesitás recuperar acceso.",
      );
    await Admin.create({ _id: "owner", username: user, password: hash });
  } else {
    const result = await Admin.updateOne(
      { _id: "owner", username: user },
      { $set: { password: hash, active: true }, $inc: { sessionVersion: 1 } },
    );
    if (!result.matchedCount) throw new Error("Administrador inexistente");
  }
  console.log(
    mode === "create"
      ? "Administrador creado."
      : "Contraseña actualizada; sesiones anteriores invalidadas.",
  );
} finally {
  await mongoose.disconnect();
}

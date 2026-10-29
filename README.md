# Barber Turn

Turnero web independiente para una barbería y una agenda. Nombre e identidad provisionales.

## Qué incluye

- Reserva pública sin cuenta, con nombre y teléfono; confirmación inmediata.
- Panel privado: agenda diaria, reservas manuales, reprogramación, cancelación, atendidos y ausencias.
- Semana habitual con varios rangos, duración configurable, publicación por período, horarios puntuales y bloqueos.
- Clientes con búsqueda, historial, notas internas y corrección de asociaciones.
- Sesión administrativa en cookie HttpOnly; sin registro público del dueño.
- Transacciones y exclusión en MongoDB para evitar reservas simultáneas y superposiciones.

## Requisitos

Node.js 22 o superior, npm y MongoDB con **replica set** (por ejemplo Atlas o Docker local). No utilizar la base de datos ni secretos de otro proyecto.

## Inicio local

1. `npm ci` desde la raíz.
2. Copiar `backend/.env.example` a `backend/.env`.
3. Completar `JWT_SECRET` y `ABUSE_SECRET` con valores independientes. Generar cada uno con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
4. Para MongoDB local: `docker compose up -d`; esperar a que esté saludable con `docker compose ps`. El volumen es exclusivo del turnero. El MongoDB de desarrollo solo se expone en loopback; esta configuración no es para producción.
5. `npm run admin:create`. Ingresar usuario y contraseña (mínimo 12 caracteres). La contraseña no se muestra ni se pasa por argumentos.
6. En una terminal: `npm run api` (puerto 5001).
7. En otra: `npm run dev` (puerto 5174).
8. Abrir **http://localhost:5174**. Panel: **http://localhost:5174/login**.

Usar exactamente el origen configurado en `APP_ORIGIN`. Si probás desde un celular, cambiá `APP_ORIGIN` al origen de la PC en tu red (por ejemplo `http://192.168.1.20:5174`) y abrí ese mismo origen. Vite envía `/api` a 5001 conservando el origen. No hace falta `VITE_API_URL`.

## Primer circuito

1. Ingresar al panel y completar nombre, contacto y dirección desde Disponibilidad → Barbería.
2. Revisar la semana habitual, duración y horizonte (por defecto 30 minutos y 30 días).
3. Publicar agenda: elegir período, previsualizar y aplicar.
4. Abrir el sitio público y reservar.
5. Volver a Agenda y verificar cliente, teléfono y horario.
6. Probar reserva manual, reprogramación y cancelación.

Una modificación de la plantilla **no cambia** los horarios publicados. Para aplicar una nueva duración desde una fecha, usar Publicar agenda → Reemplazar horarios futuros libres. Las reservas existentes requieren elegir conservarlas como excepciones o resolverlas previamente desde Agenda.

## Comandos

| Comando                | Función                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| `npm run api`          | Backend de desarrollo                                            |
| `npm run dev`          | Frontend de desarrollo                                           |
| `npm run admin:create` | Crear el único administrador                                     |
| `npm run admin:reset`  | Recuperar contraseña e invalidar sesiones anteriores             |
| `npm test`             | Integración contra un MongoDB temporal real con replica set      |
| `npm run test:e2e`     | Pruebas de interfaz Playwright con respuestas de API controladas |
| `npm run build`        | TypeScript y compilación del frontend                            |
| `npm run lint`         | ESLint backend y frontend                                        |
| `npm audit`            | Auditoría actual de dependencias                                 |
| `npm start`            | Backend y frontend compilado bajo el mismo origen                |

Las pruebas de integración descargan un binario MongoDB 7.0.24 y crean una base temporal, sin usar la base de desarrollo ni Atlas. Para Playwright: `npm exec -w panel -- playwright install chromium`. No ejecutar pruebas contra producción.

## Producción

`npm ci`, `npm run build`, `npm prune --omit=dev` y `npm start`. Express sirve `panel/dist` y `/api`, bajo el mismo origen. Configurar `NODE_ENV=production`, `APP_ORIGIN=https://...`, `MONGODB_URI`, secretos propios y `PORT` si corresponde.

`TRUST_PROXY` debe representar la topología real del proxy, sin confiar indiscriminadamente en cabeceras externas. Usar HTTPS, usuario de base de datos exclusivo con permisos limitados y una política de respaldo/restauración propia. El arranque valida soporte de transacciones e índices; no hay modo de reserva sin transacciones.

No se incluyen proveedores de hosting ni credenciales. No está publicado automáticamente. La configuración local de Docker no habilita autenticación de MongoDB y no debe exponerse a Internet.

## Alcance y documentación

[Reglas y arquitectura](docs/arquitectura.md) · [Validación y fases](docs/validacion.md)

Sin pagos, señas, múltiples barberos, sucursales, cuentas de clientes, mensajes automáticos ni enlaces públicos de gestión. El teléfono es un dato de contacto no verificado; las notas y el historial nunca se consultan desde la web pública.

Patrones de autenticación, transacciones, validación, permisos y estados de carga adaptados del proyecto propio Pepe’s Napoletana (referencia revisada: `7b85b677369eede811dd723493c2558096ce5ca7`). No se comparten código en ejecución, usuarios, sesiones, base de datos ni secretos.

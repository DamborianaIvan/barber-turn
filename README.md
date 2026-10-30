# Barber Turn

Turnero web independiente para una barbería y una agenda. Nombre e identidad provisionales.

## Qué incluye

- Reserva pública sin cuenta, con nombre y teléfono; confirmación inmediata.
- Panel privado: agenda diaria, reservas manuales, reprogramación, cancelación, atendidos y ausencias.
- Semana habitual con varios rangos, duración configurable, publicación automática, horarios puntuales y bloqueos.
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
3. En Mis horarios, elegir desde qué fecha aplicar y pulsar Guardar y habilitar turnos.
4. Abrir el sitio público y reservar.
5. Volver a Agenda y verificar cliente, teléfono y horario.
6. Probar reserva manual, reprogramación y cancelación.

Al guardar Mis horarios se actualizan los horarios futuros libres desde la fecha elegida. Las reservas existentes requieren elegir conservarlas como excepciones o resolverlas previamente desde Agenda. La configuración y la publicación se guardan en una transacción; si hay conflictos no queda un cambio parcial.

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

Sin pagos, señas, múltiples barberos, sucursales, cuentas de clientes, mensajes automáticos ni envío automático de enlaces por correo o WhatsApp. El teléfono es un dato de contacto no verificado; las notas y el historial nunca se consultan desde la web pública.

Patrones de autenticación, transacciones, validación, permisos y estados de carga adaptados del proyecto propio Pepe’s Napoletana (referencia revisada: `7b85b677369eede811dd723493c2558096ce5ca7`). No se comparten código en ejecución, usuarios, sesiones, base de datos ni secretos.

## Agenda automática y enlace privado

La primera activación es explícita: Disponibilidad → Mis horarios → Guardar y habilitar turnos.
No se habilita automáticamente la semana predeterminada de una instalación nueva.
Se mantiene el horizonte configurado (30 días por defecto), al iniciar el servidor,
cada 15 minutos y al consultar disponibilidad o agenda. Esto cubre también hosts que duermen.
Un fallo se registra sin datos personales y se reintenta en la próxima consulta/ciclo.
Los cambios tienen fecha de vigencia y preservan las reservas aceptadas explícitamente.
La plantilla anterior continúa aplicándose antes de esa fecha. Un cambio nuevo desde una fecha
reemplaza cualquier programación de horarios posterior a ella.

Las nuevas reservas públicas entregan un código de gestión de 12 caracteres
agrupados en tres bloques. Se deriva mediante HMAC del secreto del servidor y del ID
con 60 bits de entropía; no es consecutivo ni deducible del ID. Solo se almacena su hash,
con índice único disperso para impedir colisiones. Los reintentos idempotentes devuelven
el mismo código sin almacenarlo en texto plano.

En la web pública, Consultar o modificar mi turno permite ingresarlo con o sin guiones,
espacios o minúsculas. Se envía únicamente en cuerpos POST, sin datos personales en
las respuestas ni códigos en URLs o logs. Las consultas y cambios se limitan cada uno
a 10 intentos por 15 minutos e IP. Los enlaces antiguos siguen admitidos para compatibilidad.

Se puede reprogramar o cancelar antes del inicio. Cancelar requiere confirmación e
invalida el código; una reprogramación fallida conserva el turno original. Reprogramar
mantiene el mismo código. Reservas manuales y anteriores sin credencial se gestionan
con el dueño. No hay envío de correo ni WhatsApp automático. Quien tenga el código
controla la reserva; guardarlo mediante copia o captura. Rotar ABUSE_SECRET invalida
las credenciales anteriores. No añadir analítica que capture los códigos o cuerpos POST.

Validación de esta entrega: revisión de código; sin ejecutar tests, build ni lint por indicación del usuario.
## Protección de reservas públicas

Valores iniciales configurables en backend/.env: 5 intentos por minuto e IP,
20 por hora e IP y 5 por hora y teléfono normalizado. Se cuentan también errores
y reintentos; las ventanas son fijas y el rechazo devuelve Retry-After.
Las consultas públicas conservan el límite compartido de 240 por 15 minutos e IP.
Configurar TRUST_PROXY según el proxy real del alojamiento; no confiar en cabeceras arbitrarias.

Cada teléfono puede tener hasta 2 turnos confirmados futuros para reservar online.
Se cuentan también los turnos manuales y los asociados a su ficha. La comprobación
ocurre dentro de la transacción de agenda; cancelar libera cupo y repetir una clave
idempotente ya guardada devuelve la confirmación original, sujeto al límite de intentos.
El dueño puede superar este cupo mediante reservas manuales, conservando las restricciones de horario.

En Clientes → Editar se puede bloquear/desbloquear la reserva online de un número.
No cancela reservas existentes, no publica el motivo y permite atención manual.
Para cambiar el teléfono bloqueado hay que guardar antes el desbloqueo.
El rechazo público no distingue bloqueo de límite alcanzado ni expone historial.
Sin verificar teléfono, una persona aún puede usar otros números o conexiones.
No se incorporan SMS, WhatsApp automático ni CAPTCHA.
>>>>>>> 1517654723fc945fcfcce9ed7274db640b8e42c9

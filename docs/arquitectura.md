# Reglas de la primera versión

## Límites

Una barbería, una agenda y un administrador. Un cliente por intervalo. Turnos fijos entre 5 y 240 minutos; horizonte entre 1 y 90 días (30 por defecto). Los horarios del día actual deben empezar estrictamente después de la hora del servidor. No hay aprobación posterior.

## Fechas

- Zona IANA: `America/Argentina/Buenos_Aires`.
- Instantes en MongoDB como Date UTC; fechas locales `YYYY-MM-DD`, horas `HH:mm`.
- Conversión en el servidor con Luxon; presentación con Intl y zona explícita.
- Intervalos semiabiertos `[inicio, fin)`. Dos intervalos son incompatibles cuando `a.inicio < b.fin && a.fin > b.inicio`.
- Rangos del día no cruzan medianoche. El último turno debe entrar completo.

## Disponibilidad

`Settings` contiene la plantilla, no la disponibilidad pública. `Slot` contiene intervalos publicados habilitados o retirados; `Block` representa bloqueos independientes. `Booking.status` es el estado del turno, no del horario.

Generar en modo agregar es idempotente y nunca revive horarios retirados. Reemplazar retira los horarios futuros libres del período y genera la nueva grilla. Las reservas confirmadas se preservan explícitamente como excepciones o el cambio falla entero. Los bloqueos se respetan. Reservas e intervalos existentes impiden superposiciones con la nueva grilla. Cambiar plantilla o duración no altera los horarios publicados: el administrador define la vigencia al aplicar un período.

Bloquear un día con reservas produce conflicto sin cambios parciales; el dueño debe reprogramar/cancelar las reservas y volver a aplicar. Quitar el bloqueo vuelve a mostrar los horarios publicados futuros, no genera horarios nuevos. Una reserva cancelada solo libera disponibilidad si el intervalo sigue habilitado y no bloqueado.

## Exclusión y atomicidad

Todas las escrituras del servicio pasan por `transaction`, que primero incrementa el documento `Control/agenda` dentro de `withTransaction`. Ese primer write coordina instancias del backend y fuerza reintentos de transacciones en conflicto. Después se releen disponibilidad, bloqueos, reservas y configuración; ninguna validación del navegador es autoritativa.

Índice único parcial en `Booking.slot` para estado confirmado; índice único `Slot(start,end)` para generación idempotente. La exclusión entre intervalos distintos depende del servicio transaccional común, no del índice por horario. Nunca escribir agenda directamente desde otros scripts operativos.

MongoDB debe tener replica set; índices inicializados antes de escuchar peticiones. No hay fallback sin transacciones. Las operaciones dentro de una misma sesión se ejecutan secuencialmente.

Una reprogramación valida destino, actualiza reserva y escribe evento en la misma transacción. Si falla, el original sigue intacto. Las revisiones de reservas, clientes y configuración impiden sobrescrituras de formularios obsoletos.

Idempotencia pública/manual: clave aleatoria de intento y huella HMAC del payload. El resultado mínimo se guarda transaccionalmente por 24 horas. Reutilizar la clave con otros datos falla. No equivale a una API de consulta de reservas ni a identidad del cliente. Las respuestas de idempotencia confirman la creación original; no son un estado en vivo posterior.

## Estados

| Origen     | Destino / acción | Regla                                                              |
| ---------- | ---------------- | ------------------------------------------------------------------ |
| Nueva      | confirmado       | Intervalo futuro, habilitado, libre y dentro del horizonte         |
| confirmado | cancelado        | Administrador; se conserva historial                               |
| confirmado | atendido         | El turno comenzó                                                   |
| confirmado | ausente          | El intervalo terminó                                               |
| confirmado | reprogramar      | Original futuro, destino disponible; conserva ID y registra evento |
| Finalizado | reabrir          | No permitido; crear nueva reserva                                  |

La corrección administrativa de cliente se permite sin alterar el estado ni los datos declarados originalmente.

## Clientes y privacidad

`libphonenumber-js/max` normaliza a E.164 con Argentina por defecto. Exige código de área; no infiere ciudad. Valida números completos, rechaza extensiones. Un índice único evita duplicados por teléfono normalizado. La reserva pública usa el cliente existente sin cambiar nombre ni notas; guarda nombre y teléfono declarados en la reserva. El panel avisa si difiere el nombre y permite reasociar a un cliente correcto.

Este modelo representa contactos, no identidades comprobadas. Números compartidos, reciclados o mal ingresados pueden requerir intervención del dueño. No hay consulta pública de historial, cliente o reserva por teléfono/ID. Información pública: barbería, horarios libres y resultado mínimo de creación. Los motivos de bloqueo, nombres, notas y teléfonos ajenos nunca se publican.

## Seguridad

- bcrypt costo 10 y contraseña administrativa de al menos 12 caracteres, máximo 72 bytes.
- Administrador singleton creado por terminal privada; no hay ruta de registro/bootstrap pública.
- JWT HS256 con issuer/audience, vencimiento 12 h, versión de sesión y revocación al logout. Token exclusivamente en cookie HttpOnly, SameSite Strict y Secure en producción, host-only.
- CSRF token de sesión en cabecera y validación de Origin en mutaciones, incluido login. No se aceptan orígenes alternativos. Producción usa frontend y API en el mismo origen.
- Recuperación por comando privado; incremento de versión invalida sesiones previas.
- Límites persistentes en MongoDB: login por IP y cuenta, reservas por IP y teléfono, lecturas públicas por IP. Fallo de base no permite saltar el límite.
- HMAC con secreto independiente para claves de abuso e idempotencia. No se guardan teléfonos/IP en texto dentro de los contadores.
- Cuerpos JSON hasta 16 KB, sin compresión, validación estricta con Zod y campos seleccionados.
- Helmet/CSP; no renderizar HTML de usuario. Respuestas de API `Cache-Control: no-store`.
- Logs de errores sin mensaje crudo, URL, cuerpo, cookies ni datos personales. Error 500 genérico.

Los límites reducen abuso pero no verifican posesión del teléfono. No se incorporan servicios pagos, SMS ni CAPTCHA. Un atacante distribuido sigue pudiendo crear reservas falsas; revisar comportamiento real antes de ampliar protección.

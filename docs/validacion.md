# Fases y validación

## Implementación

1. Base independiente: repositorio, workspaces, configuración, puertos propios y CI.
2. Seguridad: administrador privado, login/logout, cookie, CSRF, límites y revocación.
3. Motor: horarios, transacciones, reservas, cancelación, reprogramación y estados.
4. Público: selección, datos, revisión, confirmación y recuperación ante conflicto.
5. Panel: agenda diaria, clientes, historial y correcciones.
6. Disponibilidad: plantilla semanal, previsualización, vigencia, reemplazo explícito, excepciones y bloqueos.

## Comprobaciones automatizadas

`backend/test/integration.test.js` ejecuta solicitudes HTTP y servicios contra una instancia MongoDB real temporal con replica set. Comprueba exclusión de 20 reservas concurrentes, índice único, superposiciones concurrentes, reserva contra bloqueo, rollback de reprogramación, idempotencia, privacidad, normalización argentina, UTC, permisos, CSRF, revocación, límites y generación con reservas existentes.

`panel/tests/flows.spec.ts` usa Playwright en móvil/escritorio con respuestas de API controladas para probar navegación, formularios, conflicto al confirmar, estados de carga/error, respuestas atrasadas y elección explícita al reemplazar disponibilidad. Estas pruebas no reemplazan la integración real de backend.

El workflow ejecuta integración, TypeScript/build, ESLint, Playwright y npm audit. No desactivar pruebas de concurrencia cuando el entorno no pueda arrancar MongoDB; ejecutarlas en CI/Linux compatible.

## Circuito manual antes de producción

- Crear dueño por terminal, ingresar, cerrar sesión y comprobar que no queda acceso privado.
- Configurar barbería y rangos de atención, incluidos mañana/tarde y días cerrados.
- Publicar una semana y repetir la generación: no aparecen duplicados.
- Reservar desde celular y desde una segunda ventana el mismo horario.
- Confirmar que la segunda operación recibe conflicto y no expone al otro cliente.
- Reservar manualmente, reprogramar a un horario ocupado y verificar conservación del original.
- Cancelar y verificar liberación; bloquear día libre y verificar ocultamiento público.
- Intentar bloquear un día con reservas: resolver explícitamente desde Agenda.
- Cambiar duración con fecha de vigencia; conservar reservas como excepciones y revisar intervalos.
- Buscar clientes con el mismo teléfono en formatos distintos; cambiar nombre público y comprobar que no sobrescribe notas/datos.
- Validar WhatsApp, teclado, foco de formularios y contraste en un iPhone/Android real.
- Configurar HTTPS, origen, proxy, credenciales propias de MongoDB y respaldo/restauración.

## Fuera de esta entrega

Hosting y dominio definitivos, credenciales reales, política operativa de respaldo, identidad final y validación del dueño con su agenda real. No hay merge automático ni publicación a producción.

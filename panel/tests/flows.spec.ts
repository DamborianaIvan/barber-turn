import { test, expect, type Page } from "@playwright/test";
const day = "2026-11-10";
const shop = {
  name: "Barber Turn",
  phone: "+5492266551234",
  address: "Balcarce, Buenos Aires",
  duration: 30,
  horizon: 90,
  timezone: "America/Argentina/Buenos_Aires",
};
const slot = {
  id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  start: day + "T13:00:00.000Z",
  end: day + "T13:30:00.000Z",
};
async function base(page: Page) {
  await page.route("**/api/public/barberia", (r) => r.fulfill({ json: shop }));
  await page.route("**/api/public/disponibilidad?*", (r) =>
    r.fulfill({ json: [slot] }),
  );
  await page.route("**/api/auth/session", (r) =>
    r.fulfill({ json: { username: "dueno", csrf: "test" } }),
  );
}
test("reserva pública, revisión y confirmación sin scroll horizontal", async ({
  page,
}) => {
  await base(page);
  await page.route("**/api/public/reservas", async (r) => {
    expect(r.request().postDataJSON()).toEqual({
      slotId: slot.id,
      name: "Iván Cliente",
      phone: "+5492266551234",
    });
    expect(r.request().headers()["idempotency-key"]).toBeTruthy();
    await r.fulfill({
      status: 201,
      json: { start: slot.start, end: slot.end, status: "confirmado" },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "10:00", exact: true }).click();
  await page.getByRole("textbox", { name: /^Nombre/ }).fill("Iván Cliente");
  await page.getByLabel("Teléfono con código de área").fill("02266 15 551234");
  await page.getByRole("button", { name: "Revisar reserva" }).click();
  await expect(
    page.getByRole("heading", { name: "Revisá tu turno" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirmar mi turno" }).click();
  await expect(
    page.getByText("Turno confirmado", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("carga lenta no muestra vacío; conflicto conserva los datos", async ({
  page,
}) => {
  await base(page);
  await page.route("**/api/public/disponibilidad?*", async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 550));
    await r.fulfill({ json: [slot] });
  });
  await page.route("**/api/public/reservas", (r) =>
    r.fulfill({
      status: 409,
      json: { error: { message: "El horario ya no está disponible" } },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByText("No hay horarios disponibles para esta fecha.", {
      exact: false,
    }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "10:00", exact: true }).click();
  await page.getByRole("textbox", { name: /^Nombre/ }).fill("Cliente Prueba");
  await page.getByLabel("Teléfono con código de área").fill("+5492266551234");
  await page.getByRole("button", { name: "Revisar reserva" }).click();
  await page.getByRole("button", { name: "Confirmar mi turno" }).click();
  await expect(
    page.getByText("El horario ya no está disponible"),
  ).toBeVisible();
  await page.getByRole("button", { name: "10:00", exact: true }).click();
  await expect(page.getByRole("textbox", { name: /^Nombre/ })).toHaveValue(
    "Cliente Prueba",
  );
  await expect(
    page.getByText("Turno confirmado", { exact: true }),
  ).not.toBeVisible();
});
test("error de disponibilidad tiene reintento y no se presenta como vacío", async ({
  page,
}) => {
  await base(page);
  await page.route("**/api/public/disponibilidad?*", (r) =>
    r.fulfill({
      status: 503,
      json: { error: { message: "Servicio temporalmente no disponible" } },
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Servicio temporalmente");
  await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect(
    page.getByText("No hay horarios disponibles", { exact: false }),
  ).not.toBeVisible();
});
test("panel exige sesión; agenda carga antes de mostrar ausencia de datos", async ({
  page,
}) => {
  await base(page);
  await page.route("**/api/admin/agenda?*", async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await r.fulfill({ json: { slots: [], bookings: [], blocks: [] } });
  });
  await page.goto("/admin");
  await expect(page.getByText("Tu agenda está por empezar.")).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Tu agenda" })).toBeVisible();
  await expect(page.getByText("Tu agenda está por empezar.")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.route("**/api/auth/session", (r) =>
    r.fulfill({ status: 401, json: { error: { message: "Iniciá sesión" } } }),
  );
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
});
test("búsqueda de clientes descarta respuesta anterior lenta", async ({
  page,
}) => {
  await base(page);
  await page.route("**/api/admin/clientes?*", async (r) => {
    const q = new URL(r.request().url()).searchParams.get("q");
    if (q === "viejo") await new Promise((resolve) => setTimeout(resolve, 600));
    await r.fulfill({
      json: {
        items: q
          ? [
              {
                _id: "abc",
                name: q === "viejo" ? "Nombre viejo" : "Nombre nuevo",
                phone: "+5492266551234",
                notes: "",
                revision: 0,
              },
            ]
          : [],
        hasMore: false,
      },
    });
  });
  await page.goto("/admin/clientes");
  await page.getByLabel("Buscar por nombre o teléfono").fill("viejo");
  await page.getByLabel("Buscar por nombre o teléfono").fill("nuevo");
  await expect(page.getByText("Nombre nuevo", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Nombre viejo", { exact: true }),
  ).not.toBeVisible();
});
test("disponibilidad pide preservar reservas antes de reemplazar", async ({
  page,
}) => {
  await base(page);
  await page.route("**/api/admin/configuracion", (r) =>
    r.fulfill({
      json: {
        ...shop,
        revision: 0,
        weekly: Object.fromEntries(
          [1, 2, 3, 4, 5, 6, 7].map((d) => [d, [["09:00", "13:00"]]]),
        ),
      },
    }),
  );
  await page.route("**/api/admin/disponibilidad/previsualizar", (r) =>
    r.fulfill({
      json: {
        create: 2,
        retire: 3,
        conflicts: [{ id: "booking", start: slot.start, end: slot.end }],
      },
    }),
  );
  await page.goto("/admin/disponibilidad");
  await page.getByRole("tab", { name: "Publicar agenda" }).click();
  await page.getByRole("button", { name: "Previsualizar cambios" }).click();
  await expect(
    page.getByRole("button", { name: "Aplicar y publicar" }),
  ).toBeDisabled();
  await page
    .getByLabel(
      "Conservar estas reservas como excepciones con su duración original",
    )
    .check();
  await expect(
    page.getByRole("button", { name: "Aplicar y publicar" }),
  ).toBeEnabled();
});

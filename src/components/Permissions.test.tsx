import { MantineProvider } from "@mantine/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { exportConfig } from "../app/config-file";
import { seedConfig } from "../app/seed";
import { STORAGE_KEY } from "../app/storage";
import { App } from "./App";

const renderApp = () =>
  render(
    <MantineProvider>
      <App />
    </MantineProvider>,
  );

const pickAccess = async (user: string, service: string) => {
  const events = userEvent.setup();
  await events.selectOptions(screen.getByTestId("user-select"), user);
  await events.selectOptions(screen.getByTestId("service-select"), service);
};

const upload = async (text: string) => {
  const file = new File([text], "config.json", { type: "application/json" });
  await userEvent.setup().upload(screen.getByTestId("import-input"), file);
};

describe("редактирование разрешений", () => {
  it("показывает все разрешения конфигурации", () => {
    renderApp();

    expect(screen.getAllByTestId(/^permission-item-/)).toHaveLength(seedConfig.permissions.length);
    expect(screen.getByTestId("permission-item-p3")).toHaveTextContent("Борис Каримов");
    expect(screen.getByTestId("permission-item-p3")).toHaveTextContent("Репозиторий");
  });

  it("добавляет разрешение, и расчёт сразу его учитывает", async () => {
    renderApp();
    const events = userEvent.setup();
    await events.selectOptions(screen.getByTestId("permission-subject-select"), "Вера Лисицына");
    await events.selectOptions(screen.getByTestId("permission-service-select"), "Учёт");
    await events.click(screen.getByTestId("permission-add"));
    await pickAccess("Вера Лисицына", "Учёт");

    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
  });

  it("сообщает о повторной выдаче и не создаёт дубль", async () => {
    renderApp();
    const events = userEvent.setup();
    await events.selectOptions(screen.getByTestId("permission-subject-select"), "Анна Белова");
    await events.selectOptions(screen.getByTestId("permission-service-select"), "Учёт");
    await events.click(screen.getByTestId("permission-add"));

    expect(screen.getByTestId("permission-message")).toHaveTextContent("уже выдано");
    expect(screen.getAllByTestId(/^permission-item-/)).toHaveLength(seedConfig.permissions.length);
  });

  it("отзыв одного разрешения сохраняет независимый источник доступа", async () => {
    renderApp();
    await userEvent.setup().click(screen.getByTestId("permission-remove-p1"));
    await pickAccess("Анна Белова", "Учёт");

    expect(screen.queryByTestId("permission-item-p1")).not.toBeInTheDocument();
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
    expect(screen.getByTestId("access-sources")).toHaveTextContent("Группа «Бухгалтерия»");
    expect(screen.getByTestId("access-sources")).not.toHaveTextContent("Прямое разрешение");
  });

  it("изменения переживают перезагрузку страницы", async () => {
    const first = renderApp();
    await userEvent.setup().click(screen.getByTestId("permission-remove-p3"));
    first.unmount();
    renderApp();

    expect(screen.queryByTestId("permission-item-p3")).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^permission-item-/)).toHaveLength(4);
  });
});

describe("импорт конфигурации", () => {
  const imported = {
    ...seedConfig,
    permissions: [seedConfig.permissions[4]],
  };

  it("заменяет конфигурацию целиком и сохраняет её в браузере", async () => {
    renderApp();
    await upload(exportConfig(imported));
    await screen.findByTestId("import-status");

    const items = screen.getAllByTestId(/^permission-item-/);
    expect(items).toHaveLength(1);
    expect(within(items[0]).getByText(/Поддержка/)).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(exportConfig(imported));
  });

  it("отвергает некорректный файл, показывает причину и не меняет конфигурацию", async () => {
    renderApp();
    const broken = JSON.parse(exportConfig(seedConfig));
    broken.permissions[0].serviceId = "vault";
    await upload(JSON.stringify(broken));

    expect(await screen.findByTestId("import-error")).toHaveTextContent(
      "permissions[0]: нет сервиса «vault»",
    );
    expect(screen.getAllByTestId(/^permission-item-/)).toHaveLength(seedConfig.permissions.length);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("после ошибки следующий корректный файл принимается и сообщение об ошибке уходит", async () => {
    renderApp();
    await upload("{oops");
    await screen.findByTestId("import-error");
    await upload(exportConfig(imported));

    await screen.findByTestId("import-status");
    expect(screen.queryByTestId("import-error")).not.toBeInTheDocument();
  });
});

describe("экспорт конфигурации", () => {
  it("отдаёт текущую конфигурацию для скачивания в формате файла импорта", async () => {
    renderApp();
    await userEvent.setup().click(screen.getByTestId("permission-remove-p5"));

    const href = screen.getByTestId("export-link").getAttribute("href") ?? "";
    const expected = {
      ...seedConfig,
      permissions: seedConfig.permissions.slice(0, 4),
    };
    expect(decodeURIComponent(href)).toBe(
      `data:application/json;charset=utf-8,${exportConfig(expected)}`,
    );
    expect(screen.getByTestId("export-link")).toHaveAttribute(
      "download",
      "access-policy-config.json",
    );
  });
});

const selectAccountingAccess = async () => {
  localStorage.setItem(STORAGE_KEY, exportConfig(seedConfig));
  renderApp();
  await userEvent
    .setup()
    .selectOptions(screen.getByRole("combobox", { name: "Группа" }), "Бухгалтерия");
  await pickAccess("Анна Белова", "Учёт");
  expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
};

it("после импорта без выбранной группы показывает Все группы и сохраняет существующего сотрудника", async () => {
  await selectAccountingAccess();
  const config = {
    ...seedConfig,
    groups: seedConfig.groups.slice(1),
    users: seedConfig.users.map((user) => ({
      ...user,
      groupIds: user.groupIds.filter((id) => id !== "accounting"),
    })),
    permissions: seedConfig.permissions.filter((permission) => permission.id !== "p2"),
  };
  await upload(exportConfig(config));
  expect(await screen.findByTestId("import-status")).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Группа" })).toHaveValue("");
  expect(screen.getByTestId("user-select")).toHaveValue("anna");
  expect(screen.getByTestId("service-select")).toHaveValue("ledger");
  expect(within(screen.getByTestId("access-sources")).getAllByRole("listitem")).toHaveLength(1);
  expect(screen.getByTestId("access-sources")).toHaveTextContent("Прямое разрешение");
});
it("после удаления сотрудника сбрасывает выбор и источники и не восстанавливает их при возвращении записи", async () => {
  await selectAccountingAccess();
  await upload(
    exportConfig({
      ...seedConfig,
      users: seedConfig.users.slice(1),
      permissions: seedConfig.permissions.filter((permission) => permission.id !== "p1"),
    }),
  );
  await screen.findByTestId("import-status");
  expect(screen.getByRole("combobox", { name: "Группа" })).toHaveValue("accounting");
  expect(screen.getByTestId("user-select")).toHaveValue("");
  expect(screen.getByTestId("access-result")).toHaveTextContent("Выберите сотрудника и сервис");
  expect(screen.queryByTestId("access-sources")).not.toBeInTheDocument();
  expect(screen.getByText("В этой группе нет сотрудников")).toBeInTheDocument();
  await upload(exportConfig(seedConfig));
  expect(screen.getByTestId("user-select")).toHaveValue("");
  expect(screen.getByTestId("access-result")).toHaveTextContent("Выберите сотрудника и сервис");
});
it("сбрасывает сотрудника после потери членства и не возвращает выбор при снятии фильтра", async () => {
  await selectAccountingAccess();
  await upload(
    exportConfig({
      ...seedConfig,
      users: seedConfig.users.map((user) =>
        user.id === "anna" ? { ...user, groupIds: [] } : user,
      ),
    }),
  );
  await screen.findByTestId("import-status");
  expect(screen.getByRole("combobox", { name: "Группа" })).toHaveValue("accounting");
  expect(
    within(screen.getByTestId("user-select"))
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual(["Не выбран"]);
  expect(screen.getByTestId("service-select")).toHaveValue("ledger");
  expect(screen.getByTestId("access-result")).toHaveTextContent("Выберите сотрудника и сервис");
  expect(screen.queryByTestId("access-sources")).not.toBeInTheDocument();
  expect(screen.getByText("В этой группе нет сотрудников")).toBeInTheDocument();
  await userEvent
    .setup()
    .selectOptions(screen.getByRole("combobox", { name: "Группа" }), "Все группы");
  expect(screen.getByTestId("user-select")).toHaveValue("");
  expect(screen.queryByText("В этой группе нет сотрудников")).not.toBeInTheDocument();
});
it("сохраняет действительные идентификаторы и обновляет имена и источники после импорта", async () => {
  await selectAccountingAccess();
  await upload(
    exportConfig({
      ...seedConfig,
      groups: seedConfig.groups.map((group) =>
        group.id === "accounting" ? { ...group, name: "Финансы" } : group,
      ),
      users: seedConfig.users.map((user) =>
        user.id === "anna" ? { ...user, name: "Анна Новая" } : user,
      ),
      services: seedConfig.services.map((service) =>
        service.id === "ledger" ? { ...service, name: "Баланс" } : service,
      ),
      permissions: [seedConfig.permissions[1]],
    }),
  );
  await screen.findByTestId("import-status");
  expect(screen.getByRole("combobox", { name: "Группа" })).toHaveDisplayValue("Финансы");
  expect(screen.getByTestId("user-select")).toHaveDisplayValue("Анна Новая");
  expect(screen.getByTestId("service-select")).toHaveDisplayValue("Баланс");
  expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
  expect(screen.getByTestId("access-sources")).toHaveTextContent("Группа «Финансы»");
  expect(screen.getByTestId("access-sources")).not.toHaveTextContent("Прямое разрешение");
  await upload(exportConfig({ ...seedConfig, permissions: [] }));
  expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");
  expect(screen.queryByTestId("access-sources")).not.toBeInTheDocument();
});
it("сбрасывает удалённый сервис и скрывает источники без восстановления после повторного импорта", async () => {
  await selectAccountingAccess();
  await upload(
    exportConfig({
      ...seedConfig,
      services: seedConfig.services.slice(1),
      permissions: seedConfig.permissions.filter((permission) => permission.serviceId !== "ledger"),
    }),
  );
  await screen.findByTestId("import-status");
  expect(screen.getByRole("combobox", { name: "Группа" })).toHaveValue("accounting");
  expect(screen.getByTestId("user-select")).toHaveValue("anna");
  expect(screen.getByTestId("service-select")).toHaveValue("");
  expect(screen.getByTestId("access-result")).toHaveTextContent("Выберите сотрудника и сервис");
  expect(screen.queryByTestId("access-sources")).not.toBeInTheDocument();
  await upload(exportConfig(seedConfig));
  expect(screen.getByTestId("service-select")).toHaveValue("");
  expect(screen.getByTestId("access-result")).toHaveTextContent("Выберите сотрудника и сервис");
});
it.each([
  ["синтаксис JSON", "{oops"],
  [
    "несуществующий сотрудник",
    exportConfig({
      ...seedConfig,
      permissions: [
        { id: "broken", subject: { type: "user", id: "missing" }, serviceId: "ledger" },
      ],
    }),
  ],
])("сохраняет фильтр, выбор, результат и данные при ошибке импорта: %s", async (_reason, file) => {
  await selectAccountingAccess();
  const saved = localStorage.getItem(STORAGE_KEY);
  const exported = screen.getByTestId("export-link").getAttribute("href");
  await upload(file);
  expect(await screen.findByTestId("import-error")).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Группа" })).toHaveValue("accounting");
  expect(screen.getByTestId("user-select")).toHaveValue("anna");
  expect(screen.getByTestId("service-select")).toHaveValue("ledger");
  expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
  expect(screen.getByTestId("access-sources")).toHaveTextContent("Прямое разрешение");
  expect(screen.getByTestId("access-sources")).toHaveTextContent("Группа «Бухгалтерия»");
  expect(localStorage.getItem(STORAGE_KEY)).toBe(saved);
  expect(screen.getByTestId("export-link")).toHaveAttribute("href", exported);
  expect(screen.getAllByTestId(/^permission-item-/)).toHaveLength(5);
});

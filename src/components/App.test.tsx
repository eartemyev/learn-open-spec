import { MantineProvider } from "@mantine/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Config } from "../app";
import { exportConfig } from "../app/config-file";
import { STORAGE_KEY } from "../app/storage";
import { App } from "./App";

const renderApp = () =>
  render(
    <MantineProvider>
      <App />
    </MantineProvider>,
  );

const pick = async (user: string, service: string) => {
  const events = userEvent.setup();
  await events.selectOptions(screen.getByTestId("user-select"), user);
  await events.selectOptions(screen.getByTestId("service-select"), service);
};

describe("экран расчёта доступа", () => {
  it("предлагает выбрать сотрудника и сервис до расчёта", () => {
    renderApp();

    expect(screen.getByTestId("access-result")).toHaveTextContent("Выберите сотрудника и сервис");
  });

  it("показывает доступ по прямому разрешению", async () => {
    renderApp();
    await pick("Борис Каримов", "Репозиторий");

    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
    expect(screen.getByTestId("access-sources")).toHaveTextContent("Прямое разрешение");
  });

  it("показывает доступ по разрешению группы", async () => {
    renderApp();
    await pick("Вера Лисицына", "Репозиторий");

    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
    expect(screen.getByTestId("access-sources")).toHaveTextContent("Группа «Разработка»");
  });

  it("показывает прямой и групповой источники вместе", async () => {
    renderApp();
    await pick("Анна Белова", "Учёт");

    expect(screen.getByTestId("access-sources")).toHaveTextContent("Прямое разрешение");
    expect(screen.getByTestId("access-sources")).toHaveTextContent("Группа «Бухгалтерия»");
  });

  it("сообщает об отсутствии доступа", async () => {
    renderApp();
    await pick("Вера Лисицына", "Учёт");

    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");
    expect(screen.queryByTestId("access-sources")).not.toBeInTheDocument();
  });
});

const studio: Config = {
  groups: [
    { id: "north", name: "Северная" },
    { id: "dev", name: "Разработка" },
    { id: "empty", name: "Пустая" },
  ],
  users: [
    { id: "outsider", name: "Посторонний", groupIds: ["dev"] },
    ...["Яна", "Анна", "Вера", "Борис", "Глеб", "Дина", "Егор", "Жанна"].map((name, i) => ({
      id: `n${i}`,
      name,
      groupIds: i === 0 ? ["north", "dev", "north"] : ["north"],
    })),
    { id: "solo", name: "Без группы", groupIds: [] },
  ],
  services: [{ id: "repo", name: "Репозиторий" }],
  permissions: [
    { id: "direct", subject: { type: "user", id: "n0" }, serviceId: "repo" },
    { id: "dev-access", subject: { type: "group", id: "dev" }, serviceId: "repo" },
  ],
};

const loadStudio = (config: Config = studio) => {
  localStorage.setItem(STORAGE_KEY, exportConfig(config));
  return renderApp();
};

const options = (field: HTMLElement) =>
  within(field)
    .getAllByRole("option")
    .map((option) => option.textContent);

const chooseGroup = (name: string) =>
  userEvent.setup().selectOptions(screen.getByRole("combobox", { name: "Группа" }), name);

describe("выбор сотрудников по группе", () => {
  it("показывает перед сотрудником все группы и отбирает восемь участников в исходном порядке", async () => {
    loadStudio();
    const group = screen.getByRole("combobox", { name: "Группа" });
    const employee = screen.getByRole("combobox", { name: "Сотрудник" });
    expect(options(group)).toEqual(["Все группы", "Северная", "Разработка", "Пустая"]);
    expect(group).toHaveValue("");
    expect(employee).toHaveValue("");
    expect(group.compareDocumentPosition(employee) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await chooseGroup("Северная");

    expect(options(employee)).toEqual([
      "Не выбран",
      "Яна",
      "Анна",
      "Вера",
      "Борис",
      "Глеб",
      "Дина",
      "Егор",
      "Жанна",
    ]);
  });
});
it("возвращает всех сотрудников без дублей при снятии фильтра и учитывает несколько групп", async () => {
  loadStudio();
  await chooseGroup("Северная");
  await chooseGroup("Разработка");
  expect(options(screen.getByTestId("user-select"))).toEqual(["Не выбран", "Посторонний", "Яна"]);
  await chooseGroup("Все группы");
  expect(options(screen.getByTestId("user-select"))).toEqual([
    "Не выбран",
    "Посторонний",
    "Яна",
    "Анна",
    "Вера",
    "Борис",
    "Глеб",
    "Дина",
    "Егор",
    "Жанна",
    "Без группы",
  ]);
});
it("при отсутствии групп показывает всех сотрудников и только вариант Все группы", () => {
  loadStudio({ ...studio, groups: [], users: [studio.users[9]], permissions: [] });
  expect(options(screen.getByRole("combobox", { name: "Группа" }))).toEqual(["Все группы"]);
  expect(options(screen.getByTestId("user-select"))).toEqual(["Не выбран", "Без группы"]);
  expect(screen.queryByText("В этой группе нет сотрудников")).not.toBeInTheDocument();
});
it("сохраняет участника общих групп, но сбрасывает исключённого сотрудника и результат без восстановления", async () => {
  loadStudio();
  await chooseGroup("Северная");
  await pick("Яна", "Репозиторий");
  await chooseGroup("Разработка");
  expect(screen.getByTestId("user-select")).toHaveValue("n0");
  expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
  await chooseGroup("Все группы");
  expect(screen.getByTestId("user-select")).toHaveValue("n0");
  await pick("Посторонний", "Репозиторий");
  expect(screen.getByTestId("access-sources")).toHaveTextContent("Группа «Разработка»");
  await chooseGroup("Северная");
  expect(screen.getByTestId("user-select")).toHaveValue("");
  expect(screen.getByTestId("service-select")).toHaveValue("repo");
  expect(screen.getByTestId("access-result")).toHaveTextContent("Выберите сотрудника и сервис");
  expect(screen.queryByTestId("access-sources")).not.toBeInTheDocument();
  await chooseGroup("Все группы");
  expect(screen.getByTestId("user-select")).toHaveValue("");
});
it("объясняет пустую группу и убирает сообщение при выборе участников или всех групп", async () => {
  loadStudio();
  await pick("Яна", "Репозиторий");
  await chooseGroup("Пустая");
  expect(screen.getByText("В этой группе нет сотрудников")).toBeInTheDocument();
  expect(options(screen.getByTestId("user-select"))).toEqual(["Не выбран"]);
  expect(screen.getByTestId("user-select")).toHaveValue("");
  expect(screen.getByTestId("access-result")).toHaveTextContent("Выберите сотрудника и сервис");
  expect(screen.queryByTestId("access-sources")).not.toBeInTheDocument();
  await chooseGroup("Северная");
  expect(screen.queryByText("В этой группе нет сотрудников")).not.toBeInTheDocument();
  expect(options(screen.getByTestId("user-select"))).toHaveLength(9);
  expect(screen.getByTestId("user-select")).toHaveValue("");
  await chooseGroup("Пустая");
  await chooseGroup("Все группы");
  expect(screen.queryByText("В этой группе нет сотрудников")).not.toBeInTheDocument();
});
it("учитывает прямой источник и другую группу и сохраняет полную панель разрешений", async () => {
  loadStudio({ ...studio, services: [...studio.services, { id: "mail", name: "Почта" }] });
  await chooseGroup("Северная");
  await pick("Яна", "Репозиторий");
  expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
  expect(
    within(screen.getByTestId("access-sources"))
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["Прямое разрешение", "Группа «Разработка»"]);
  expect(screen.getAllByTestId(/^permission-item-/).map((item) => item.textContent)).toEqual([
    "Яна: РепозиторийОтозвать",
    "Группа «Разработка»: РепозиторийОтозвать",
  ]);
  expect(options(screen.getByTestId("permission-subject-select"))).toEqual([
    "Не выбрано",
    "Посторонний",
    "Яна",
    "Анна",
    "Вера",
    "Борис",
    "Глеб",
    "Дина",
    "Егор",
    "Жанна",
    "Без группы",
    "Группа «Северная»",
    "Группа «Разработка»",
    "Группа «Пустая»",
  ]);
  expect(options(screen.getByTestId("service-select"))).toEqual([
    "Не выбран",
    "Репозиторий",
    "Почта",
  ]);
  expect(options(screen.getByTestId("permission-service-select"))).toEqual([
    "Не выбран",
    "Репозиторий",
    "Почта",
  ]);
});
it("не меняет сохранение и экспорт при выборе и сбрасывает фильтр после повторного монтирования", async () => {
  const first = loadStudio();
  const saved = localStorage.getItem(STORAGE_KEY);
  const exported = screen.getByTestId("export-link").getAttribute("href");
  await chooseGroup("Северная");
  await pick("Яна", "Репозиторий");
  await chooseGroup("Разработка");
  await pick("Посторонний", "Репозиторий");
  expect(localStorage.getItem(STORAGE_KEY)).toBe(saved);
  expect(screen.getByTestId("export-link")).toHaveAttribute("href", exported);
  expect(
    JSON.parse(
      decodeURIComponent(exported ?? "").slice("data:application/json;charset=utf-8,".length),
    ),
  ).toEqual({ version: 1, ...studio });
  first.unmount();
  renderApp();
  expect(screen.getByRole("combobox", { name: "Группа" })).toHaveValue("");
  expect(screen.getByTestId("user-select")).toHaveValue("");
  expect(options(screen.getByTestId("user-select"))).toEqual([
    "Не выбран",
    "Посторонний",
    "Яна",
    "Анна",
    "Вера",
    "Борис",
    "Глеб",
    "Дина",
    "Егор",
    "Жанна",
    "Без группы",
  ]);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(saved);
  expect(screen.getByTestId("export-link")).toHaveAttribute("href", exported);
});

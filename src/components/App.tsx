import { Container, List, NativeSelect, Paper, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import { useSimulator } from "../app";
import type { AccessSource, Config } from "../app";
import { ConfigTransfer } from "./ConfigTransfer";
import { PermissionsPanel } from "./PermissionsPanel";

const describeSource = (source: AccessSource, config: Config): string => {
  if (source.kind === "direct") {
    return "Прямое разрешение";
  }
  const group = config.groups.find((candidate) => candidate.id === source.groupId);
  return `Группа «${group?.name ?? source.groupId}»`;
};

export const App = () => {
  const { config, checkAccess, grantPermission, revokePermission, exportJson, importJson } =
    useSimulator();
  const [groupId, setGroupId] = useState("");
  const [userId, setUserId] = useState("");
  const [serviceId, setServiceId] = useState("");

  const selectedGroupId = config.groups.some((group) => group.id === groupId) ? groupId : "";
  if (groupId !== selectedGroupId) {
    setGroupId(selectedGroupId);
  }
  const visibleUsers = config.users.filter(
    (user) => !selectedGroupId || user.groupIds.includes(selectedGroupId),
  );

  const selectedUserId = visibleUsers.some((user) => user.id === userId) ? userId : "";
  if (userId !== selectedUserId) {
    setUserId(selectedUserId);
  }

  const selectedServiceId = config.services.some((service) => service.id === serviceId)
    ? serviceId
    : "";
  if (serviceId !== selectedServiceId) {
    setServiceId(selectedServiceId);
  }

  const result =
    selectedUserId && selectedServiceId ? checkAccess(selectedUserId, selectedServiceId) : null;

  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Title order={1}>Симулятор политик доступа</Title>
        <NativeSelect
          label="Группа"
          value={groupId}
          onChange={(event) => {
            const nextGroupId = event.currentTarget.value;
            setGroupId(nextGroupId);
            if (
              !config.users.some(
                (user) =>
                  user.id === userId && (!nextGroupId || user.groupIds.includes(nextGroupId)),
              )
            ) {
              setUserId("");
            }
          }}
          data={[
            { value: "", label: "Все группы" },
            ...config.groups.map((group) => ({ value: group.id, label: group.name })),
          ]}
        />
        <NativeSelect
          label="Сотрудник"
          data-testid="user-select"
          value={userId}
          onChange={(event) => setUserId(event.currentTarget.value)}
          data={[
            { value: "", label: "Не выбран" },
            ...visibleUsers.map((user) => ({ value: user.id, label: user.name })),
          ]}
        />
        <NativeSelect
          label="Сервис"
          data-testid="service-select"
          value={serviceId}
          onChange={(event) => setServiceId(event.currentTarget.value)}
          data={[
            { value: "", label: "Не выбран" },
            ...config.services.map((service) => ({ value: service.id, label: service.name })),
          ]}
        />
        {groupId && visibleUsers.length === 0 && <Text>В этой группе нет сотрудников</Text>}
        <Paper withBorder p="md">
          <Text data-testid="access-result" fw={600}>
            {result === null
              ? "Выберите сотрудника и сервис"
              : result.granted
                ? "Доступ есть"
                : "Доступа нет"}
          </Text>
          {result?.granted && (
            <List data-testid="access-sources" mt="sm">
              {result.sources.map((source) => (
                <List.Item key={source.permissionId}>{describeSource(source, config)}</List.Item>
              ))}
            </List>
          )}
        </Paper>
        <PermissionsPanel config={config} onGrant={grantPermission} onRevoke={revokePermission} />
        <ConfigTransfer exportJson={exportJson} onImport={importJson} />
      </Stack>
    </Container>
  );
};

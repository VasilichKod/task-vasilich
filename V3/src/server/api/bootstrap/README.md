# Workspace Bootstrap

Это первый backend endpoint для сервиса.

Назначение:
- после логина отдать фронту весь workspace одним запросом
- собрать все сущности в формат, похожий на текущую локальную структуру фронтенда

Что возвращает:
- workspace
- profile
- settings
- groups
- subs
- recurring
- recurringStatus
- backlog
- taskProjects
- achievements
- achievementProjects
- data
- projectTemplates
- dayProjects

Ближайший следующий шаг:
- подключить `handleWorkspaceBootstrapRequest` к реальному framework route
- затем вынести CRUD endpoints по отдельным сущностям

Что уже есть в папке:
- `schema.ts` — валидация входных данных
- `get-workspace-bootstrap.ts` — Prisma bootstrap query
- `http.ts` — универсальная HTTP-обёртка на `Request/Response`
- `index.ts` — единая точка экспорта

Пример использования:

```ts
import { handleWorkspaceBootstrapRequest } from './src/server/api/bootstrap/index.js';

export async function GET(request: Request) {
  return handleWorkspaceBootstrapRequest(request);
}
```

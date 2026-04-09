# Task Vasilich V3: Backend Bootstrap

## Что уже есть

- `prisma/schema.prisma`
- `package.json`
- `.env.example`
- `tsconfig.json`
- базовый Prisma client в `src/server/db/client.ts`

## Что делать дальше

1. Установить зависимости:
   `npm install`

2. Поднять PostgreSQL и создать базу:
   `task_vasilich_v3`

3. Скопировать env:
   `cp .env.example .env`

4. Сгенерировать Prisma client:
   `npm run prisma:generate`

5. Создать первую миграцию:
   `npm run prisma:migrate`

6. Открыть Prisma Studio:
   `npm run prisma:studio`

7. Запустить локальный backend:
   `npm run dev:server`

## Следующий кодовый этап

- подключение auth routes к framework
- подключение bootstrap route к framework
- API для `groups/projects/weekly_tasks`

## Что уже добавлено после bootstrap-каркаса

- `src/server/api/bootstrap/schema.ts`
- `src/server/api/bootstrap/get-workspace-bootstrap.ts`
- `src/server/api/bootstrap/README.md`
- `src/server/auth/*`
- `src/server/http/dev-server.ts`

Это уже не просто идея, а серверный модуль, который:
- проверяет доступ пользователя к workspace
- читает все основные сущности из Prisma
- сериализует их в формат, близкий к текущему фронту
- умеет отвечать как обычный HTTP handler через `Request/Response`

И auth-слой, который уже умеет:
- регистрировать пользователя
- создавать первый workspace
- логинить по email/password
- выпускать session token
- читать текущую сессию из cookie
- отвечать через готовые HTTP handlers для `register/login/logout/me`
- подниматься локально как dev-сервер с route-ами:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
  - `GET /api/bootstrap`

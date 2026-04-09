# Task Vasilich V3

## Статус версии

- `V3` считается основной prod-версией по UI.
- `V2` остается как предыдущая рабочая версия и архив логики.
- В `V3` сохранен основной функционал планирования, а стиль отличается от `V2`.

## Основные экраны

### График

- Главный недельный экран.
- Проекты распределены по дням внутри групп.
- Задачи живут внутри проектных блоков.
- Проект можно:
  - переносить между днями drag-and-drop
  - менять порядок внутри дня drag-and-drop
  - переносить вместе со всеми обычными задачами дня
  - удалять из конкретного дня крестиком в заголовке
- Обычные задачи можно:
  - создавать
  - редактировать
  - удалять
  - переносить между днями drag-and-drop
  - отмечать выполненными
  - дополнять заметкой
- Постоянные задачи отображаются внутри графика, но живут в отдельной сущности.
- Верхняя панель графика:
  - `+ задача`
  - `+ проект`
  - `Перенос задач`

### Задачи

- Это backlog-страница.
- Здесь лежат задачи по проектам без привязки к дню недели.
- Используется как список задуманных задач, которые позже отправляются в график.
- Проект можно временно убрать со страницы и добавить обратно.
- Стиль карточек на этой странице отличается от графика:
  - бело-серые заметки
  - только верхняя цветная полоска
  - по 3 проекта в ряд
- Задачу можно открыть и отправить `В график`.

### Достижения

- Достижения ведутся по годам и по проектам.
- Есть фильтр по году:
  - `Все`
  - конкретный год
- В режиме `Все` годы можно сворачивать и разворачивать.
- Можно:
  - добавлять достижения
  - редактировать достижения
  - удалять достижения
  - добавлять новые годы
  - убирать проект из конкретного года
  - возвращать проект обратно в год

### История и аналитика

- Пока это заглушка под будущий раздел.
- Сюда позже можно вынести:
  - историю недель
  - статистику
  - аналитику по проектам
  - ИИ-анализ

### Профиль

- Локальный профиль уже есть во фронте:
  - имя
  - email
  - роль
  - город
  - описание
- Теперь экран профиля также показывает, что auth-layer уже подключен.

### Настройки

- Отдельная страница системных настроек.
- Уже есть:
  - название пространства
  - стартовая страница
  - стартовое состояние sidebar
  - открытие текущего года в достижениях
  - экспорт JSON
  - импорт JSON

## Sidebar

- Основной черный sidebar.
- SVG-иконки перенесены из `V3`-стиля.
- В sidebar есть блоки:
  - `Навигация`
  - `Управление`
  - `Система`
- `Проекты` и `Группы` раскрываются прямо внутри `Управление`.
- После подключения auth в sidebar показываются:
  - имя / email текущего пользователя
  - кнопка `Выйти`

## Данные во фронте

Сейчас фронт все еще использует локальный `localStorage` для основной рабочей логики.

Главные структуры состояния:

- `groups`
- `subs`
- `data`
- `backlog`
- `recurring`
- `recurringStatus`
- `taskProjects`
- `achievements`
- `achievementProjects`
- `projectTemplates`
- `dayProjects`
- `profile`
- `settings`

Ключ `localStorage`:

- `wpv3`

## Backend foundation

В `V3` уже добавлен серверный слой под будущий реальный сервис.

### Prisma / БД

- Используется `PostgreSQL`
- Prisma schema находится в:
  - `prisma/schema.prisma`
- Уже создана первая миграция:
  - `prisma/migrations/20260409004513_init`

Главные таблицы:

- `users`
- `profiles`
- `workspaces`
- `workspace_members`
- `groups`
- `projects`
- `weekly_tasks`
- `backlog_tasks`
- `recurring_tasks`
- `recurring_task_status`
- `project_templates`
- `day_projects`
- `task_page_projects`
- `achievements`
- `achievement_page_projects`
- `user_settings`

### Bootstrap API

Есть backend bootstrap-модуль, который может отдать весь workspace одним запросом.

Файлы:

- `src/server/api/bootstrap/schema.ts`
- `src/server/api/bootstrap/get-workspace-bootstrap.ts`
- `src/server/api/bootstrap/http.ts`
- `src/server/api/bootstrap/index.ts`

Endpoint в dev-server:

- `GET /api/bootstrap`

### Auth layer

Есть базовый auth-layer под email/password.

Файлы:

- `src/server/auth/schema.ts`
- `src/server/auth/password.ts`
- `src/server/auth/session.ts`
- `src/server/auth/register.ts`
- `src/server/auth/login.ts`
- `src/server/auth/current-user.ts`
- `src/server/auth/http.ts`
- `src/server/auth/index.ts`

Что уже работает:

- регистрация по `email + password`
- создание первого workspace
- логин
- logout
- чтение текущего пользователя по session cookie

HTTP handlers:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

## Локальный dev-server

Для локального теста есть отдельный backend server:

- `src/server/http/dev-server.ts`
- `src/server/http/node-request.ts`

Скрипт запуска:

```bash
npm run dev:server
```

Сейчас локально уже проверено:

- `PostgreSQL` установлен
- локальная база `task_vasilich_v3` создана
- Prisma migration применена
- `register` работает
- `me` работает
- `bootstrap` работает

## Auth flow во фронте

Во фронте `V3` теперь есть экран входа и регистрации.

Логика:

- если session отсутствует, показывается auth-shell
- если session есть, открывается основной интерфейс
- используется:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`

Файлы, где это реализовано:

- `version3.html`
- `style-v3.css`
- `app-v3.js`

## Что уже протестировано локально

- запуск Postgres через Homebrew
- создание базы
- `npx prisma generate`
- `npx prisma migrate dev --name init`
- запуск `npm run dev:server`
- `register`
- `me`
- `bootstrap`

## Следующий логичный этап

Следующий большой шаг для `V3`:

- начать переносить реальные CRUD-операции с `localStorage` на backend API

Лучший безопасный порядок:

1. `groups`
2. `projects`
3. `profile / settings`
4. `backlog`
5. `weekly_tasks`
6. `recurring`
7. `achievements`

## Важное правило развития

- Визуал и фронтовый UX можно править смело.
- Новые сущности лучше добавлять отдельными таблицами.
- Самое хрупкое место:
  - существующие связи
  - удаление старых полей
  - изменение смысла уже используемых данных

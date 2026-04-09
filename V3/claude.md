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

### Архивирование и удаление

- Для `groups` и `projects` продовая логика строится не на мгновенном hard delete, а на архивировании.
- В схеме у групп и проектов есть:
  - `archived_at`
  - `delete_after_at`
- Это закладывает модель:
  - пользователь нажимает `Удалить`
  - сущность исчезает из активной работы
  - потом 30 дней доступна для восстановления
  - только после этого возможен окончательный hard delete

#### Группы

- У групп есть:
  - `is_system`
  - `system_key`
- Это нужно для системной группы `Без группы`.
- При удалении обычной группы проекты не должны удаляться.
- Проекты должны быть переведены в системную группу `Без группы`.
- Поэтому активные связи на группу в продовой схеме уже переведены на более осторожную модель:
  - `Project.group` — `onDelete: Restrict`
  - `ProjectTemplate.group` — `onDelete: Restrict`
  - `DayProject.group` — `onDelete: Restrict`
  - `TaskPageProject.group` — `onDelete: Restrict`

#### Проекты

- У проекта удаление также должно идти через архив.
- Активные сущности проекта:
  - `weekly_tasks`
  - `backlog_tasks`
  - `recurring_tasks`
  - `project_templates`
  - `day_projects`
  - `task_page_projects`
  должны исчезать из активной работы вместе с архивированием проекта.
- Достижения проекта удаляться не должны.

#### Достижения

- `achievements` не должны зависеть от существования проекта как живой активной сущности.
- В схеме для этого:
  - `Achievement.projectId` уже nullable
  - удаление проекта для достижения идет через `onDelete: SetNull`
  - в достижении хранится:
    - `project_name_snapshot`
    - `group_name_snapshot`
- То же самое заложено для `achievement_page_projects`:
  - `groupId` и `projectId` nullable
  - `onDelete: SetNull`
  - есть snapshot-поля имени группы и проекта
- Это позволяет сохранять исторические достижения даже после удаления или архивирования проекта / группы.

### Bootstrap API

Есть backend bootstrap-модуль, который может отдать весь workspace одним запросом.

Файлы:

- `src/server/api/bootstrap/schema.ts`
- `src/server/api/bootstrap/get-workspace-bootstrap.ts`
- `src/server/api/bootstrap/http.ts`
- `src/server/api/bootstrap/index.ts`

Endpoint в dev-server:

- `GET /api/bootstrap`

### Catalog API

Есть первый backend CRUD-слой для `groups` и `projects`.

Файлы:

- `src/server/api/catalog/schema.ts`
- `src/server/api/catalog/service.ts`
- `src/server/api/catalog/http.ts`
- `src/server/api/catalog/index.ts`

HTTP handlers:

- `GET /api/catalog`
- `POST /api/catalog/groups`
- `PATCH /api/catalog/groups/:id`
- `DELETE /api/catalog/groups/:id`
- `POST /api/catalog/projects`
- `PATCH /api/catalog/projects/:id`
- `DELETE /api/catalog/projects/:id`

Что уже заложено серверно:

- системная группа `Без группы`
- перевод проектов в `Без группы` при архиве группы
- архивирование группы на 30 дней
- архивирование проекта на 30 дней
- очистка активных weekly/day/template/task-page сущностей при архиве проекта
- сохранение достижений проекта через nullable-ссылки и snapshot-поля

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
- архивная миграция применена через `npx prisma migrate deploy`
- `register` работает
- `me` работает
- `bootstrap` работает
- `typecheck` чистый

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
- `npx prisma migrate deploy`
- запуск `npm run dev:server`
- `register`
- `me`
- `bootstrap`
- `npm run typecheck`

## Следующий логичный этап

Следующий большой шаг для `V3`:

- подключить фронт `V3` к новому `catalog API`
- перестать хранить `groups/projects` только в `localStorage`
- потом переносить остальные сущности с `localStorage` на backend API

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

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
- После подключения auth в sidebar показывается текущий пользователь.
- Кнопка выхода перенесена в `Профиль`.
- На мобиле используется нижняя навигация:
  - `График`
  - `Задачи`
  - `Достижения`
  - `Аналитика`
  - `Меню`
- Drawer на мобиле используется для вторичных разделов и системных экранов.

## Данные во фронте

Во фронте есть локальный кэш, но он больше не общий для всех пользователей.

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

Ключ `localStorage` теперь привязан к:

- `userId`
- `workspaceId`

Формат:

- `wpv3:{userId}:{workspaceId}`

Это защищает от ситуации, когда новый аккаунт в том же браузере подхватывает старые локальные данные другого workspace.

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

Bootstrap используется как основной серверный снимок workspace после входа.

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

### Planning API

Серверный planning-layer уже подключен.

Покрывает:

- `graph`
- `backlog`
- `recurring`
- `taskProjects`
- `projectTemplates`
- `dayProjects`

Endpoint:

- `PATCH /api/planning-state`

### Achievements API

Серверный achievements-layer уже подключен.

Покрывает:

- `achievementYears`
- `achievements`
- `achievementProjects`

Endpoint:

- `PATCH /api/achievements-state`

### Auth layer

Есть базовый auth-layer под email/password.

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Сессия идет через cookie.

## Account API

Профиль и настройки уже серверные.

Endpoints:

- `GET /api/account`
- `PATCH /api/account/profile`
- `PATCH /api/account/settings`

## Продакшен

`V3` уже развернут на VPS.

Текущая prod-схема:

- Ubuntu 24.04
- Node.js 22
- PostgreSQL 16
- nginx
- systemd

Продовая папка:

- `/var/www/task-vasilich/V3`

`.env` на сервере:

- `/var/www/task-vasilich/V3/.env`

systemd service:

- `task-vasilich-v3`

Прод сейчас обновляется вручную:

1. `git pull origin main`
2. при необходимости `npm install`
3. при необходимости `npm run prisma:generate`
4. при необходимости `npm run prisma:migrate:deploy`
5. `systemctl restart task-vasilich-v3`

## Что уже считается серверным источником истины

- auth
- groups/projects
- archive
- profile/settings
- graph
- backlog/tasks
- recurring
- templates
- achievements

Локальный `localStorage` теперь только кэш/буфер для текущего `user/workspace`, а не источник общих данных для всех аккаунтов.

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

## Брендинг — НеПлан

- Название продукта: `НеПлан`
- Домен: `nedplan.ru`
- Акцентный цвет: `#D0F518` (лаймовый)
- Hover акцента: `#8FA811`
- Текст на акцентном фоне: `#2a2a2a` (тёмно-серый)
- CSS-переменные: `--accent`, `--accent-hover`, `--accent-text`, `--accent-dim`
- Иконки для рабочего стола:
  - `favicon.ico` — браузерная вкладка
  - `apple-touch-icon.png` — iOS "добавить на рабочий стол"
  - `icon-192.png` — Android
  - `icon-512.png` — Android splash / PWA

## Версионирование планирования

- В таблице `workspaces` есть поле `planningVersion` (INT, default 0)
- Фронт отправляет `expectedVersion` при каждом сохранении
- Сервер проверяет версию, инкрементирует при успехе
- При конфликте (409) фронт перезагружает данные с сервера и повторяет
- Это защищает от гонок при одновременных изменениях из разных вкладок
- Миграция: `prisma/migrations/20260413120000_add_planning_version`

## Drag & Drop — текущее состояние

### Задачи (task-item)

- `draggable="true"` + `ondragstart="dragTask(event, id)"`
- `dragTask` вызывает `event.stopPropagation()` — не триггерит перетаскивание проекта
- Маркер `application/x-task-drag` отличает задачи от проектов
- Задачу можно перетащить на `.task-list` другого проекта (тот же день)
- Задачу можно перетащить на `day-cell` другого дня — переносится в тот же проект на новый день (`dropTaskOnDay`)

### Проекты (project-card)

- `draggable="true"` + `ondragstart="dragProject(event, groupId, dayIdx, subId)"`
- Можно перетащить между днями и между позициями внутри дня
- При переносе между днями задачи **добавляются** к существующим в целевом дне (не перезаписываются)

### Сайдбар → день недели

- Проект из сайдбара можно перетащить на `day-cell`
- При dragover подсвечивается лаймовым через `.drop-target-cell`
- Проект добавляется в `dayProjects` если его там ещё нет
- Ограничение: только в день той же группы, к которой принадлежит проект

## Мобильная навигация

- Нижняя панель: `График`, `Задачи`, `Достижения`, `Аналитика`, `Меню`
- Активная кнопка: лаймовый фон `var(--accent)` + тёмный текст/иконка `var(--accent-text)`
- Скруглённые углы `border-radius: 10px`

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

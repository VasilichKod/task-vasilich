# WeekPlanner

Персональный недельный планировщик с ИИ-анализом.

---

## Запуск локально (прямо сейчас)

Просто открой `index.html` в браузере — всё работает без сервера.

Для ИИ-анализа локально:
1. Зайди на https://console.anthropic.com → API Keys → создай ключ
2. Вставь его в `src/app.js` в строку `const ANTHROPIC_API_KEY = 'sk-ant-...'`
3. ⚠️ Это только для локального теста — в продакшне ключ должен быть на сервере

---

## Структура проекта

```
weekplanner/
├── index.html          — единственная страница
├── src/
│   ├── app.js          — вся логика (state, render, AI)
│   └── style.css       — стили, dark mode, mobile
├── server/             — появится на следующем этапе
│   ├── index.js        — Express сервер
│   ├── routes/
│   │   ├── weeks.js    — CRUD недель
│   │   └── ai.js       — проксирование к Anthropic API
│   └── db/
│       ├── schema.sql  — структура БД
│       └── client.js   — подключение к postgres
└── README.md
```

---

## Дорожная карта

### Этап 1 — Локальный тест (сейчас)
- [x] Сетка неделя × проект × день
- [x] Добавление/чекбоксы задач
- [x] Фильтры: Всё / Работа / Личное / конкретный проект
- [x] Добавление новых проектов с цветом
- [x] ИИ-анализ через Anthropic API
- [x] Dark mode
- [x] Мобильный вид
- [x] Данные в localStorage

### Этап 2 — Бэкенд + база (следующий шаг)

**Стек:**
- Node.js + Express (или Fastify)
- PostgreSQL (или SQLite если совсем просто)
- Хостинг: Railway / Render / VPS

**Что сделать:**

1. Инициализировать проект:
   ```bash
   cd server
   npm init -y
   npm install express cors dotenv pg
   ```

2. Создать `.env`:
   ```
   DATABASE_URL=postgresql://user:pass@localhost:5432/weekplanner
   ANTHROPIC_API_KEY=sk-ant-...
   PORT=3000
   ```

3. Схема БД (`server/db/schema.sql`):
   ```sql
   CREATE TABLE users (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     email TEXT UNIQUE NOT NULL,
     created_at TIMESTAMPTZ DEFAULT now()
   );

   CREATE TABLE projects (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES users(id),
     label TEXT NOT NULL,
     group_name TEXT NOT NULL,  -- 'work' | 'life'
     color TEXT NOT NULL,
     sort_order INT DEFAULT 0,
     created_at TIMESTAMPTZ DEFAULT now()
   );

   CREATE TABLE tasks (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES users(id),
     project_id UUID REFERENCES projects(id),
     week_key TEXT NOT NULL,   -- 'w20250317'
     day_index INT NOT NULL,   -- 0=Пн ... 6=Вс
     text TEXT NOT NULL,
     done BOOLEAN DEFAULT false,
     created_at TIMESTAMPTZ DEFAULT now()
   );
   ```

4. API эндпоинты:
   ```
   GET  /api/weeks/:weekKey        — загрузить неделю
   POST /api/tasks                 — создать задачу
   PATCH /api/tasks/:id            — обновить (done/text)
   DELETE /api/tasks/:id           — удалить
   POST /api/projects              — новый проект
   POST /api/analyze               — проксировать к Anthropic (ключ на сервере)
   ```

### Этап 3 — Авторизация

**Самый простой вариант:** Magic link по email (без паролей)
- Библиотека: `nodemailer` + UUID токены в БД
- Или готовый сервис: **Clerk** / **Supabase Auth** (бесплатно до 50k юзеров)

После авторизации — JWT токен в localStorage, все запросы с заголовком `Authorization: Bearer ...`

### Этап 4 — PWA (устанавливается на телефон)

Добавить два файла:

1. `public/manifest.json` — иконка, название, цвета
2. `public/sw.js` — service worker для офлайн-кеша

В `index.html`:
```html
<link rel="manifest" href="/manifest.json">
```

После этого браузер на телефоне предложит "Добавить на экран". Работает как нативное приложение.

### Этап 5 — Умный ИИ

Когда накопится история недель — можно делать умный анализ:
- Сравнивать текущую неделю с прошлыми
- "SHMEL застревает каждый вторник уже 3 недели"
- Предлагать перенос хронических задач
- Еженедельный дайджест в Telegram

---

## Быстрый деплой (Этап 2)

**Railway** — проще всего:
1. Зарегистрироваться на railway.app
2. New Project → Deploy from GitHub
3. Добавить PostgreSQL плагин
4. Вставить переменные окружения
5. Готово — URL вида `weekplanner.up.railway.app`

Стоит ~$5/мес для одного пользователя.

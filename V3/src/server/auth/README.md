# Auth Layer

Что уже есть:
- `schema.ts` — схемы входа и регистрации
- `password.ts` — hash / verify через `bcryptjs`
- `session.ts` — JWT session token + cookie helpers
- `register.ts` — регистрация пользователя + создание первого workspace
- `login.ts` — логин по email/password
- `current-user.ts` — чтение текущей сессии и пользователя из `Request`
- `http.ts` — готовые handlers для `register/login/logout/me`
- `route-example.ts` — пример подключения route-слоя
- `index.ts` — единая точка экспорта

Рекомендуемая первая версия:
- email + password
- `bcryptjs` для hash
- `jose` для session token / JWT или signed cookies

Что делать следующим шагом:
- подключить реальные HTTP routes в выбранном framework
- после логина сразу вызывать bootstrap по `workspaceId`

Какие routes уже готовы логически:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

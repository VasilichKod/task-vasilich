# Task Vasilich V3: VPS deploy

## FirstByte: восстановление 5 ноября 2026

- Новый VPS: `45.144.65.6`, Debian 13, Node.js 20.19, PostgreSQL 17.
- Основной адрес: `nedplan.ru`, также настроен `www.nedplan.ru`.
- Код приложения — текущий, данные восстановлены из локального дампа
  `backups/2026-07-21/task_vasilich_v3_pre_balance_wishlist_20260721T180000MSK.dump`.
- В архиве: 2 аккаунта, 27 проектов, 259 задач графика, 103 задачи списка,
  0 проектных заметок. Это историческая копия, не данные на ноябрь.
- Для восстановления на пустом VPS есть `bootstrap-firstbyte.py`.
  Скрипт отказывается перезаписывать существующую установку или непустую БД.
- `task-vasilich-https.timer` каждые 5 минут проверяет внешний DNS.
  Когда обе A-записи указывают на новый IP, получает сертификат, включает
  HTTPS и отключает себя. До этого публичный HTTP возвращает страницу подготовки.
- TLS 1.2 сохранён в соответствии с ранее проверенным workaround ТСПУ.
  Certbot автоматически обновляет сертификат и перечитывает Nginx.

### Независимые резервные копии

`task-vasilich-backup.timer` создаёт проверенный PostgreSQL-дамп каждые 6 часов
в `/var/backups/task-vasilich/`. Контрольные суммы сохраняются рядом.
Отдельная тестовая реставрация ноябрьского бэкапа прошла успешно.

На Mac установлен LaunchAgent `ru.nedplan.backup-sync`:
`/Users/stepansavelev/Library/LaunchAgents/ru.nedplan.backup-sync.plist`.
Он запускает `sync-backups-to-mac.sh` при входе в macOS и каждый час.
Копии сохраняются в `TaskVasilich/backups/firstbyte/`, проверяются SHA-256;
существующие локальные копии не удаляются. Нужны включённый Mac, интернет
и доступный SSH-ключ. Не считать эту схему независимой круглосуточной копией,
если Mac надолго выключен. Дампы PostgreSQL 17 восстанавливать pg_restore 17+.

Проверка:

```bash
systemctl list-timers task-vasilich-backup.timer task-vasilich-https.timer
journalctl -u task-vasilich-backup.service -u task-vasilich-https.service -n 30
```

Для нового VPS исходники передавались проверенным Git bundle с компьютера.
При обновлении можно передать новый bundle и выполнить `git fetch <bundle> main`,
затем `git merge --ff-only FETCH_HEAD`. При выполнении от root для репозитория
пользователя deploy указывать `git -c safe.directory=/var/www/task-vasilich`.

### Если Beget вернёт свежую базу

Сначала скачать её на ПК и восстановить в отдельную базу для сравнения.
Не перезаписывать работающую БД FirstByte: в ней уже могут быть новые записи.
Сопоставить записи по ID и отдельно согласовать конфликты и удаления.
Браузерный кэш до первого входа после переезда сохраняется отдельно;
его можно экспортировать через Настройки → «Копия браузера до переезда».
Проектных заметок в браузерной копии нет.

## Решение по запуску

Для VPS берём `systemd`, не `pm2`.

Почему:
- встроено в Linux
- переживает reboot сервера
- не добавляет лишний runtime-слой
- проще логировать и админить через `systemctl` и `journalctl`

## Что подготовить на VPS

1. Установить:
   - `git`
   - `nodejs`
   - `npm`
   - `postgresql`
   - `nginx`

2. Клонировать проект:
   ```bash
   git clone https://github.com/VasilichKod/task-vasilich.git /var/www/task-vasilich
   cd /var/www/task-vasilich/V3
   ```

3. Создать `.env` по шаблону:
   - см. `deploy/.env.production.example`

4. Установить зависимости:
   ```bash
   npm install
   ```

5. Применить миграции:
   ```bash
   npm run prisma:generate
   npm run prisma:migrate:deploy
   ```

## Запуск через systemd

1. Скопировать unit:
   ```bash
   sudo cp deploy/task-vasilich-v3.service /etc/systemd/system/task-vasilich-v3.service
   ```

2. Проверить `User`, `WorkingDirectory`, `EnvironmentFile`, `ExecStart` в unit-файле.

3. Перечитать systemd и запустить сервис:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable task-vasilich-v3
   sudo systemctl start task-vasilich-v3
   ```

4. Проверить статус:
   ```bash
   sudo systemctl status task-vasilich-v3
   ```

5. Смотреть логи:
   ```bash
   journalctl -u task-vasilich-v3 -f
   ```

## Nginx

Backend слушает `127.0.0.1:3000`.

Nginx должен:
- принимать `443`
- проксировать в `http://127.0.0.1:3000`
- отдавать SSL

`BIND_HOST` на production должен оставаться `127.0.0.1`, чтобы не открывать Node.js-порт в интернет в обход HTTPS.

Если перед origin-сервером используется edge reverse proxy, его nginx-конфиги находятся в:

- `deploy/nginx.nedplan-edge.conf` — `nedplan.ru` и `www.nedplan.ru`;
- `deploy/nginx.additional-edge.conf` — `podo.nedplan.ru`, `english.nedplan.ru`, `hel27.ru` и `www.hel27.ru`.

Связь edge → origin идёт по HTTPS с проверкой сертификата. На edge-сервере Certbot обновляет отдельные сертификаты для каждого домена.

Актуальный workaround для фильтрации TLS 1.3 через ТСПУ описан в `deploy/TSPU-TLS12.md`.

## Что делать при обновлении

```bash
cd /var/www/task-vasilich
git pull origin main
cd V3
npm install
npm run prisma:generate
npm run prisma:migrate:deploy
sudo systemctl restart task-vasilich-v3
```

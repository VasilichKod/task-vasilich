# Task Vasilich V3: VPS deploy

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

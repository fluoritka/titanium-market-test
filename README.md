# Titanium Market

Готовый проект Titanium Market: Vue 3 + Vite + Express + SQLite.

## Запуск в VS Code

```powershell
npm install
npm run dev
```

Для локальной разработки открой `http://localhost:5173`.

## Production / Northflank

Build command:

```text
npm install && npm run build
```

Start command:

```text
npm start
```

Приложение слушает `0.0.0.0:$PORT`, поэтому Northflank сможет прокинуть HTTP-трафик на сервис.

## Админка

По умолчанию:

```text
Логин: admin
Пароль: 123456
```

Перед публичным запуском обязательно задай `ADMIN_USERNAME` и `ADMIN_PASSWORD` в Environment Variables Northflank.

## Что уже есть

- каталог объявлений;
- поиск;
- фильтрация по категориям;
- создание объявления;
- очередь модерации;
- вход в Панель СМИ;
- одобрение / отклонение / архивирование;
- редактирование и удаление объявлений через API;
- жалобы;
- журнал модерации;
- SQLite-база, создаваемая автоматически;
- 60 тестовых объявлений при первом запуске;
- `/api/health` для проверки состояния сервиса.

## Важно

В проекте оставлен `legacy-worker.ts` только как резервная копия старой Cloudflare/D1-реализации. Northflank-версия работает через обычный Express + SQLite и не требует D1.


## Node.js
This version uses Node.js built-in `node:sqlite`; Node.js 22.5+ is required. No native SQLite npm addon is required.

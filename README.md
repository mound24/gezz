# Занятость квартир (веб-версия)

Календарь броней квартир для Netlify.

- `web/index.html` — страница календаря.
- `netlify/functions/api.mts` — API `/api/*`, хранит брони в Netlify Blobs (store `komunal-calendar`).
- Доступ по PIN-коду: переменная окружения `CALENDAR_PIN` в настройках проекта Netlify (scope: Functions).

## Деплой

1. Netlify → Add new project → Import an existing project → GitHub → `mound24/gezz`,
   ветка `claude/web-version-netlify-deploy-1n841k`. Настройки сборки подтянутся из `netlify.toml`.
2. Project configuration → Environment variables → добавить `CALENDAR_PIN` (секрет, scope Functions).
3. Redeploy.

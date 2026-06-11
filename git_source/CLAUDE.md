# Claude Usage Overlay — CLAUDE.md

## Что это

Electron-виджет always-on-top для мониторинга лимитов Claude Code на тарифе Max 5×.
Читает JSONL-логи из `%USERPROFILE%\.claude\projects\**\*.jsonl`.

## Запуск

```
npm install
npm start
```

Горячая клавиша: **Ctrl+Shift+U** — показать/скрыть окно.
Трей-иконка: правая кнопка → Show/Hide / Reload / Quit.

## Автозапуск (Windows)

Автозапуск — **не** через Electron `setLoginItemSettings`, а через ярлык в папке
автозагрузки Windows. Сделано так, чтобы при логине не мелькало окно консоли.

Цепочка:
```
Startup\Claude Widget.lnk  →  wscript.exe start-widget.vbs  →  (скрыто) npm start  →  electron .
```

- `start-widget.vbs` — определяет свою папку, делает её текущей и запускает
  `cmd /c npm start` с флагом `0` (окно скрыто) и `False` (не ждать). Пути не
  захардкожены — работает из любой папки.
- `install-autostart.ps1` / `uninstall-autostart.ps1` — создают/удаляют ярлык в
  `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`. Ярлык указывает на
  `wscript.exe "<projectDir>\start-widget.vbs"`, рабочая папка = папка проекта.
- npm-обёртки: `npm run autostart:install` / `npm run autostart:uninstall`.

Инструкция по установке с нуля (для передачи другому пользователю) — в `INSTALL.md`.

Грабли: ярлык хранит абсолютный путь. При переносе проекта — переустановить автозапуск
из нового места. Если папка на внешнем/сетевом диске недоступна к моменту логина —
виджет не стартует.

## Ключевые открытия этой сессии

### Лимиты — в долларах, не в токенах

Claude.ai считает использование через **стоимость API-запросов**, а не через количество токенов.
Прогресс-бары виджета показывают `cost_usd / limit_usd * 100%`.

Подтверждено эмпирически: `$45.64 / $88 = 51.9%` совпало с `52%` в личном кабинете.

```js
const LIMITS = {
  session5h:    88,     // $88 за 5-часовое окно
  weeklyAll:    2400,   // $2400 в неделю (все модели)
  weeklySonnet: 1800,   // $1800 в неделю (только Sonnet)
};
```

### PRICING ($/1M токенов)

```js
const PRICING = {
  opus:   { input: 5,  output: 25,  cacheRead: 0.50, cacheCreate: 6.25 },
  sonnet: { input: 3,  output: 15,  cacheRead: 0.30, cacheCreate: 3.75 },
  haiku:  { input: 1,  output: 5,   cacheRead: 0.10, cacheCreate: 1.25 },
};
```

### Формат JSONL-логов

```json
{
  "type": "assistant",
  "timestamp": "2026-04-24T15:53:32.200Z",
  "message": {
    "model": "claude-sonnet-4-6",
    "usage": {
      "input_tokens": 1,
      "output_tokens": 724,
      "cache_read_input_tokens": 26712,
      "cache_creation_input_tokens": 996
    }
  }
}
```

- `cache_read_input_tokens` составляет ~98% токенов, поэтому нельзя считать по токенам
- Нормализация модели: substring-match на `opus`/`sonnet`/`haiku`

### Недельный сброс

- Сброс плавает — не всегда ровно пятница 03:00 (бывало четверг 22:00)
- Дашборд показывает `Resets Fri 3:00 AM` в локальном времени браузера
- В Node.js: `setHours(3, 0, 0, 0)` при UTC+3 = 00:00 UTC — совпадает
- Кнопка ↺ открывает модал "Когда был последний сброс?" с предзаполненной датой
- Сохраняется в `%APPDATA%\claude-usage-overlay\weekly-reset.json`

### 5-часовое окно сессии — выравнивание по UTC-часу

Claude считает окончание сессии от **начала UTC-часа** первого запроса, а не от точного времени:

```
первый запрос в 17:04:35 UTC → сессия истекает в 17:00 UTC + 5ч = 22:00 UTC
первый запрос в 16:59:xx UTC → сессия истекает в 16:00 UTC + 5ч = 21:00 UTC
```

В коде (`main.js`, `getSession5h`):
```js
const sessionHourTs = sessionStart - (sessionStart % (60 * 60 * 1000)); // UTC floor
const sessionExpiry = sessionHourTs + SESSION_DUR;
```

Граница новой сессии тоже считается через `hourTs + SESSION_DUR`, не `sessionStart + SESSION_DUR`.

### Дубликаты в JSONL и компенсация погрешностей

В JSONL-логах ~26% записей — дубликаты: один API-вызов пишется 2-3 раза в один файл с разными `uuid` но одинаковым `message.id`. Это артефакт Claude Code при параллельных субагентах.

**Почему дедупликация не помогает:** дубли дают переплату ~$39, а браузер/мобильный claude.ai (не пишется в JSONL) даёт недобор ~$30. В сумме — стабильное расхождение +7-8% vs дашборда. При дедупе по `message.id` переплата убирается, но недобор браузера остаётся → виджет показывает на 40% меньше дашборда. Хуже.

**Итог:** дедупликацию не делать глобально. Расхождение — структурная погрешность без API-ключа.

**Асимметрия погрешностей (наблюдение 2026-04-24):**
- 5h сессия: виджет **+10%** vs ЛК (дубли свежие и плотные, браузер за 5ч мал → дубли перевешивают)
- Недельная: виджет **−1.6%** vs ЛК (дубли размываются за 7 дней, браузер за неделю доминирует)

Варианты фикса для сессии (TODO):
- Дедуп по `message.id` только в `getSession5h` (убрать дубли, принять небольшой недобор браузера)
- Correction factor ×0.90 для session cost
- Оставить как есть (±10% приемлемо)

Дополнительные поля в `usage` (появились позже):
```json
"cache_creation": { "ephemeral_1h_input_tokens": 8980, "ephemeral_5m_input_tokens": 0 }
"iterations": [{ ...те же данные... }]
```
Виджет их игнорирует — в расчёт берётся только верхний уровень `usage`.

### Остаточное расхождение с дашбордом (~7-8%)

Виджет читает **только Claude Code CLI** логи. Браузер, мобильное приложение и прямые API-запросы тоже идут в лимит, но не пишутся в JSONL. Устранить без API-ключа невозможно.

Время сброса сессии может расходиться на несколько минут если сессия была открыта через браузер раньше первого CLI-запроса.

### Трей-иконка

Генерируется программно через `nativeImage.createFromBitmap` — оранжевый круг цвета Claude `#D97757`, без внешних пакетов:

```js
const pixels = Buffer.alloc(16 * 16 * 4); // RGBA
// рисуем круг попиксельно, заливаем #D97757
nativeImage.createFromBitmap(pixels, { width: 16, height: 16 });
```

### Single instance lock

```js
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
```

Без этого каждый `npm start` создавал новую иконку в трее.

## Архитектура файлов

```
claude-widget/
├── main.js        — окно, трей, IPC, агрегаторы (cost-based), readStatuslineLatest()
├── preload.js     — contextBridge: onUsageUpdate, hideWindow, markWeeklyReset
├── parser.js      — рекурсивный сканер JSONL, mtime-кэш, readline построчно
├── renderer/
│   ├── index.html — Chart.js CDN, JetBrains Mono, модал выбора даты
│   ├── style.css  — тёмная + светлая тема через CSS-переменные [data-theme]
│   └── renderer.js — обновление UI, Chart.js, переключение темы
└── test-parser.js — отладочный скрипт: node test-parser.js

~/.claude/
├── statusline-writer.js   — скрипт, вызываемый Claude Code через statusLine hook
├── statusline-latest.json — последний снапшот с серверными rate_limits (перезаписывается)
└── settings.json          — содержит "statusLine": { "command": "node .../statusline-writer.js" }
```

### Серверные проценты через statusLine (добавлено 2026-04-24)

Claude Code поддерживает хук `statusLine` в `~/.claude/settings.json`. После каждого API-ответа
он вызывает указанный скрипт и передаёт JSON через stdin. JSON содержит поле `rate_limits`:

```json
{
  "rate_limits": {
    "five_hour": { "used_percentage": 52.3, "resets_at": 1738425600 },
    "seven_day":  { "used_percentage": 41.8, "resets_at": 1738857600 }
  }
}
```

Это **серверные данные** из заголовков `anthropic-ratelimit-unified-5h-utilization` /
`anthropic-ratelimit-unified-7d-utilization`. Точнее вычисленных на 100%: учитывают и браузер,
и мобильный, и дубликаты в логах.

**Приоритет в виджете**: если `statusline-latest.json` есть — прогресс-бары 5h и 7d берут
серверный %. Если файл отсутствует (первый запуск, нет активных сессий) — fallback на
вычисленный из логов. Разбивка по моделям и графики всегда вычислены из логов.

**`resets_at`** — Unix timestamp в секундах (×1000 для JS). Виджет использует его для
отображения "через X ч Y м" если серверное время сброса доступно.

## Как изменить лимиты (другой тариф)

Правьте `LIMITS` в `main.js`:

```js
// Max 20x
const LIMITS = { session5h: 352, weeklyAll: 9600, weeklySonnet: 7200 };

// Pro (примерно)
const LIMITS = { session5h: 8.8, weeklyAll: 240, weeklySonnet: 180 };
```

### Попытка точного Sonnet % через claude.ai API (2026-04-24, не реализовано)

`https://claude.ai/api/organizations/{orgId}/usage` возвращает точные данные включая `seven_day_sonnet.utilization`:

```json
{
  "five_hour":        { "utilization": 11.0, "resets_at": "2026-04-24T23:59:59Z" },
  "seven_day":        { "utilization": 10.0, "resets_at": "2026-05-01T00:00:00Z" },
  "seven_day_sonnet": { "utilization": 15.0, "resets_at": "2026-05-01T00:00:00Z" }
}
```

**Проблемы при попытке:**
- OAuth Bearer token (`~/.claude/.credentials.json → claudeAiOauth.accessToken`) → 403 "account_session_invalid". claude.ai принимает только session cookies, не Bearer.
- `curl` → Cloudflare challenge (бот-детектор).
- Electron `net.request()` без session cookies → тот же 403.

**Возможное решение**: Electron persistent session (`partition: 'persist:claude-widget'`).
Создать скрытый BrowserWindow с этой партицией — пользователь логинится в claude.ai один раз,
cookies сохраняются. Затем `net.request({ session: session.fromPartition('persist:claude-widget') })`
проходит авторизацию и Cloudflare автоматически. orgId получается через `/api/organizations`.

**Почему не реализовали сейчас**: достаточно сложно (нужен UI для входа), а 5h и 7d уже точные.
Sonnet имеет ~4% недобор — браузерные запросы не в JSONL.

## Известные проблемы / TODO

- **Weekly Sonnet**: расхождение ~4% (браузерный Claude.ai не в логах). Можно исправить через persistent Electron session — см. выше.
- Время недельного сброса плавает — нужно корректировать через кнопку ↺ раз в неделю
- Тема сохраняется в localStorage рендерера (сбрасывается при `Reload data`)
- Время сброса сессии может отличаться на несколько минут если сессия открыта через браузер

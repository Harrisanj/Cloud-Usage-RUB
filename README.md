# Claude Usage Overlay

[🇷🇺 Русский](#claude-usage-overlay-русский)

![Claude Usage Widget](screenshot.png)

Always-on-top Electron widget for monitoring Claude Code token usage on the **Max 5×** plan.

## Features

- Real-time 5-hour session window with per-model breakdown
- Weekly totals (all models + Sonnet-only)
- Last 7 days stacked bar chart (Opus / Sonnet / Haiku)
- Last 24-hour token usage bar chart
- USD and RUB cost estimates
- **Project breakdowns**: Click on the 5-hour session, weekly summary, or any day in the 7-day chart to see usage per project.
- **Calibrate 5-hour %**: Match your widget progress bar accurately to the official claude.ai web UI.
- **Dynamic colors**: Progress bars automatically adapt to the dominant model used (Opus/Sonnet/Haiku).
- **Tariffs switcher**: Quick dropdown to switch between Max 5x, Max 20x, and Pro limits.
- Transparent frameless window, always on top, skip taskbar
- Ghost mode (Ctrl+Alt+U): make it semi-transparent and click-through
- System tray icon
- Global hotkey **Ctrl+Shift+U** (show/hide)
- Window position saved across restarts

## Run

```
npm install
npm start
```

## Logs location

Parser scans `%USERPROFILE%\.claude\projects\**\*.jsonl` recursively (and WSL `\\wsl$\Ubuntu\home\...`).  
If the directory is empty — Claude Code hasn't been used yet, or stores logs elsewhere.  
Check: `claude config get` to see the configured data dir.

## Keyboard shortcut

**Ctrl+Shift+U** — global, works even when the window is hidden or unfocused.
**Ctrl+Alt+U** — toggle Ghost Mode (click-through and semi-transparent).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Window doesn't appear | Check system tray, press Ctrl+Shift+U |
| All zeros | Run `node test-parser.js` to verify log files are found |
| `~/.claude/projects` empty | Claude Code not yet used, or run `claude config get` to find the actual log dir |
| Graphs look wrong | Open DevTools via tray → `electron .` in terminal, check console errors |

## Dev

```
node test-parser.js   # test log parsing without starting Electron
npm start             # launch the overlay
```

---

# Claude Usage Overlay (Русский)

Оверлей-виджет на базе Electron, работающий поверх всех окон, для мониторинга использования токенов Claude Code.

## Возможности

- Отображение лимитов 5-часовой сессии в реальном времени с разбивкой по моделям
- Недельные итоги (все модели + отдельно Sonnet)
- График за последние 7 дней (Opus / Sonnet / Haiku)
- График затрат за последние 24 часа
- Оценка стоимости в долларах (USD) и рублях (RUB)
- **Разбивка по проектам**: Кликните на 5-часовую сессию, неделю или на любой столбец в 7-дневном графике, чтобы посмотреть траты по проектам.
- **Калибровка 5h %**: Введите текущий процент с официального сайта claude.ai, чтобы виджет идеально с ним синхронизировался.
- **Динамический цвет**: Полоска прогресса сессии автоматически принимает цвет той модели, на которую ушло больше всего денег (Opus/Sonnet/Haiku).
- **Выбор тарифа**: Удобный встроенный переключатель между тарифами (Max 5x, Max 20x, Pro).
- Режим "Ghost Mode": полупрозрачность и пропускание кликов мыши насквозь (не мешает работе)
- Прозрачное окно без рамок, работающее поверх всех окон, скрыто из панели задач
- Иконка в системном трее
- Сохранение позиции окна при перезапусках
- Поддержка WSL (автоматический поиск логов в локальной Windows и Ubuntu WSL)

## Горячие клавиши

**Ctrl+Shift+U** — показать/скрыть виджет (работает глобально).
**Ctrl+Alt+U** — включить/выключить режим "Ghost Mode" (прозрачность и клики насквозь).

## Запуск

```
npm install
npm start
```
(Или используйте файл `start-widget.bat` для быстрого запуска без окна консоли)

## Где виджет берет логи

Парсер автоматически сканирует `%USERPROFILE%\.claude\projects\**\*.jsonl` (а также `\\wsl$\Ubuntu\home\...`).  
Если виджет везде показывает нули, убедитесь, что вы уже пользовались Claude Code, или проверьте, где лежат логи командой `claude config get`.

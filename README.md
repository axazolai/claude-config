# Курируемая конфигурация ~/.claude — установка и принцип работы

🇷🇺 Русский | [🇬🇧 English](README.en.md)

Кросс-платформенно (Linux / macOS / Windows). Принцип: **распакуй архив в любое место и запусти
один скрипт** — всё копирование в `~/.claude` делает установщик сам, ничего руками раскладывать
не нужно.

```
node setup.mjs
```

После установки — **перезапусти Claude Code** (хуки и настройки читаются только при старте).

---

## Оглавление

- [Установка на новом ПК (bootstrap, без ручного скачивания)](#установка-на-новом-пк-bootstrap-без-ручного-скачивания)
- [Порядок действий](#порядок-действий)
  - [Первичная настройка (новый ПК)](#первичная-настройка-новый-пк)
  - [Перенастройка](#перенастройка)
- [Состав бандла](#состав-бандла)
- [Перенос `~/.claude` на другой диск](#перенос-claude-на-другой-диск)
- [Дополнительные подсистемы (bin/команды/хуки)](#дополнительные-подсистемы-binкомандыхуки)
- [Зачем это всё (проблема → решение)](#зачем-это-всё-проблема-решение)
- [Что куда ставится](#что-куда-ставится)
- [Как работает установщик (`setup.mjs`)](#как-работает-установщик-setupmjs)
  - [Конфликты (курируемый текст и JSON): объединить / заменить / пропустить](#конфликты-курируемый-текст-и-json-объединить-заменить-пропустить)
  - [Читаемость диффа](#читаемость-диффа)
  - [Структура репозитория: `payload/` vs корень](#структура-репозитория-payload-vs-корень)
  - [Следы GSD удаляются при каждой установке](#следы-gsd-удаляются-при-каждой-установке)
  - [Флаги (без интерактива / для CI)](#флаги-без-интерактива-для-ci)
- [Модель защиты: маркер, а не путь](#модель-защиты-маркер-а-не-путь)
- [Авто-инициализация проектов (SessionStart)](#авто-инициализация-проектов-sessionstart)
- [Правила стека (stack-rules): снапшот вместо автозагрузки](#правила-стека-stack-rules-снапшот-вместо-автозагрузки)
- [Что делает каждый хук и почему](#что-делает-каждый-хук-и-почему)
- [Проверка новой версии бандла](#проверка-новой-версии-бандла)
- [Требуемые инструменты и fallback](#требуемые-инструменты-и-fallback)
- [PowerShell tool на Windows (опционально, одноразовый опт-ин в setup.mjs)](#powershell-tool-на-windows-опционально-одноразовый-опт-ин-в-setupmjs)
- [Проверка после установки](#проверка-после-установки)
- [Автообновление компонентов (context-mode, сам бандл, design stack)](#автообновление-компонентов-context-mode-сам-бандл-design-stack)
- [Прочее / ограничения](#прочее-ограничения)
- [Диагностика: `PreToolUse hook error` / `cannot find module` на каждом Edit](#диагностика-pretooluse-hook-error-cannot-find-module-на-каждом-edit)
- [Кириллическая консоль: ошибка из-за символа (галочка/тире)](#кириллическая-консоль-ошибка-из-за-символа-галочкатире)

---

## Установка на новом ПК (bootstrap, без ручного скачивания)

Одна команда — сама качает пакет tarball'ом (git не нужен) и запускает `setup.mjs`.
Требуется только **Node** (и `tar`/`curl`, они есть в Win10 1803+/macOS/Linux из коробки).

```
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/axazolai/claude-config/master/bootstrap.sh | bash

# Windows PowerShell
irm https://raw.githubusercontent.com/axazolai/claude-config/master/bootstrap.ps1 | iex
```

Проброс флагов в `setup.mjs` (напр. неинтерактивная замена): POSIX — `… | bash -s -- --replace-all`;
Windows — `$env:CLAUDE_SETUP_ARGS='--replace-all'; irm … | iex`.

> Примечание: при `curl|bash` на Linux/macOS `setup.mjs` запускается неинтерактивно (stdin занят
> пайпом) — на уже настроенном `~/.claude` конфликты решаются аддитивным merge (без потерь, с
> бэкапами/сайдкарами); для явной замены добавь `-- --replace-all`. На чистом ПК разницы нет.

**Безопасная альтернатива** `curl|bash` / `irm|iex` (сначала прочитать, потом запустить):

```
# Linux / macOS
curl -fsSLO https://raw.githubusercontent.com/axazolai/claude-config/master/bootstrap.sh
less bootstrap.sh && bash bootstrap.sh

# Windows PowerShell
irm https://raw.githubusercontent.com/axazolai/claude-config/master/bootstrap.ps1 -OutFile bootstrap.ps1
notepad bootstrap.ps1; .\bootstrap.ps1
```

После установки — **перезапусти Claude Code**.

---

## Порядок действий

Два независимых механизма с разным охватом — **не вызывают друг друга и ничего друг про друга не
знают** (см. «Структура репозитория» ниже): `setup.mjs` ставит **`~/.claude` целиком** (хуки,
правила, скиллы, `CLAUDE.md`, базовый `settings.json` — один раз на машину), `/init-stack`
подключает **плагины конкретного проекта** (один раз на проект, или при смене стека).

### Первичная настройка (новый ПК)

1. `node setup.mjs` (или bootstrap — см. выше) — ставит `~/.claude`, в т.ч.
   `~/.claude/bin/init-stack.mjs`, которым пользуется шаг 3.
2. **Перезапусти Claude Code** (хуки и `settings.json` читаются только при старте).
3. В каждом ПРОЕКТЕ, где нужны стек-специфичные плагины, — открой там сессию Claude Code и
   запусти `/init-stack`. Семь шагов команды:
   - **1. детект** — сам прогонит `node ~/.claude/bin/init-stack.mjs` (детект стека + отчёт,
     ничего не пишет); файл/деп-маркеры → id стека и `STACK_PATHS` — общий источник в
     `~/.claude/bin/lib/stack-markers.mjs` (заменяет прежний скилл `stack-markers`).;
   - **2. снапшот stack-rules** — `hooks/lib/stack-rules-check.mjs`, и на `stale`/`missing`/
     `legacy` пересборка `.claude/stack-rules.md` суб-агентом (см. «Правила стека» ниже);
   - **3. интерактивная установка** — попросит тебя лично запустить
     `node ~/.claude/bin/init-stack.mjs -i` в СВОЁМ терминале: интерактивный чек-лист
     (arrow-key UI) через Claude провести нельзя; на подтверждении он сам ставит недостающие
     плагины (`claude plugin install`), пишет `./.claude/settings.json`, а следом предлагает
     установку объявленных стеком скиллов — `npx skills add` (обычные) или копию из
     `skill-library/` в `.claude/skills/` (bundled, механизм `install.bundled` — см.
     «Дополнительные подсистемы» ниже);
   - **4. fallback** — если нет реального терминала, non-interactive путь (`--enable`/
     `--apply-all`), только активация, без установки;
   - **5. design stack** — только на фронтенд-стеке: `bin/install-design-stack.mjs --root .`
     (Impeccable + привитое подмножество Pro Max, см. «Дополнительные подсистемы» ниже);
   - **6. финиш** — напоминание перезапустить Claude Code;
   - **7. отметка о прогоне** — `hooks/lib/mark-initstack-done.mjs` (даёт leanmode-диалу
     проекта дефолт `full`).

      `fallow` доезжает через плагин (дельта `001-fallow-graft` в форке
   ultrapowers), а `claude_orchestration` снят сознательно — см. RISK-INITSTACK-001, закрыт
   2026-07-27.
4. **Перезапусти Claude Code ещё раз** — `enabledPlugins` тоже резолвится только при старте.

Итого на новый ПК: `setup.mjs` — один раз, `/init-stack` — на каждый проект (сразу после
клонирования репозитория или когда в нём впервые понадобились плагины).

### Перенастройка

| Что изменилось | Что запускать | Периодичность |
|---|---|---|
| Вышла новая версия этого репозитория (обновились хуки/правила/скиллы) | `node setup.mjs` (флаги конфликтов — см. выше; `--dry-run` — посмотреть, что изменится, ничего не трогая) | по мере обновления пакета |
| `PreToolUse hook error` / битые пути в `~/.claude/settings.json` | `node setup.mjs --doctor`, затем `node setup.mjs` | по симптому (см. диагностику ниже) |
| В проекте сменился/добавился стек (новый фреймворк, монорепа и т.п.) | `/init-stack` заново — пречекнуты уже включённые плагины + авто-набор нового стека | при смене стека |
| Включить/выключить один конкретный плагин без полного прогона `/init-stack` | `node ~/.claude/bin/init-stack.mjs -i` напрямую (тот же чек-лист, но без отчёта, без сборки `stack-rules`, без design-stack и без отметки о прогоне) | по необходимости |
| Посмотреть текущий статус плагинов, ничего не меняя | `node ~/.claude/bin/init-stack.mjs` (без аргументов, ничего не пишет) | по необходимости |

После ЛЮБОГО из этих шагов, где менялся `settings.json` (пользовательский или проектный) —
**перезапусти Claude Code**: хуки, user-`CLAUDE.md` и `enabledPlugins` резолвятся только при
старте, hot-reload нет.

---

## Состав бандла

Бандл один: `setup.mjs` ставит каждый файл из `payload/`, кроме `alwaysExclude`. Состав описан в
`bundle.json`:

- `alwaysExclude` — файлы `payload/`, которые не ставятся;
- `plugins` — `ultrapowers`, `context-mode`;
- `mcpServers` — `scrapling`, `context7`, `deepseek`;
- `deepseekDefault` — уровень DeepSeek-офлоада по умолчанию (`medium`);
- `managedPlugins`, `marketplaces`, `forbiddenPlugins` — какими плагинами и маркетплейсами
  управляет установщик и что он не допускает;
- `keepInstalled` — плагины, которые остаются на диске выключенными (`superpowers`);
- `sessionDefaults` — `model` и `effortLevel` в `settings.json`;
- `managedMcpServers` — MCP-серверы уровня пользователя, которые установщик сверяет.

Не ставятся (`bundle.json → alwaysExclude`): `hooks/task-lifecycle-probe*` (probe-логгер схемы
`TaskCreated`/`TaskCompleted` — остаётся в репозитории как заготовка, но не ставится и не
регистрируется), `claude-md/**` (фрагменты — сырьё сборки `CLAUDE.md`, а не файлы для
`~/.claude`) и `**.test.mjs`.

Скилл-плагин — `ultrapowers@ultrapowers`; апстрим `superpowers` остаётся установленным, но
выключенным (`keepInstalled`), поэтому откат — одна команда (см. «`ultrapowers` вместо
`superpowers`» ниже).

Повторный запуск `setup.mjs` удаляет файлы, вышедшие из бандла: список строится по манифесту
`~/.claude/state/bundle-manifest.json`, перед удалением установщик спрашивает подтверждение
(`y/N`). Файлы, которых в манифесте никогда не было (твои собственные), он не трогает; курируемые
файлы и файлы, изменённые тобой вручную (хэш на диске не совпадает с записанным), в prune не
попадают.

После изменений `enabledPlugins`, хуков, MCP-серверов и `statusLine` **перезапусти Claude Code** —
на лету они не подхватываются.


### `ultrapowers` вместо `superpowers`

Базовым скилл-плагином стоит **`ultrapowers@ultrapowers`** — наш форк
[`obra/superpowers`](https://github.com/obra/superpowers) (Jesse Vincent, MIT), сужённый до
Claude Code. Живёт в [`axazolai/ultrapowers`](https://github.com/axazolai/ultrapowers): ветка
`original` хранит нетронутые снимки апстрима, `patch` — карту плагина, преобразование
переименования и наши дельты, `main` — собранный результат. `main` никогда не правится руками:
пересборка, не воспроизводящая её побайтово, считается дефектом и сообщается.

Из апстрима переносится только то, что действительно является плагином (51 файл из 180: манифест,
`SessionStart`-хук, скиллы, `LICENSE`). Остальное — шесть других харнессов, собственный тестовый
набор апстрима, его документы и релизная оснастка — записано как **намеренно исключённое**, с
причиной на каждое правило. Файл, появившийся у апстрима и не попавший ни в один список, блокирует
сборку до решения человека.

**Апстрим выключается, но не удаляется** (`bundle.json → keepInstalled`): откат — одна команда
(включить `superpowers`, выключить форк), а не переустановка из маркетплейса. Одновременно
включать оба не следует — они делят 14 имён скиллов.

**Согласие на действия с плагинами — по позициям.** `setup.mjs` печатает план и спрашивает
`y` (всё) / `n` (ничего) / `s` (выбрать). При `s` каждое действие спрашивается отдельно, с
пометкой, что оно делает: `enable`/`disable` меняют только `settings.json`, `install`/`uninstall`
трогают файлы, `marketplace_add` тянет и доверяет удалённый код. Отказ от регистрации
маркетплейса снимает и установки из него — иначе они гарантированно упадут; причина печатается.

Обновление — `/up-update`: `check` только читает и запускается из любого проекта, `update`
пересобирает во временном клоне и либо отказывается с указанием причины, либо готовит релиз и
останавливается. Публикация требует явного `--publish`, а доставка на машину — отдельный
`/plugin update`.

Для тестов есть герметичный режим: `CLAUDE_SETUP_SKIP_PLUGINS=1` полностью пропускает шаг
плагиновой реконсиляции (и сам probe `claude plugin list`), не трогая CLI;
`CLAUDE_SETUP_SKIP_MCP=1` так же делает шаг MCP-серверов печатью без вызова `claude mcp`.

---

## Перенос `~/.claude` на другой диск

`setup.mjs` и все runtime-скрипты/хуки читают конфиг-директорию как
`process.env.CLAUDE_CONFIG_DIR || ~/.claude`, поэтому набор можно установить в перенесённую
директорию **без правки кода**. Два способа (не взаимоисключающие):

- **Симлинк** `~/.claude` → целевая папка (`mklink /D`, разово нужен админ / Developer Mode).
  Работает на файловом уровне → покрывает **всё**: CLI, VS Code-расширение, любой инструмент,
  что хардкодит `~/.claude`. Более универсальный вариант.
- **`CLAUDE_CONFIG_DIR`** (`setx CLAUDE_CONFIG_DIR "D:\claude-home"`, без админа). Официальная,
  но **недокументированная и CLI-only** переменная: **VS Code-расширение её игнорирует**,
  релокация плагинов не гарантирована (реестр хранит абсолютные пути → возможен reinstall).
  Должна быть persistent и присутствовать при запуске Claude Code.

`setup.mjs` при старте интерактивно предлагает установить/изменить `CLAUDE_CONFIG_DIR`
(по умолчанию — target существующего симлинка); **Enter = не ставить**. Введённый путь
валидируется (нормализация «косых»; отклоняются относительные пути, неверный синтаксис,
сетевые/съёмные/CD-диски, несуществующий диск, симлинк в пути) — при ошибке переспрашивает.
Симлинк при установке переменной **не удаляется** — остаётся фолбэком.

> Все `.mjs` используют symlink-safe entry-point guard: под симлинкнутым `~/.claude` Node
> realpath'ит `import.meta.url`, а `argv[1]` — нет, поэтому наивный guard молча не запускал бы
> `main()` (хук/скрипт «мёртв»). Guard сверяет raw **или** realpath'нутый `argv[1]`.

---

## Дополнительные подсистемы (bin/команды/хуки)

Помимо базовой защиты набор ставит несколько независимых инструментов (каждый со своими
юнит-тестами `*.test.mjs`, гоняются `node run-tests.mjs` — это `node --test` с временными каталогами в
`.claude/.scratchpad/test-tmp/`, которые удаляются после прогона):

- **pnpm phantom-dependency guard** — команда `/pnpm-phantom-fix` + `bin/pnpm-phantom-scan.mjs`
  + PostToolUse-хук `hooks/pnpm-phantom-fix-hook.mjs`: находит undeclared-but-imported пакеты
  (напр. `@hookform/resolvers`→`zod`) и additively объявляет их optional-peer в
  `packageExtensions`, чтобы `enableGlobalVirtualStore` их не ломал. Per-project обвязку ставит
  `bin/pnpm-phantom-fix-install.mjs` (только pnpm, идемпотентно, без пути удаления);
  root-`postinstall` кросс-шелльный — node сам резолвит `$HOME`, поэтому работает и в cmd.exe
  (где `~` не раскрывается), и в POSIX, и тихо no-op на машине без claude-config.
- **Turbopack × global-virtual-store** — `bin/turbopack-gvs-check.mjs` (`/init-stack`, только
  Next+pnpm): детектит структурный конфликт out-of-tree стора с Turbopack (чанки `404` после
  hard-reload) и печатает рецепт. Рецепт version-aware и монорепо-осознанный: для pnpm ≥11
  пишет `virtualStoreDir` в `pnpm-workspace.yaml` (camelCase), для <11 — в `.npmrc` (kebab);
  стор якорится на корне воркспейса (а для git-worktree — на каноническом main-worktree, чтобы
  все worktree одного репо шарили один `<репо>-store`), а `turbopack.root` расширяется на
  правильную глубину для вложенного приложения. Read-only, ничего не правит.
- **Супервизия фоновых задач** — `bin/supervise-bg.mjs` оборачивает фоновую команду в
  timeout + staleness-watchdog (зависание → exit-событие, а не тихий столл) + PreToolUse-нудж
  `bg-supervision-nudge` + PostToolUse `ci-watch-nudge` (после `git push` — `gh run watch`) +
  PostToolUse `prune-tests-nudge` (после `git push` — вычистить непомеченные тесты) +
  PreToolUse-нудж `schedulewakeup-loop-only-nudge` (ScheduleWakeup — только для /loop-пейсинга;
  завершение отслеживаемой фоновой задачи ре-инвокает модель само, wakeup-поллинг — впустую).
- **Веб-доступ** — секция WEB ACCESS в CLAUDE.md разводит Context7,
  `ctx_fetch_and_index` и Scrapling MCP; PreToolUse-гейт `scrapling-raw-gate` запрещает
  `main_content_only=false` (он выключает санитайзер скрытого контента — защиту от
  prompt injection; обход — `CLAUDE_SCRAPLING_ALLOW_RAW=1`), а PostToolUse/PostToolUseFailure
  `web-block-nudge` при заглушке Cloudflare, 403/429 или пустой JS-оболочке после `WebFetch`/
  `ctx_fetch_and_index` подсказывает повторить через Scrapling.
- **Design stack фронтенд-проекта** — `bin/install-design-stack.mjs` (шаг 5 `/init-stack`,
  только когда детект дал фронтенд-стек). Ставит per-project **Impeccable**
  (`npx impeccable install --providers=claude --scope=project --no-hooks`) и прививает к нему
  поисковое подмножество **UI/UX Pro Max** (`uipro init --ai claude --offline`, из него
  остаются `ui-ux-pro-max`, `ui-styling`, `design-system` — остальные скилл-папки удаляются).
  Что именно ставится, объявляет блок `designStack` в `setting-templates/frontend/_base.json`:
  это не плагиновая машинерия, в `settings.json` он не мёржится. Идемпотентно и fail-soft —
  повторный прогон доставляет недостающее и перепроверяет хук с прививкой. Хук опознаётся по
  хвосту пути, а не по всей строке команды: запись Impeccable вида
  `node "$CLAUDE_PROJECT_DIR/.claude/skills/impeccable/scripts/hook.mjs"` — это тот же хук, что
  и наша относительная, второй копии не добавляется; уже накопившиеся дубли сворачиваются до
  одной записи на событие (чужие хуки в той же записи остаются). Обе части — в
  реестре компонентов, поэтому обновляются сами (см. «Автообновление компонентов» ниже).
- **Уборка `~/.claude`** — команда `/claude-cleanup` + `bin/claude-cleanup.mjs`. Движок
  allowlist-овый: предлагает пути только под перечисленными корнями категорий (`ephemeral` —
  кэши/логи/снимки шелла старше 7 дней; `age` — `file-history`/`jobs`/`tasks`/бэкапы старше
  14 дней; `session` — старые транскрипты проектов; stale temp и устаревшие версии
  plugin-кэша), поэтому `memory/`, живой конфиг, venv'ы и текущая сессия вне области по
  построению. Сначала dry-run-отчёт, затем явное подтверждение; ничего не удаляется —
  всё переезжает в `~/.claude/.cleanup-trash/<партия>/` и восстановимо 7 дней.
- **Чистка scratchpad проекта** — skill `/scratch-prune`, движок `bin/scratch-prune.mjs` +
  `bin/lib/scratch-prune-lib.mjs`. Раскладка вместо кучи `tmp/`: `phase-<NN>/{scripts,data,logs}/`
  на текущую фазу, `adhoc/<YYYY-MM-DD>-<topic>/` вне фазы, `proc/` — TEMP/TMP/TMPDIR каждого
  процесса, `test-tmp/` — рабочие каталоги `run-tests.mjs`. Три режима: голый `/scratch-prune`
  (legacy вне раскладки + устаревшие `adhoc/`/`proc/` + harness-сессии этого проекта),
  `/scratch-prune phase <NN>` (то же плюс закрытая `phase-<NN>/`), `/scratch-prune --all-harness`
  (плюс harness-сессии всех проектов машины, одно да/нет). Найденный скрипт разбирается на
  reuse-или-одноразовый: переиспользуемый `promote`-ится в `<project>/.claude/tools/` со строкой в
  `INDEX.md`, одноразовый уходит в план на `apply`. Содержимое проекта переезжает в общую
  `~/.claude/.cleanup-trash/<партия>/` (восстановимо 7 дней); harness-каталоги сессий удаляются
  сразу (`apply --purge-now`, только формы `<slug>/<uuid>` под harness-корнем). `disable-model-invocation`
  снят — хук закрытия фазы может позвать skill сам, не только пользователь. На других машинах то
  же ставит `setup.mjs`; там же SessionStart-хук `scratchpad-temp-env.mjs` подсказывает
  `/scratch-prune`, когда завёлся legacy-слой или harness-хвост перевалил 100 МБ.
- **Релиз-скилл `/publish`** — `skills/publish/SKILL.md`, четыре launch-key вместо четырёх
  отдельных релизных воркфлоу: `/publish dev` (мёрдж рабочей ветки в dev, бамп версии +
  changelog, тесты, push, вотч пайплайна), `/publish prod [X.Y.Z]` (подтверждение версии,
  MR/PR dev→prod, зелёный пайплайн, мёрдж, тег, вотч тег-пайплайна), `/publish fast` (без
  гейтов — push, MR/PR, мёрджит агент, тег) и `/publish step [X.Y.Z]` (заморозка release-ветки,
  MR/PR в prod, параллельно новая работа в dev через суб-агента). Общие флаги: `--dry-run`,
  `--reconfigure`, `--agent-merge`, `--no-watch`. Работает с GitLab (`glab`), GitHub (`gh`) или
  голым git без CI/CD — тогда публикация идёт только через git (мёрдж веток, push, тег, без
  шагов пайплайна). Настройки проекта — `.claude/publish.json`
  (host/remote/branches/cli/ci/version/changelog/tests/merge), пишутся первым запуском-интервью,
  пересобираются флагом `--reconfigure`. Ставится всегда.
- **`skill-library/` и bundled стек-скиллы** — новый верхнеуровневый каталог
  `payload/skill-library/`, отдельно от `payload/skills/` (те грузятся напрямую из
  `~/.claude`): здесь лежат скиллы, которые `/init-stack` КОПИРУЕТ в конкретный проект, а не
  подключает из бандла. Сейчас там один скилл — очищенный, депёрсонализированный `postgres`
  (MIT, из `planetscale/database-skills`). Стек-шаблон объявляет такой скилл через
  `install.bundled` (вместо обычного `install.cmd` с `npx skills add`) — `installSkills()` в
  `bin/init-stack.mjs` копирует `~/.claude/skill-library/<name>/` в
  `<project>/.claude/skills/<name>/` (`cpSync`, без npx) и отказывается перезаписывать уже
  существующую цель. DB-шаблон (`setting-templates/DB/_base.json`) объявляет `postgres` именно
  так. Интерактивный чек-лист `/init-stack -i` помечает каждый пункт по своему механизму —
  «(copy from the bundle)» или «(npx skills add)».

Права в `settings.partial.json` нормализуются при мёрже: `Write(x)`/`MultiEdit(x)` → `Edit(x)`
(+ dedup), т.к. Claude Code теперь матчит все file-tools через `Edit(path)`, а `MultiEdit` —
больше не инструмент.

---

## Зачем это всё (проблема → решение)

Базовая проблема: в Claude Code **проектный `CLAUDE.md` перебивает пользовательский**, а сам
`CLAUDE.md` грузится как контекст, а не как «жёсткая» конфигурация — то есть любой проектный файл
(в т.ч. сгенерированный) может тихо переопределить твои выверенные правила. Прозой в
глобальном `~/.claude/CLAUDE.md` это не защитить. Жёстко работают только хуки.

Поэтому набор делает три вещи:

1. **Защищает курируемые файлы** — PreToolUse-хук блокирует правку любого `CLAUDE.md` с маркером
   `<!-- CURATED:NOEDIT -->`, где бы тот ни лежал. Маркер решает
   всё, путь не важен. Немаркированные (сгенерированные) файлы правятся свободно.
2. **Ловит секреты** — PreToolUse-хук на `git commit` сканирует staged-изменения; при находке
   коммит блокируется (срабатывает только на коммитах, которые делает Claude, не на твоих ручных).
3. **Снимает рутину на новых проектах** — SessionStart-хук один раз на проект автоматически
   помечает курируемый рут-`CLAUDE.md`. Руками на каждый проект — ничего.

---

## Что куда ставится

Ниже — состав бандла. `*.test.mjs` рядом с каждым скриптом остаются в репозитории и не ставятся.

```
~/.claude/
  CLAUDE.md                              # твои курируемые правила (содержит строку-маркер);
                                          #   собирается из payload/claude-md/*.md
  settings.json                          # твой файл + до-мёрженные ключи (hooks, permissions.deny)
  hooks/
    deny-curated-claude-md.mjs           # блок правок курируемого CLAUDE.md (любая локация)
    protected-guard.mjs                  # отказ править/удалять/двигать пути из `.protected`
    secrets-gate.mjs                     # блок `git commit` при найденных секретах в staged
    scratchpad-layout-guard.mjs          # PreToolUse: запись/команда вне раскладки .scratchpad — deny
    worktree-executor-discipline-advisor.mjs # advisory: дисциплина worktree + backstop больших Read
    bg-supervision-nudge.mjs             # PreToolUse: нудж обернуть run_in_background в supervise-bg
    background-sleep-guard.mjs           # PreToolUse: запрет фонового sleep/Start-Sleep/timeout без работы
    schedulewakeup-loop-only-nudge.mjs   # PreToolUse: ScheduleWakeup — только для /loop-пейсинга
    ci-watch-nudge.mjs                   # PostToolUse: после `git push` — нудж `gh run watch`
    prune-tests-nudge.mjs                 # PostToolUse: после `git push` — нудж вычистить непомеченные тесты
    scrapling-raw-gate.mjs               # PreToolUse: запрет Scrapling с main_content_only=false
    web-block-nudge.mjs                  # PostToolUse(+Failure): блок/JS-оболочка → повторить через Scrapling
    phase-end-cleanup-nudge.mjs          # PostToolUse: закрытие фазы (строка ROADMAP → complete) → нудж /scratch-prune
    pnpm-phantom-fix-hook.mjs            # PostToolUse: скан фантомных зависимостей после install
    inject-axes.mjs                      # SessionStart + SubagentStart: инжектор осей правил (см. ниже)
    session-init.mjs                     # SessionStart: бутстрап проекта
    scratchpad-temp-env.mjs              # SessionStart: TEMP/TMP/TMPDIR → .scratchpad/proc/, хинт /scratch-prune
    precompact-observe.mjs               # PreCompact — записывает, где реально сработала автокомпакция
    statusline.mjs                       # statusLine.command — рендерер строки статуса
    lib/
      inject-axes.mjs                    # реестр осей (leanmode, verbosity) для хука выше
      leanmode-rules.mjs                 # карта agent_type->уровень, резолвер BASE+dial, шифт-таблица
      leanmode-{lite,full,ultra}-rule.md # тексты правил оси leanmode
      verbosity-rules.mjs                # резолвер оси verbosity (.claude/verbosity.json)
      verbosity-{lite,full,ultra}-rule.md # тексты правил оси verbosity
      component-registry.mjs             # реестр обновляемых компонентов + правила решения
      component-update-check-run.mjs     # detached-воркер проверки обновлений компонентов
      config-update-check-run.mjs        # detached-воркер: проверка новой версии бандла на GitHub
      impeccable-promax-graft.mjs        # прививка поискового подмножества Pro Max к Impeccable
      stack-rules-check.mjs              # сверка markers снапшота stack-rules с деревом (+ CLI)
      statusline-lib.mjs, phase-segment.mjs, context-severity.mjs, autocompact.mjs # сегменты строки статуса
      state-lock.mjs, atomic-json.mjs    # конкурентно-безопасная запись state-файлов
      jsonl-io.mjs                       # JSONL/JSON-хелперы для precompact-observe
      tdd-mode.mjs                       # режим тестирования проекта (tdd | test-after), запись
      mark-initstack-done.mjs            # зовётся из /init-stack; ставит initStackRun в project-init.json
  bin/
    init-stack.mjs                       # детект стека + плагиновый чек-лист (движок /init-stack)
    install-design-stack.mjs             # Impeccable + привитое подмножество Pro Max (шаг 5 /init-stack)
    detect-stack-commands.mjs            # блок «Detected commands» для снапшота stack-rules
    claude-cleanup.mjs                   # движок /claude-cleanup (allowlist + обратимая корзина)
    scratch-prune.mjs                    # движок /scratch-prune: раскладка + harness-сканы + promote → tools/
    supervise-bg.mjs                     # обёртка фоновой команды: timeout + staleness-watchdog
    pnpm-phantom-scan.mjs, pnpm-phantom-fix-install.mjs, turbopack-gvs-check.mjs # pnpm/Turbopack
    up-update.mjs                        # проверка/пересборка форка ultrapowers (движок /up-update)
    ultrapowers-tdd.mjs                  # CLI для /ultrapowers-tdd: показать/переключить режим тестирования
    lib/                                 # библиотеки перечисленного выше (stack-markers, design-stack,
                                          #   assemble-claude-md, claude-cleanup-lib, …)
  agents/
    leanmode-executor.md                 # саб-агент для явного per-task lean-опта (см. ниже)
  commands/
    init-stack.md                        # /init-stack — семь шагов настройки проекта (см. выше)
    init-mcp.md                          # /init-mcp — подключение MCP-серверов проекта
    leanmode.md                          # /leanmode — интерактив/--флаг, ставит project-level dial
    ultrapowers-tdd.md                   # /ultrapowers-tdd enable|disable — режим тестирования проекта
    aidev.md                             # /aidev — диал verbosity (терсность комментариев/пустот)
    claude-cleanup.md                    # /claude-cleanup — уборка ~/.claude с обратимой корзиной
    pnpm-phantom-fix.md                  # /pnpm-phantom-fix — фантомные зависимости pnpm
    up-update.md                         # /up-update — обновление форка ultrapowers
  skills/
    verification-before-completion/SKILL.md # тень с условием по модели: no-op на Opus 5.5+, иначе реальная проверка
    update-changelog/SKILL.md            # /update-changelog — git-история → changelog.json (RU-записи)
    model-selection-policy/SKILL.md      # routing моделей + effort-лестница, вынесен из CLAUDE.md
    scratch-prune/SKILL.md               # /scratch-prune — раскладка, фазы, harness-сессии; три режима вызова
    publish/SKILL.md                     # /publish — релиз через launch-keys dev|prod|fast|step
  skill-library/postgres/                # bundled-скилл для /init-stack install.bundled — копируется
                                          #   в проект (.claude/skills/), не грузится напрямую из ~/.claude
  rules-src/                             # источник правил стека — НЕ автозагружается Claude Code;
                                          #   компилируется в <проект>/.claude/stack-rules.md (см. ниже)
  setting-templates/                     # наборы плагинов по направлениям, применяет /init-stack
  state/project-init.json                # создаётся в рантайме; список уже инициализированных проектов
                                          #   (+ initStackRun на project root — ставит /init-stack)
  state/model-pricing.json               # создаётся в рантайме; таблица цен (обновляется раз в сутки)
  state/component-updates.json           # создаётся в рантайме; вердикты проверки обновлений
```

---

## Как работает установщик (`setup.mjs`)

- Копирует все файлы в `~/.claude` (создаёт папки), проставляет +x на `.mjs` под POSIX.
- **Область действия — только `~/.claude`** (хуки, `rules-src/`, `skills/`, `CLAUDE.md`,
  `settings.json`). Плагины проекта сюда не входят — это отдельный, независимый механизм,
  `/init-stack` (см. ниже), у него свой скрипт (`bin/init-stack.mjs`) и свой вывод. Если после
  запуска `setup.mjs` в выводе видны только сообщения про плагины — скорее всего был запущен
  `/init-stack`, а не `setup.mjs`: они не вызывают друг друга и ничего друг про друга не знают.

Два уровня файлов, обрабатываются по-разному, **осознанно**:

- **Управляемый контент** — `.mjs`-скрипты, и вообще любой `.md`/текстовый файл, который НЕ
  помечен `CURATED:NOEDIT`. Пакет — источник истины, поэтому такой файл **всегда переписывается
  версией из архива, без вопросов** — ровно как скрипты. Это то, что делает идею «положил свежий
  пакет — старые файлы обновились» реальной не только для `.mjs`, но и для `rules-src/`, `skills/`,
  `README.md` и т.п.
- **Курируемый контент** — файл, чьё **текущее содержимое на диске** содержит маркер
  `CURATED:NOEDIT` (на практике — твой `~/.claude/CLAUDE.md`). Никогда не трогается молча:
  показывается дифф, три варианта на выбор (см. ниже). Маркер решает, не имя файла — так же, как
  и в модели защиты хука `deny-curated-claude-md.mjs`.
- **JSON** (`settings.json`, `setting-templates/*.json`) — третий случай: настоящий **аддитивный
  глубокий мёрж** (твои значения остаются, недостающих ключей/элементов массива добавляются).
  Тоже конфликт-чекается как курируемые, потому что в JSON обычно лежат реальные
  per-machine значения (id маркетплейсов, твоя модель и т.п.), которые нельзя молча затирать.

### Конфликты (курируемый текст и JSON): объединить / заменить / пропустить

Показывается унифицированный дифф (формат `@@ … @@`, с номерами строк и подсветкой в терминале) и
три варианта:

- **(m) объединить (merge)** — дефолт.
  - **любой `.json`** (твой добавленный, `settings.json`, `setting-templates/*.json`) —
    глубокий аддитивный мёрж, как описано выше. Для `settings.json` источник «что нам нужно» —
    сам `settings.partial.json` из архива (а не второй, отдельно прописанный список внутри
    `setup.mjs` — раньше было так, и именно это давало рассинхрон: хук, добавленный в
    `settings.partial.json`, не долетал до реального `settings.json`, хотя сам `.mjs`-файл
    исправно копировался). Устаревшие/дублирующие записи НАШИХ хуков (по имени файла, а не по
    событию — переезд хука из `SessionStart` в `PreToolUse` тоже подхватится) удаляются,
    актуальные добавляются — повторный запуск idempotent. Тем же мёржем регистрируется и
    верхнеуровневый ключ `statusLine` — **но не безусловно**: перезаписывается только пустое
    значение или команда, указывающая на `statusline.mjs` бандла; значение, указывающее на
    что-то ещё (твой кастомный statusline), оставляется как есть. Записываемая команда — одна и
    та же: `node "<путь>/statusline.mjs"` (в кавычках, только прямые
    слэши — безопасно, даже если путь до `$HOME` содержит пробел). Подробности — «Что делает каждый хук и почему» ниже.
  - курируемый `.md`/текст — слить автоматически нельзя, дифф выше и ЕСТЬ результат мёржа.
    Ничего не пишется — ни в сам файл, ни рядом (никаких `<имя>.new`): твой файл остаётся
    байт-в-байт как был, применяй вручную по диффу или перезапусти с `--replace-all`.
- **(r) заменить (replace)** — файл из архива пишется поверх твоего. **Бэкап не создаётся** —
  единственная запись о том, что было, это дифф, показанный выше; восстанавливай через git/свою
  копию, если понадобится (для `.json` при merge — результат мёржа; при replace — файл из архива
  как есть).
- **(s) пропустить (skip)** — файл не трогается (для курируемого текста — то же самое, что и
  дефолтный merge выше: файл остаётся как есть).

Если файл новый — он просто **копируется**. Если существующий `.json` уже содержит всё из архива
(надмножество) — `unchanged`, ничего не пишется. Некурируемый текст, отличающийся от архива, —
`updated`, без диалога.

**Важно, если у тебя уже есть ручные правки в некурируемых `.md`-файлах** (например, свой
`rules-src/node.react.md`): начиная с этой версии они будут молча перезаписаны версией из архива при
следующем запуске `setup.mjs` (то же поведение, что всегда было у `.mjs`). Если такие правки есть
и их нужно сохранить — либо перенеси их в архив (в этот репозиторий) до запуска, либо в самом
файле поставь маркер `<!-- CURATED:NOEDIT -->` первой строкой, чтобы получить диалог merge/replace/
skip вместо тихой перезаписи. Сначала `--dry-run`, если не уверен, что именно обновится.

В конце вывода — **`--- summary ---`** (полный список файлов с пометкой created/updated/
unchanged/merged/replaced/skipped) и **`--- by category ---`** (сводка по папкам: `hooks: N
updated, M unchanged`, `rules-src: ...` и т.д.) — чтобы не приходилось гадать, обновились ли правила
и хуки, просматривая длинный список путей.

### Читаемость диффа

- В терминале дифф цветной (зелёный «+», красный «−», циановые `@@`-хедеры) и с номерами строк.
- `--no-color` или переменная `NO_COLOR` — выключить цвет.
- `--md` — выводить дифф как markdown-блок ```diff (удобно перенаправить в файл/PR — там он
  раскрасится автоматически).

### Структура репозитория: `payload/` vs корень

Репозиторий разделён на две зоны:

- **`payload/`** — всё, что реально устанавливается в `~/.claude` (`hooks/`, `skills/`, `rules-src/`,
  `commands/`, `setting-templates/`, `bin/`, `CLAUDE.md`). Установщик **зеркалит всё дерево `payload/`** в `~/.claude`, сохраняя структуру
  относительно `payload/` (т.е. `payload/hooks/foo.mjs` → `~/.claude/hooks/foo.mjs`).
- **Корень репозитория** — мета самого установщика, никогда не копируется: `setup.mjs`,
  `bootstrap.sh`/`bootstrap.ps1`, `README.md`, `settings.partial.json`,
  `docs/` и `.ultrapowers/` (планы фаз, ROADMAP и RESUME этого репозитория — вне дистрибуции).

Можно просто положить свои файлы/папки в `payload/` — они скопируются с сохранением структуры
(`payload/commands/`, `payload/agents/`, доп. `payload/skills/`, любые свои файлы). Правила те же:
новых нет → создаются; существующий `.mjs` → молча перезаписывается версией из бандла; прочий
существующий файл → дифф + выбор. Под POSIX на все скопированные `.mjs` ставится +x.

Файл `settings.json` в корне архива (`~/.claude/settings.json`) не копируется как обычный файл —
он управляется отдельным аддитивным мёржем на основе `settings.partial.json` (см. ниже). Скрытые
файлы (`.git`, `.DS_Store` и т.п.) внутри `payload/` тоже никогда не копируются.

### Следы GSD удаляются при каждой установке

Каждый запуск `node setup.mjs` автоматически и безвозвратно удаляет следы GSD с машины:
`gsd-core` и записи `gsd-*` в `~/.claude` (верхний уровень, `agents/`, `skills/`, `hooks/`, `hooks/lib/`), `commands/gsd/`, файлы бандла,
обслуживавшие GSD, регистрации GSD в `settings.json` (хуки, statusLine, permissions, env), ключи
GSD в `state/project-init.json` и `~/.gsd/`. Вопросов нет, корзины нет. Единственная копия —
`settings.json.pre-gsd-purge` рядом с `settings.json`, пишется до его правки.
`node setup.mjs --dry-run` перечисляет всё, что запуск удалил бы, и ничего не меняет. Собственный
файл `gsd-*` пользователя в `~/.claude` подпадает под шаблоны имён и тоже удаляется
(`RISK-GSDPURGE-001`). Проекты не затрагиваются: `.planning/` и проектный
`.claude/settings.json` остаются как есть.

### Флаги (без интерактива / для CI)

```
node setup.mjs --merge-all     # все конфликты -> объединить
node setup.mjs --replace-all   # все конфликты -> заменить (без бэкапа)
node setup.mjs --skip-all      # все конфликты -> пропустить
node setup.mjs --dry-run       # показать, что было бы сделано, без записи
node setup.mjs --md            # диффы как markdown ```diff
node setup.mjs --doctor        # проверить пути зарегистрированных хуков
```

Если запуск **не в терминале** и без флага, действие по умолчанию для существующих не-скриптов —
**merge**: `.json` объединяется по-настоящему, курируемый `.md`/текст остаётся как есть (ничего
не пишется, дифф уже показан). `.mjs` обновляются всегда. Чтобы вместо этого пропускать/заменять
— флаги `--skip-all` / `--replace-all`.

### Дефолты сессии (`model`, `effortLevel`) → `settings.json`

Сразу после сверки MCP `setup.mjs` также управляет двумя скалярными ключами в
`~/.claude/settings.json` — `model` и `effortLevel` — по `sessionDefaults` из `bundle.json`
(сейчас `{ "model": "sonnet", "effortLevel": "medium" }`):

- Отсутствующий ключ дописывается, без вопроса.
- Ключ, уже равный управляемому значению, не трогается — без вывода.
- Другое значение — конфликт, печатается как `key: old -> new` (например,
  `model: claude-opus-5-5 -> sonnet`). Перезаписывается только под `--replace-all` или
  интерактивным «да»; иначе (в том числе под `--merge-all`) остаётся как есть, с пометкой, что перезапустить с
  `--replace-all` (`kept model: claude-opus-5-5 (re-run with --replace-all to set sonnet)`).
- `--dry-run` печатает план (`--- session defaults ---` и сами изменения) и ничего не пишет;
  `--skip-all` тоже не трогает файл.
- `settings.json`, который не разбирается как JSON, этот шаг пропускает при любых флагах
  (`settings.json: INVALID JSON - left untouched`).

Сам план — чистая функция `buildSessionDefaultsPlan()` в `session-defaults.mjs` (корень
репозитория, рядом с `setup.mjs` — в `~/.claude` не устанавливается): без доступа к fs/process,
поэтому тестируется напрямую юнит-тестами; `setup.mjs` только читает/пишет `settings.json` и
применяет план, который она возвращает.

`sonnet`/`medium` — это и есть собственный дефолт модели-политики бандла начиная с этой версии
(раньше был Opus 5.5) — см. `model-selection-policy/SKILL.md` и фрагменты CLAUDE.md
`12-model-selection.md`.

---

## Модель защиты: маркер, а не путь

Авторитетность «путешествует» с маркером. Любой `CLAUDE.md`, в котором ЕСТЬ строка
`<!-- CURATED:NOEDIT -->` (не обязательно первая — до неё может идти заголовок, фронтматтер и
т.п.; пробелы/табы вокруг строки и вокруг `<!--`/`-->` не важны), считается курируемым: защищён
от правок агентом и является источником истины — где бы он ни лежал.
Немаркированные (сгенерированные) файлы правятся свободно. Никакой привязки к
конкретному пути нет — как и никакой привязки к позиции строки в файле. Просто отдельное
упоминание маркера в прозе (например, эта фраза) не считается — матчится только сама строка
целиком.

---

## Авто-инициализация проектов (SessionStart)

Хук `session-init.mjs` срабатывает на старте КАЖДОЙ сессии (состояние — в
`~/.claude/state/project-init.json`, но большинство шагов ниже НЕ одноразовые — см. почему). Он
**детерминированно правит файлы** (не полагается на инъекцию контекста — она на свежих сессиях
иногда теряется):

- **авто-маркирует** немаркированный рут-`CLAUDE.md` как курируемый. **Перепроверяется каждую сессию, идемпотентно** (раньше было одноразово на
  первую сессию проекта — оказалось багом: если рут-`CLAUDE.md` на первой сессии ещё не
  существовал, а появлялся позже от стороннего инструмента, — он навсегда оставался
  немаркированным, т.к. одноразовый флаг уже был потрачен). Тумблер: `CLAUDE_CURATED_AUTOMARK_ROOT=0`.
- **предлагает `/init-mcp`** (только подсказка — ничего не запускает): если у репозитория
  GitHub/GitLab-remote или есть признаки работы с БД (`postgres`/`DATABASE_URL`/`prisma`/`typeorm`/
  `psycopg`/`sqlalchemy` в конфигах), а соответствующий MCP ещё не подключён — дописывает в
  `additionalContext` предложение подключить его через `/init-mcp` (там же — опция self-hosted
  SearXNG для веб-поиска). **Перепроверяется каждую сессию** (git/БД могут появиться позже, поэтому
  не одноразово) и сам замолкает, когда нужный MCP подключён. Веб-поиск пассивно не детектится
  (on-demand) — упомянут как опция. Тумблер: `CLAUDE_MCP_SUGGEST=0`.
- **проверяет наличие снапшота stack-rules** (только подсказка, файлы не трогает) — просто
  смотрит, существует ли `.claude/stack-rules.md`. Проверки на устаревание на старте сессии
  больше нет: упрощено 2026-07-13 — раньше сверялся фронтматтер снапшота против
  `~/.claude/rules-src/` и стека проекта (`hooks/lib/stack-rules-check.mjs`), это было убрано
  как слишком навязчивое (срабатывало на каждой сессии с рассинхроном). Сам дрейф теперь
  ловится в `/init-stack` — по карте `markers`, а не по хешам. Если файла нет — дописывает в
  `additionalContext` предложение запустить `/init-stack`; генерация снапшота теперь входит в
  шаги самой этой команды. Подробности механизма — раздел «Правила стека (stack-rules)» ниже.
  Тумблер: `CLAUDE_STACK_RULES=0`.

Переключатели (переменные окружения, читает хук):

```
CLAUDE_CURATED_AUTOMARK_ROOT=0   # не авто-маркировать рут (вместо этого — подсказка)
CLAUDE_CURATED_AUTOINIT=0        # выключить авто-инициализацию целиком
CLAUDE_MCP_SUGGEST=0             # не предлагать /init-mcp при детекте git/БД
CLAUDE_STACK_RULES=0             # не проверять наличие снапшота stack-rules (см. раздел ниже)
```

Сбросить состояние конкретного проекта (чтобы прогнать заново) — удалить его запись из
`~/.claude/state/project-init.json`.

---

## Правила стека (stack-rules): снапшот вместо автозагрузки

Правила для языков/фреймворков лежат в `~/.claude/rules-src/` и **не автозагружаются**.
Раньше папка называлась `~/.claude/rules/` — но всё внутри неё Claude Code загружает сам
(path-scoped через `paths:`-фронтматтер, а без фронтматтера — безусловно), и выключателя у
этого механизма нет: `rules/README.md` + `rules/templates/*.md` попадали в КАЖДУЮ сессию
КАЖДОГО проекта (~7,3 КБ накладных расходов на ровном месте). Единственный способ это
остановить — убрать файлы из сканируемого пути, поэтому папка переименована.

Как правила теперь попадают в сессию:

- **Пер-проектный снапшот `<проект>/.claude/stack-rules.md`** — скомпилированная выжимка из
  `rules-src/` только под стек проекта: base-правила языка + direction-правила фреймворка +
  сквозные (testing/security и т.п.), с дедупликацией пересечений; все «Avoid»-списки
  переносятся дословно, версии — как есть. Собирает его суб-агент по инструкции
  `~/.claude/rules-src/README.md` § «Building stack-rules» — как шаг команды `/init-stack`,
  либо руками по запросу. `paths:`-фронтматтер в исходниках сохранён — теперь это метаданные
  отбора для компилятора, Claude Code его не читает.
- **В контекст** снапшот попадает через строку `@stack-rules.md` в автозагружаемом
  `.claude/CLAUDE.md` проекта. Сам файл при сборке добавляется в `.gitignore` проекта —
  это машинно-генерируемый личный конфиг, в репозиторий проекта он не идёт.
- **Проверка на старте сессии** — упрощена 2026-07-13 до простого `existsSync` на
  `.claude/stack-rules.md` (`session-init.mjs`), без сравнения хешей. Файла нет →
  в `additionalContext` дописывается предложение запустить `/init-stack` — генерация снапшота
  теперь один из его шагов. Файл есть → хук молчит и больше НИЧЕГО не перепроверяет: на старте
  сессии снапшот не считается «устаревшим» автоматически, даже если `rules-src/` или стек
  проекта изменились. Раньше здесь была проверка `sourceHash`/`stackFingerprint` — она сравнивала
  хеши, а `sourceHash` считается от пути/размера/mtime, поэтому его двигал каждый деплой
  `setup.mjs` без единой правки в тексте правил: сравнение на каждой сессии оказалось слишком
  навязчивым. Тумблер: `CLAUDE_STACK_RULES=0`.
- **Проверка на дрейф — в `/init-stack`, и она называет, что именно изменилось.**
  `hooks/lib/stack-rules-check.mjs` сравнивает не хеши, а карту `markers`, записанную во
  фронтматтере снапшота: рут И каждый воркспейс (в pnpm-монорепе `next.config.ts` лежит в
  `apps/web/`, и по одним только рутовым признакам фронтенд не виден вовсе). Печатает
  `status` (`ok` / `stale` / `missing` / `legacy`) и пары `{ workspace, marker }`, которые
  появились и исчезли, — поэтому пересборка получается точечной правкой, а не регенерацией.
  `sourceHash`/`stackFingerprint` по-прежнему проставляются во фронтматтер, но ни на что не
  влияют. Снапшоты, собранные до появления строки `markers:`, читаются как `legacy`:
  о них сообщается, но дрейфом они не считаются — иначе о нём отрапортовал бы каждый проект
  на машине сразу, а именно так эту проверку и выключили в прошлый раз. Такой снапшот
  становится сравнимым после одной полной пересборки.
- **Шаблоны** (`rules-src/templates/`) больше не автозагружаются — применяются на шаге сборки
  снапшота: `next.AGENTS.md` → `AGENTS.md` в руте проекта, когда обнаружен Next-стек и файла
  ещё нет.

**Миграция при установке**: `setup.mjs` чистит старую `~/.claude/rules/` — удаляет из неё
файлы, чей относительный путь есть в `rules-src/` бандла (старые копии пакета: оставь их —
и они продолжат автозагружаться, дублируя каждое правило), твои собственные файлы не трогает
(печатает заметку — перенеси их в `rules-src/` руками, если автозагрузка не задумана), а
опустевшую после этого папку удаляет целиком. Существующим проектам ничего делать не надо:
первая сессия после обновления не найдёт снапшот и получит инструкцию сборки.

**Что покрыто** (компилятор слоями `base → direction → cross-cutting`; полный список и то, как
слои резолвятся — в `rules-src/README.md`):

- **Языки/фреймворки (direction):**
  - **Node** — `node.base` + `nest` / `next` / `react` / `react-native` / `telegram`
  - **Python** — `python.base` + `cli` / `data` / `django` / `fastapi` / `flask` / `telegram`
  - **C#** — `csharp.base` + `aspnet` / `cli` / `wpf`
  - **Kotlin** — `kotlin.base` + `android` / `intellij-plugin`
  - **Swift** — `swift.base` + `ios`
  - **Dart** — `dart.base` + `flutter`
- **Сквозные (cross-cutting, подмешиваются по признакам проекта):** `testing`, `security`,
  `api-contracts`, `ci`, `docker`, `sql`, `shell`, `mobile`, `monorepo`, `design-fidelity`
  (для UI-стеков — реализация 1:1 по выданному макету/референсу), `context7` (когда
  подключён одноимённый MCP-сервер).
- **Блок «Detected commands»** в конце снапшота — команды теста и сборки, выведенные из тех же
  маркеров: `bin/detect-stack-commands.mjs` печатает готовый markdown, компилятор его
  вставляет. Стек без уверенного дефолта честно печатает, что команду надо задать вручную, —
  выдуманная команда хуже отсутствующей.
- **Шаблоны** (`rules-src/templates/`): `next.AGENTS.md` — см. выше.

Каждый файл самодокументирован; здесь — только карта охвата, чтобы не дублировать 30+ файлов в
README (источник истины — сами `rules-src/*.md` и их `README.md`).

Дизайн и обоснование: `.ultrapowers/archive/specs/2026-07-12-stack-rules-design.md` (вне
дистрибуции).

---

## Что делает каждый хук и почему

- **deny-curated-claude-md.mjs** (PreToolUse: `Edit|Write|MultiEdit`). Блокирует правку любого
  `CLAUDE.md`, содержащего строку-маркер — **никакого хардкода пути** для
  `~/.claude/CLAUDE.md` внутри хука нет (раньше был; убрали, чтобы не было двух источников
  истины). Защита твоего глобального файла держится на том, что `setup.mjs` гарантирует ему
  маркер при каждом запуске (см. «Авто-инициализация проектов» — тот же принцип и для
  рут-`CLAUDE.md` проекта). Почему хук, а не правило: `CLAUDE.md` грузится как контекст,
  проектный перебивает пользовательский — текстом инвариант не удержать, хук же отрабатывает
  до записи и его нельзя обойти промптом.
- **protected-guard.mjs** (PreToolUse: `Edit|Write|MultiEdit|NotebookEdit|Bash`). Отказывается
  править, удалять и перемещать любой путь, перечисленный в файле `.protected` — формат
  `.gitignore`, действует в своём каталоге и всех уровнях ниже. Чтение не трогается, копирование
  **из** защищённого пути разрешено; `cp` разбирается по направлению, а команда, которую не
  удалось разобрать, но в которой упомянут защищённый путь, отклоняется — именно там потеря файла
  наиболее вероятна. Создание файла, которого ещё нет, разрешено даже под защищающим правилом:
  запрет сформулирован как «править, удалять, перемещать», а создания среди них нет — иначе фаза
  не смогла бы написать собственную спеку. Перезапись существующего файла остаётся запретом, и
  обойти это через «удалить и создать заново» нельзя, потому что удаление отклоняется.
  Два правила интринсик, а не записи списка: `.protected` можно править, но
  нельзя удалять, и `.protected`, скрытый `.gitignore`, отклоняет любую запись в своей области —
  защита, живущая на одной машине, не является правилом проекта — при этом сам `.gitignore` и
  `.protected` остаются доступными для записи, иначе починка невозможна. Вложенный `.protected`
  может расширять **или** переопределять унаследованное, то есть и снимать защиту: это осознанно
  принятая лазейка.
- **secrets-gate.mjs** (PreToolUse: `Bash`). На `git commit` сканирует `git diff --cached`:
  AWS-ключи, приватные ключи, токены Slack/GitHub, креды в строках подключения, явные присваивания
  секретов (env-ссылки отфильтровываются, чтобы меньше ложных). Если установлен `gitleaks` — он
  используется дополнительно. Базовый regex работает всегда, без зависимостей.
- **worktree-executor-discipline-advisor.mjs** (PreToolUse: `Bash|Read`). Чисто **advisory** —
  никогда не блокирует и не спрашивает, любой путь резолвится в `allow`. Два независимых дешёвых
  stdin-чека в одном файле (оба — одноразовый проход, делить нечего): **(1) дисциплина
  параллельных worktree** (только `Bash`, срабатывает лишь когда cwd похож на агентский worktree
  `.claude/worktrees/agent-*`) — ловит `pnpm/npm/yarn install` (полная переустановка per-worktree;
  на Windows ещё и EPERM при конкурентных установках даже с общим стором), запуск тест-раннера
  без видимого флага скоупинга (полный прогон × число worktree — наблюдались десятки минут на
  воркер) и голый `git status` (висит минутами на большом `node_modules` даже при корректном
  `.gitignore` — вместо него `git diff --stat HEAD`). **(2) backstop для больших `Read`**
  (любой сессии, без worktree-гейта) — собственный one-shot-нудж context-mode срабатывает
  максимум раз за сессию и потом молчит; этот backstop повторяется на каждом большом Read,
  покрывая то, что одноразовый пропустил. Эвристика, не гарантия: ложные пропуски ожидаемы и
  нормальны (нудж, не гейт), любой сбой парсинга → тихий passthrough.
- **session-init.mjs** (SessionStart). Бутстрап проекта (см. выше — большинство шагов теперь
  каждую сессию, идемпотентно).
  Ещё один каждосессионный идемпотентный шаг: в git-репозитории дописывает `.scratchpad/` в
  `.claude/.gitignore` (создавая файл, если его нет), чтобы временные файлы, которые правила
  велят держать в `<проект>/.claude/.scratchpad`, не могли попасть в коммит. Аддитивно —
  существующие строки сохраняются, повторный запуск ничего не дублирует. Хук
  `scratchpad-temp-env.mjs` (см. выше) проверяет то же покрытие `.gitignore` независимо, на
  старте той же сессии.
  Отдельный хинт в `additionalContext` (не мутация, каждую сессию): если leanmode-диал для
  проекта не `off`, каждую сессию напоминает мне (ассистенту) конвенцию — перед каждым
  запуском саб-агента через `Agent` резолвить эффективный уровень
  (`resolveEffectiveLevel(subagentType, root)`) и анонсировать его одной строкой прямо перед
  вызовом тулза: встроить `(leanmode=<level>)` в уже пишущийся нарратив (Ultrapowers
  `Subagent (type): "task"`), а не отдельной строкой; отдельный шаблон
  `Запускаю суб-агента <type> (<model>) в режиме (leanmode=<level>)` — только если никакого
  другого нарратива для этого запуска нет. Почему прозой, а не хуком: баннер запуска
  (`agent_type(description) Model`) рисуется харнессом до отработки хуков, а `systemMessage`
  из `SubagentStart` (его шлёт `inject-axes.mjs`, см. ниже) эмпирически подтверждённо нигде не
  рендерится — единственный канал донести уровень до появления баннера — моя собственная
  проза. Тот же тумблер `CLAUDE_LEANMODE=0`.
  Ещё один хинт в `additionalContext` (тоже каждую сессию, не мутация): проверка наличия
  снапшота stack-rules — только `existsSync`, `hooks/lib/stack-rules-check.mjs` тут не
  вызывается (он работает в `/init-stack`). См. раздел «Правила стека (stack-rules)» выше.
  Тумблер `CLAUDE_STACK_RULES=0`.
- **inject-axes.mjs** (`SessionStart` + `SubagentStart`) + **hooks/lib/inject-axes.mjs** —
  универсальный инжектор правил. В `settings.json` матчера нет: хук получает всё событие и сам
  резолвит каждую **ось** из реестра `AXES` независимо, а в `additionalContext` уходят только
  те блоки, чей уровень не `off`. Оси не ссылаются друг на друга — выключение одной не задевает
  другую, а новая добавляется одной записью в реестр. Осей сейчас две:
  - **leanmode** (`hooks/lib/leanmode-rules.mjs`, только `SubagentStart`) — первичная замена
    стороннего плагина `ponytail`: перед стартом саб-агента, по его `agent_type`, инжектит
    YAGNI-текст ("пиши минимум кода") — но не всем поровну: карта `DEFAULT_LEANMODE_MAP` даёт
    `off/lite/full` каждому известному `agent_type` по отдельности (11 из ~40 не-`off`; всё
    остальное — намеренно `off`, ничего не пишущие код агенты вроде
    планировщиков и аудиторов эту инъекцию не получают вообще). Поверх — per-project
    оверрайды (`.claude/leanmode.json`) и общепроектный dial (`off/lite/full/ultra`,
    `/leanmode`-командой), который **сдвигает**, а не заменяет карту — `off` при сдвиге не
    трогается ни в одну сторону (design rationale и полная карта:
    `.ultrapowers/archive/specs/2026-07-10-leanmode-design.md`, вне дистрибуции). dial по
    умолчанию — `full`, если для проекта хоть раз запускался `/init-stack` (флаг `initStackRun`
    в `~/.claude/state/project-init.json`, ставит **hooks/lib/mark-initstack-done.mjs**,
    вызывается шагом 7 `/init-stack`, не зарегистрированный хук сам по себе); иначе — `off`.
    Тумблер: `CLAUDE_LEANMODE=0`.
  - **verbosity** (`hooks/lib/verbosity-rules.mjs`, оба события) — терсность **комментариев и
    пустых строк** в генерируемом коде, и только их: имена, обязательный синтаксис, отступы,
    обработка ошибок на реальных границах и валидация не трогаются, это не минификация. Один
    проектный диал в `.claude/verbosity.json` (`off/lite/full/ultra`, команда **`/aidev`**)
    применяется одинаково к основному циклу и ко всем саб-агентам, с необязательными
    per-agent оверрайдами — карты базовых уровней по `agent_type` здесь намеренно нет: в
    отличие от структуры кода, многословность комментариев одинакова во всех пишущих код
    контекстах. Тумблер: `CLAUDE_VERBOSITY=0`.

  Хук также эмитит `systemMessage` с перечнем активных осей вместе с
  `additionalContext` — оставлено в коде на случай, если харнесс начнёт это рендерить.
  Эмпирически (2026-07-11, три реальных запуска саб-агента, debug-log инструментация; тогда
  это был отдельный хук `leanmode-subagent.mjs`, чью работу теперь делает ось leanmode)
  подтверждено: в потоке оркестратора `systemMessage` от `SubagentStart` не отображается —
  ни в баннере (который харнесс рисует до отработки хуков и переписать нельзя в принципе),
  ни отдельной строкой там. Тот же уровень виден оркестратору на практике через отдельный
  механизм — см. `session-init.mjs` выше. Отдельное, ещё не переподтверждённое
  debug-логом наблюдение: в развёрнутой транскрипции самого фонового суб-агента (`↓ to expand`)
  один раз была видна строка `SubagentStart:<type> says: <message>` — похоже на другую точку
  рендера `systemMessage` (не родительский поток), а не на противоречие выводу выше.

Семейство «супервизия фоновых задач» (обзор — в «Дополнительные подсистемы» выше; здесь —
построчно, что делает каждый хук). Общая идея: зависшая фоновая задача НИКОГДА не выходит,
поэтому `run_in_background` больше не переподнимет меня — превращаем зависание в гарантированное
событие завершения:

- **bg-supervision-nudge.mjs** (PreToolUse: `Bash`). Когда команда запускается с
  `run_in_background`, но не обёрнута в супервизор (`supervise-bg.mjs`/`gh run watch`/`timeout`) и
  не выглядит долгоживущим сервером (`dev`/`serve`/`start`/`--watch`/`nodemon`/`vite`/`next dev` —
  их watchdog по wall-clock убил бы зря), инжектит неблокирующее напоминание обернуть её в
  `bin/supervise-bg.mjs` (`--stale`/`--timeout`/`--label`) — тогда застой/таймаут убьёт задачу и
  вернёт событие завершения. Fail-open: любая ошибка → exit 0.
- **ci-watch-nudge.mjs** (PostToolUse: `Bash`). После `git push` в репо с GitHub Actions
  (`.github/workflows` вверх по дереву) напоминает досмотреть CI до конца фоновым
  `gh run watch <id> --exit-status` — он ВЫХОДИТ, когда CI финиширует (pass/fail), и тем самым
  переподнимает меня: «прошёл ли CI?» становится гарантированным push-событием, а не тем, что
  надо помнить и поллить. Разбор git-команды честно учитывает value-флаги `-C`/`-c` и цепочки
  через `&&`/`||`/`;`/`|`. Fail-open.
- **prune-tests-nudge.mjs** (PostToolUse: `Bash`). После `git push` напоминает провести чистку
  тестов: всё, что не помечено `@critical`/`@important` в имени, удаляется, затем подметаются
  остатки (пустые файлы, пустые `describe`/`suite`/классы, осиротевшие фикстуры и импорты),
  затем линтер и прогон выжившего набора. Удалять без подтверждения хук запрещает — он только
  поднимает вопрос. Срабатывает, только пока непомеченные тесты реально есть, поэтому пуш самой
  чистки его уже не поднимает. Скан ограничен (400 каталогов, 300 файлов, 512 КБ на файл),
  `node_modules`/`dist`/`build` и прочая сборка пропускаются. Fail-open.
Заготовка, которая **не ставится** (`bundle.json → alwaysExclude`):
`hooks/task-lifecycle-probe*` — probe-логгер схемы `TaskCreated`/`TaskCompleted`. Оба события
есть в публичных доках, но включены ли они в текущем билде харнесса — не подтверждено, поэтому
probe только пишет по строке на каждое срабатывание, ничего не решая. Он остаётся в
репозитории: чтобы им воспользоваться, надо зарегистрировать его руками.

Не хук в смысле `hooks.*` (другой механизм `settings.json` — верхнеуровневый ключ `statusLine`,
не `PreToolUse`/`PostToolUse`/событийные хуки выше), но тот же принцип "скрипт из этого бандла,
управляет твоим Claude Code" — здесь же для находимости:

- **statusline.mjs** (`statusLine.command`, регистрация — см. «Как работает установщик» выше) Строка рисуется сама, без единого
  сабпроцесса — пять сегментов слева направо, разделённых тусклым `│`:
  1. **ожидающие обновления компонентов**, по **имени** (`⬆ context-mode impeccable`), крайние
     слева — не счётчик;
  2. **модель** — `data.model.display_name` из payload statusLine;
  3. **контекст** — токены и процент, например `165.6K/1M 17%`, раскрашенные и помеченные по
     двум разным шкалам: **цвет** — по проценту окна модели (00–15 серый / 16–30 зелёный /
     31–55 жёлтый / 56–80 оранжевый / 81–100 красный), **иконка** — слева от цифр и вне цветовой
     обёртки, по проценту продвижения к автокомпакции (00–39 без иконки / 40–59 💡 / 60–74 ❗ /
     75–89 🔥 / 90–100 💀; каждая с `Emoji_Presentation=Yes`, иначе xterm.js рисует монохромный
     глиф). Обе шкалы сравнивают округлённый процент — тот самый, что напечатан в строке.
     Вместимость — `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, если
     задана (не выше окна модели), иначе окно модели целиком; внутри неё точка автокомпакции
     резолвится в таком порядке: `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` → наблюдение хука
     `precompact-observe.mjs` для текущей модели (`~/.claude/state/autocompact.json`) → сама
     вместимость. Дефолт — не угаданный резерв;
  4. **проект** — только имя папки, без ветки git;
  5. **фаза ultrapowers** — слаг фазы в работе: фронтматтер `current` из `.ultrapowers/ROADMAP.md`,
     иначе — единственная строка `phases:` со `status: running`; без ROADMAP или без фазы в работе —
     имя ветки git. Одно слово, без счётчиков; `/status-project-progress off` скрывает сегмент.

  Ключевое свойство сохранилось: ошибка любого источника стоит только своего сегмента, никогда
  всей строки — пустой вывод и код 0, statusline не ломается никогда.

Все хуки — на Node и зарегистрированы в **exec-форме** (`command: "node"`, `args: [абс.путь]`):
без шелла, поэтому работают и под Windows без Git Bash, без проблем с `$HOME` и переводами строк.

---

## Проверка новой версии бандла

`hooks/lib/config-update-check-run.mjs`. Detached-воркер,
  которого `session-init.mjs` спавнит и сразу unref'ит (сессию не блокирует). Сверяет SHA из
  `~/.claude/state/bundle-manifest.json` (что поставил `setup.mjs` в последний раз) с текущим
  master на GitHub (публичный API, без auth, ничего не отправляется) и сообщает ТОЛЬКО хорошую
  новость — что доступно обновление; любой сбой (оффлайн, rate-limit, корпоративный прокси)
  глотается молча, как и все остальные фоновые проверки бандла. Вердикт ложится в
  `~/.claude/state/component-updates.json` и перепроверяется не чаще раза в 24 часа, поэтому
  `setup.mjs` сверяет этот файл с только что установленным SHA (`reconcileBundleInstall`) — иначе
  баннер до конца окна просил бы запустить установщик, который уже отработал.

---

## Требуемые инструменты и fallback

Установщик проверяет и подсказывает команду установки под твою ОС:

- **node** — обязателен; гарантирован самим Claude Code. Хукам больше ничего не нужно для запуска.
- **git** — нужен `secrets-gate.mjs`. Если нет: `secrets-gate` становится no-op (коммит без git и
  так не выполнится), остальное работает. Установка: `apt/dnf` · `winget`/`choco`/`scoop` · `brew`.
- **gitleaks** — опционален. Без него работает встроенный regex. Установка: `winget`/`choco` ·
  release-бинарь · `brew`.
- **gh** (GitHub CLI) — опционален, нужен только `ci-watch-nudge.mjs` для `gh run watch` после
  `git push`. Без него нудж просто не даёт полезного эффекта (сам хук fail-open, ничего не ломает).
  Установка: `winget`/`choco`/`scoop` · `brew` · `apt/dnf`.

---

## PowerShell tool на Windows (опционально, одноразовый опт-ин в setup.mjs)

Claude Code умеет работать через PowerShell-тул вместо/наряду с Bash на Windows
(`CLAUDE_CODE_USE_POWERSHELL_TOOL=1` в `env`, опционально `"defaultShell": "powershell"` —
переключает ещё и интерактивные `!`-команды). Официально задокументировано на
docs.claude.com, но это **preview-фича, ещё «rolling out progressively»**, и у неё есть
существенные ограничения:

- **auto-mode не поддерживается** — каждая PowerShell-команда требует ручного подтверждения,
  даже в auto-approve/bypass-permissions сессии. Именно поэтому ключ **не** лежит в
  `settings.partial.json`: оттуда он переписывался бы при каждом прогоне, и любая уже
  настроенная auto-approved Windows-сессия молча начала бы спрашивать подтверждение на каждую
  команду после обычного `node setup.mjs`.
- `$PROFILE` (алиасы/функции) не подхватывается.
- без песочницы (sandboxing), которая у Bash-тула доступна через WSL2.
- execution policy может блокировать скрипты.
- pipeline отдаёт объекты, а не текст — awk/sed-стиль парсинга результата не работает.

Хуков пакета это не касается вообще — все они на Node в exec-форме (`command: "node"`), шелл им
не нужен. Влияет только на команды, которые Claude сам гоняет в сессии (git, npm и т.п.).

### Как это делает setup.mjs

На Windows `setup.mjs` спрашивает про этот ключ **один раз** и запоминает ответ — тот же
шаблон, что у `CLAUDE_CONFIG_UPDATE_CHECK`. Порядок:

1. Ищет PowerShell 7+ (`pwsh`). Windows PowerShell 5.1 (`powershell.exe`) — другой продукт и
   не засчитывается.
2. Если не нашёл — предлагает поставить через
   `winget install --id Microsoft.PowerShell`. Отказ ничего не записывает: предложение
   повторится в следующий раз, а не превратится в зафиксированное «нет».
3. Если PowerShell 7+ есть — спрашивает про сам тул и пишет в `~/.claude/settings.json`
   `"1"` при согласии или `"0"` при отказе.

Записанное решение окончательно в обе стороны: пока ключ есть в `env`, `setup.mjs` про него
больше не спрашивает, сколько бы раз его ни запускали. Передумал — поправь или удали ключ в
`~/.claude/settings.json` руками.

Без TTY вопросов не будет: включить можно явно флагом
`node setup.mjs --enable-powershell-tool` (он тоже требует установленного `pwsh` и сам ничего
не ставит).

```json
{ "env": { "CLAUDE_CODE_USE_POWERSHELL_TOOL": "1" } }
```

и, если нужно переключить также интерактивные `!`-команды: `"defaultShell": "powershell"` на
верхнем уровне — это `setup.mjs` не трогает. Подробности:
[PowerShell tool](https://code.claude.com/docs/en/tools-reference#powershell-tool).

---

## Проверка после установки

- `/hooks` — в списке должны быть две записи PreToolUse и одна SessionStart.
- Попроси Claude отредактировать твой помеченный `CLAUDE.md` → должно быть отказано.
- В репозитории с немаркированным рут-`CLAUDE.md` на первой сессии добавится маркер курируемого файла.
- Застейдь файл с явно захардкоженным ключом (строка вида `api_key = "<16 hex-символов>"`)
  и попроси Claude `git commit` → отказ; чистое изменение проходит.
 
---
 
## Автообновление компонентов (context-mode, сам бандл, design stack)

`session-init.mjs` каждую сессию спавнит detached-воркер `hooks/lib/component-update-check-run.mjs`
(сессию не блокирует, throttle 24ч на компонент, вердикты — в
`~/.claude/state/component-updates.json`). Что проверяется и как — задаёт **реестр**
`hooks/lib/component-registry.mjs`; прежний список `KNOWN_TOOLS` внутри `session-init.mjs` им
заменён, так что новый компонент добавляется одной записью в реестр:

| компонент | охват | как обновляется |
|---|---|---|
| `context-mode` | машина | `context-mode upgrade` — собственная подкоманда (тянет свежую версию с GitHub, пересобирает, переустанавливает хуки) |
| `claude-config` | машина | сам бандл: сверка SHA манифеста с master на GitHub, обновление — твой запуск `setup.mjs`, автоматически ничего не ставится |
| `impeccable` | проект | версия скилла; после апдейта заново накладывается прививка Pro Max (`impeccable-promax-graft.mjs`) |
| `ui-ux-pro-max` | проект | версия скилла |

Компоненты класса `safe` обновляются в фоне сами; класс `reinit` (сам бандл) только сообщает,
потому что переустановка — это решение человека. Что ждёт обновления, видно слева в строке
статуса — по имени (`⬆ context-mode impeccable`), а не счётчиком.

Тумблеры: `CLAUDE_COMPONENT_AUTOUPDATE=0` (всё), `CLAUDE_COMPONENT_AUTOUPDATE_<ИМЯ>=0`
(точечно, дефисы → подчёркивания, например `CLAUDE_COMPONENT_AUTOUPDATE_CONTEXT_MODE=0`).
Прежний `CLAUDE_TOOL_AUTOUPGRADE[_<ИМЯ>]=0` продолжает работать для `context-mode` — запись
реестра помнит своё старое имя переменной. Принятый риск: апдейт может ещё дописываться в фоне,
пока первые тул-коллы той же сессии уже используют инструмент.

---

## Прочее / ограничения

- Хуки срабатывают только внутри сессий Claude Code. Твои ручные коммиты и правки в терминале не
  затрагиваются — это by design.
- `permissions.deny` для `~/.claude/CLAUDE.md` — вторичный слой без зависимостей; основная защита —
  Node-хук (он же ловит маркер в любой локации).
- Правила в `secrets-gate.mjs` можно подгонять под свой стек — они ограничивают коммиты Claude.
- `settings.partial.json` — не просто справочный файл: `setup.mjs` читает его напрямую как
  единственный источник истины для хуков/permissions в `settings.json` (подставляя `<HOME>` на
  реальный домашний каталог). Правь хуки только тут — трогать сгенерированный мёрж внутри
  `setup.mjs` вручную не нужно и не надо. Годится и для ручной вставки, если не хочешь полагаться
  на установщик.

---

## Диагностика: `PreToolUse hook error` / `cannot find module` на каждом Edit

Симптом: на любой правке файла спам вида
`PreToolUse:Edit hook error` + `node:internal/modules/cjs/loader:...`.

Причина: Node не находит файл хука **по пути, записанному в `~/.claude/settings.json`** — путь
устарел (остался от ранней версии, в т.ч. от `.sh`-варианта) или указывает на другой `~`. Сам
хук исправен; проблема в записи `settings.json`.

Проверить, какой путь битый:

```
node setup.mjs --doctor
```

Покажет по каждому зарегистрированному хуку `OK` / `MISSING` / `BROKEN`.

Починить:

```
node setup.mjs
```

Установщик теперь **сам удаляет любые записи, ссылающиеся на его хуки** (битые пути, старые `.sh`,
неверный home) и прописывает свежие корректные. Твои собственные, не связанные хуки не трогаются.
После — **перезапусти Claude Code**. Запускай `setup.mjs` под тем же пользователем, под которым
работает Claude Code (иначе `~` снова разойдётся).

Мгновенно убрать спам до перезапуска: в `~/.claude/settings.json` временно поставить
`"disableAllHooks": true` (или удалить битую запись из `hooks.PreToolUse` руками).

---

## Кириллическая консоль: ошибка из-за символа (галочка/тире)

**Симптом:** при запуске (например, `/init-stack`) падение из-за не-ASCII символа (`v`-галочка `✓`,
длинное тире и т.п.) в терминале с OEM-кодировкой под кириллицу (cp866) или cp1251.

**Причина:** консоль в этой кодировке не может закодировать такой символ при выводе — запись в stdout
бросает ошибку, и шаг прерывается.

**Что уже сделано здесь:** все скрипты пакета (`setup.mjs`, хуки) выводят
**только ASCII** — они в этот класс ошибок не попадают.

**Если падает твой собственный скрипт/команда** (например, `/init-stack` печатает `✓`):
- проще всего — убрать не-ASCII из вывода (вместо `✓` писать `[ok]`/`OK`, вместо `—` дефис `-`);
- либо перевести консоль в UTF-8 перед запуском:
  - PowerShell: `chcp 65001` или `[Console]::OutputEncoding=[Text.Encoding]::UTF8`;
  - Python-инструменты: переменная `PYTHONIOENCODING=utf-8`;
  - Node выводит UTF-8 сам — достаточно ASCII-вывода или UTF-8-консоли.

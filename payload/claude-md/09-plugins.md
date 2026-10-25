## PLUGINS & SKILLS (loading policy)
- Base plugins (ultrapowers, context-mode) are enabled at USER scope and load every session.
  Do not duplicate them in project settings.
- Context7 and Scrapling are user-scope MCP servers installed by setup.mjs. Never enable the
  marketplace plugin named context7.
- Stack-specific plugins are enabled PER PROJECT via `.claude/settings.json` -> enabledPlugins,
  applied with `/init-stack`.
- enabledPlugins is resolved at STARTUP and does NOT hot-reload. Never edit settings.json
  mid-session to "enable" a plugin and claim it is active — it is not until restart.
  If stack plugins are missing, surface it: tell the user to run `/init-stack`, then restart.

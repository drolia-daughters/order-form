# Sentire Command Center (repo name: order-form)

Live at https://drolia-daughters.github.io/order-form/ — this repo IS the live software.

## Version rule (owner's standing instruction, 24 Nov 2026)
Every change that goes live gets a NEW version number:
1. Bump `window.SENTIRE_VERSION` (and `SENTIRE_BUILD` date) in `auth_config.js`.
   - Small fix / small addition → last digit (1.1.0 → 1.1.1)
   - New feature → middle digit (1.1.x → 1.2.0)
2. Add a line at the top of `CHANGELOG.md`.
3. Tell the owner the new version number so he can check the corner badge after Ctrl+F5.

See PROJECT_CONTEXT.md for how the apps work.

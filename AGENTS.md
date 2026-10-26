# Medly contributor instructions

Read README.md as the maintained product specification and PROJECT.md for the original brief.

- Never use em dashes or en dashes. Use only short hyphens (`-`) everywhere in project text and UI.
- Do not place a comma before “and” or “or” in prose or UI text. Apply this rule to all new and edited project text.
- Use vanilla ES modules, Bootstrap 5, IndexedDB and static assets. No runtime Node.js, framework, backend or build step.
- Preserve local-first privacy. No analytics, remote records, real patient fixtures or sensitive logs.
- Keep data-access logic in `assets/js/db` and backup logic in `assets/js/services/backup.js`.
- Update schema definitions, migrations, validation, backup support and README together for data model changes.
- Preserve stored records during upgrades. Wait for transaction completion before reporting success.
- Validate imports fully before writing; use one atomic transaction for replacement or merge.
- Keep user content escaped and files as blobs in normal IndexedDB storage.
- Do not close dialogs on backdrop clicks. Confirm destructive actions and discarding edited forms.
- Support 320px screens, keyboard use, local assets, relative GitHub Pages paths and safe areas.
- When changing application-shell assets, increment the cache version in sw.js and keep its asset list current.
- Run relevant checks documented in README. Use isolated synthetic data for browser tests.

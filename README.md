# Medly

Your health, together. Medly is a private, local-first personal medical archive for organizing visits, diagnoses, treatments, medications, providers, documents, and upcoming care. It is intended for personal use, with no accounts or backend.

This README is the maintained product specification. [PROJECT.md](PROJECT.md) contains the original project brief.

## Run locally

Serve this directory with any static web server. For example, with Python installed:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Open **http://localhost:8080**. Keep using the same browser profile, hostname, and port: each origin has its own database. `localhost` and `127.0.0.1` have different storage. Opening `index.html` directly with `file://` is not supported. Node.js, npm, a build step, and an internet connection are not required to run the application.

Deploy the repository as a static website over HTTPS, including on GitHub Pages. All asset paths and the PWA scope are relative, so repository subdirectories work. No server routes or rewrite rules are needed: navigation uses URL hashes.

## First version / MVP

The first version delivers the complete personal archive workflow:

- **Overview:** real counts for visits, diagnoses, active treatments, future scheduled appointments, and documents; recent activity; upcoming care; quick actions; friendly onboarding with no fake data.
- **Medical visits:** add, edit, delete, and inspect visits. Store date/time, doctor, type, reason, symptoms, clinical findings, tests/procedures, notes, and follow-up instructions/date. Link several diagnoses, treatments, and medications. Show the doctor’s clinic, linked care records, documents, and completed appointments together on the detail page.
- **Search and filters:** case-insensitive partial matching across structured fields and notes. Visit search also includes linked care records, doctor specialty, and clinic name. Filter visits by doctor, specialty, type, and inclusive date range. Sort lists by newest, oldest, or name. Input is debounced by 220 ms and searches a cached snapshot rather than querying IndexedDB on each keystroke.
- **Diagnoses:** name, date, status (Active, Resolved, Monitoring), optional medical code, notes.
- **Treatments:** name, status (Active, Completed, Planned, Stopped), start/end dates, diagnosis, instructions, notes.
- **Medications:** name, dosage, frequency, status (Active, Completed, Stopped, As needed), start/end dates, prescribing doctor, instructions, notes.
- **Doctors and clinics:** reusable directories with contact details and notes. Doctors reference clinics; their detail pages show associated visits. Clinic pages show linked doctors.
- **Documents:** original PDF, JPEG, PNG, and WebP files, maximum **7 MiB (7 × 1024 × 1024 bytes)** each. Files are checked for MIME type, size, and basic signatures and stored as IndexedDB blobs. Each can be linked to one visit, with multiple documents per visit. Add files individually, preview supported formats, edit metadata, download originals, and delete. PDF preview depends on the browser; original download is always available. Compression happens outside Medly.
- **Appointments:** reason, date/time, doctor, clinic, status (Scheduled, Completed, Cancelled, Missed), notes, optional completed visit. Use Complete appointment to set the status and optionally select an existing medical visit. To record a new visit, create it in Medical visits first and then link it. Scheduled appointments in the past show as overdue on the overview; they are never silently marked missed. Planned tests can be recorded as appointments with their test name as the reason.
- **Timeline:** derived from visits, diagnoses, treatment starts/completions, and document uploads. Tests and procedures are included in visit details. Timeline entries reference their source records; there is no redundant event store.
- **Settings:** full JSON backup/export, validated merge or replace restore, storage usage estimates, persistent-storage request, update checks, and confirmed clearing of the archive.
- **Mobile and accessibility:** responsive sidebar/bottom navigation, More menu, safe areas, native date controls, labeled inputs, visible keyboard focus, native accessible dialogs, reduced-motion support, and a skip link. Dialogs stay open on backdrop clicks. Escape and close/cancel controls ask before discarding edited forms.
- **Offline/PWA:** locally bundled assets, manifest, PNG icons, and a versioned service worker. After the first successful cache installation on HTTPS or localhost, the app shell works offline. Installation support depends on the browser. App cache updates leave IndexedDB untouched.

No medical records or sample patient data are preloaded. No medical advice, account system, synchronization, push notifications, or encryption is implemented. Password-based locks, encrypted backups, automated reminders, and dedicated structured laboratory/procedure entities are future work.

## Architecture

The primary accent is a vivid pink (`#cc2878`), with pale pink surfaces (`#fff0f7`) and deeper pink hover states (`#b51f68`). Buttons, navigation, focus indicators, and app icons share this palette. Green and amber indicate care status; red is reserved for destructive actions and errors.

```text
index.html                    Single application entry point and navigation shell
assets/css/app.css            Custom responsive visual identity
assets/vendor/                Locally bundled Bootstrap 5.3.3 CSS and MIT license
assets/js/app.js              Initialization, screen orchestration, UI event handlers
assets/js/router.js           Hash-based routing
assets/js/db/schema.js        Entity definitions, fields, versions, indexes
assets/js/db/database.js      IndexedDB initialization, migrations, transaction helper
assets/js/db/repository.js    Validated writes and relationship-safe deletes
assets/js/services/backup.js  Backup encoding, validation, atomic import/merge
assets/js/services/history.js Derived timeline, upcoming care, snapshot search
assets/js/components/         Icons, modal/toast behavior, schema-driven forms
assets/js/views/              Dashboard, lists, record details, timeline, search, settings
assets/js/utils/              Formatting, downloads, input and file validation
assets/icons/                 Local SVG and PNG app icons
manifest.webmanifest          Install metadata, relative scope and entry URL
sw.js                         Versioned static application-shell cache
tests/                        Browser integration and data-safety verification
```

The runtime is HTML, Bootstrap CSS, custom CSS, and vanilla ES modules. Native `<dialog>` handles focus trapping and keyboard behavior without a Bootstrap JavaScript dependency. Forms use Bootstrap controls and layouts. A shared entity definition keeps labels, fields, reference selectors, and import validation consistent without creating a framework. Native multi-select controls support multiple diagnoses, treatments, and medications; larger reference directories include a filter input.

Data access is separate from rendering. UI renders escaped user text; document previews use DOM-created elements and revocable blob URLs. Errors reach a central notification area or remain inline in forms. Writes are considered successful only after transaction commit. There is no silent fallback database.

Search and list rendering use one snapshot per route/change, not per keystroke. This keeps personal archives simple and responsive; very large archives may eventually require pagination, incremental search indexing, and lazy attachment reads. The current snapshot includes document blobs, which are not converted to base64 for everyday use.

## Database schema (version 1)

Database name: `medly`. All stores use `id` (UUID) as their key, plus ISO `createdAt` and `updatedAt` timestamps. Record references are UUIDs, never embedded copies. Optional single references are empty strings; multi-references are arrays of UUIDs.

| Store          | Domain fields                                                                                                                                                                      | Indexes                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `visits`       | `reason`, `date`, `doctorId`, `type`, `symptoms`, `findings`, `procedures`, `diagnosisIds[]`, `treatmentIds[]`, `medicationIds[]`, `followUpInstructions`, `followUpDate`, `notes` | `date`, `doctorId`, `type`, `followUpDate` |
| `diagnoses`    | `name`, `date`, `status`, `code`, `notes`                                                                                                                                          | `date`, `status`                           |
| `treatments`   | `name`, `status`, `startDate`, `endDate`, `diagnosisId`, `instructions`, `notes`                                                                                                   | `startDate`, `endDate`, `status`           |
| `medications`  | `name`, `dosage`, `frequency`, `status`, `startDate`, `endDate`, `doctorId`, `instructions`, `notes`                                                                               | `name`, `status`                           |
| `doctors`      | `name`, `specialty`, `clinicId`, `phone`, `address`, `notes`                                                                                                                       | `name`, `specialty`, `clinicId`            |
| `clinics`      | `name`, `type`, `address`, `phone`, `website`, `notes`                                                                                                                             | `name`                                     |
| `documents`    | `name`, `visitId`, `description`, `type`, `size`, `blob`                                                                                                                           | `visitId`, `createdAt`                     |
| `appointments` | `reason`, `date`, `clinicId`, `doctorId`, `status`, `visitId`, `notes`                                                                                                             | `date`, `status`, `visitId`                |

Visit/appointment date-times use local wall-clock values (`YYYY-MM-DDTHH:mm`) representing the intended appointment time. Other clinical dates use `YYYY-MM-DD`; audit timestamps use UTC ISO strings. Medly does not currently model appointment time zones. Dates are displayed according to the browser locale, with date-only records protected against UTC day shifts.

### Relationships and deletion

- Clinic ← doctors and appointments.
- Doctor ← visits, medications, and appointments.
- Diagnosis ← visits and treatments.
- Treatment / medication ← visits.
- Visit ← documents and completed appointments.

Deleting any referenced record is **blocked**, with an explanation. Nothing is cascaded. Unlink dependent records first, or keep the directory record for historical context. Reference validation and saves/deletes run in transactions spanning the relevant stores, protecting against deletion races. Clearing the archive is a separate, explicitly confirmed transaction.

The initial migration creates stores and indexes additively. Future schema changes must increment `SCHEMA_VERSION`, add explicit migrations, preserve records, update backup support, and test restoration of earlier supported backups. Version 1 imports currently support version 1 only. A database upgrade blocked by another tab is reported; version changes close the old connection and reload that tab.

## Backup format and recovery

Export produces a JSON object with `format: "medly-backup"`, `schemaVersion`, `appVersion`, `exportedAt`, and a `data` object containing every store. Documents replace their `blob` with `base64` only inside the backup. These backups contain readable sensitive medical information; protect the files accordingly.

Before import, Medly validates the JSON envelope, exact supported schema, required stores, supported fields, UUIDs, timestamps, field types, date ranges, statuses, duplicate IDs, file size/type/signature, and relationships. Invalid backups do not modify the archive. A review dialog shows record and document counts before applying either mode:

- **Merge:** UUID is the identity. New IDs are added. Matching IDs keep the version with the later `updatedAt`; ties preserve the existing record. Independently created records with different UUIDs remain separate even when their names match.
- **Replace:** the validated backup becomes the whole archive. Requires explicit destructive confirmation.

Imports read the current archive, check final relationships, and write all stores within one transaction. Clearing during replace and writing attachments are part of that transaction. Failure or storage exhaustion aborts the entire operation. Existing records are not erased before validation. Backups up to **250 MiB** can be imported; JSON encoding/decoding temporarily uses extra memory. Keep archives below that backup size for this first version. Very large attachment collections need a future streaming backup format.

If you switch devices/browsers, export first, copy the JSON securely, open Medly on the destination, and import. To undo an unintended edit or deletion, restore an earlier backup. There is no recycle bin or automatic backup.

## Privacy and data-loss risks

Medly makes no analytics, advertising, tracking, cloud-database, or external API calls. Runtime assets are served from the app’s own origin. The service worker caches only the explicitly listed static shell; medical records stay in IndexedDB. File type/signature checks reduce accidental invalid uploads but are not malware scanning.

IndexedDB and JSON backups are **not encrypted**. Local-first storage does not protect records from another person using the same browser profile, a compromised browser/device, or malicious code served from the hosting origin. Use a trusted device and hosting source.

Browser or OS eviction, clearing site data, private browsing cleanup, switching origins, a lost device, or a lost browser profile can make the archive unavailable. Request persistent storage in Settings, but treat regular exported backups as essential. Storage denials, initialization failures, blocked upgrades, transaction failures, and quota errors are surfaced to the user. There is no claim of guaranteed permanent storage.

Cross-tab notifications contain only an invalidation signal, never medical content. Screens refresh after another tab changes data unless a form dialog is open. Records are saved as complete forms; simultaneous edits to the same record are not collaboratively merged. Avoid editing the same record in two tabs at once.

## Offline updates

`sw.js` precaches the explicit application shell under a versioned `medly-shell-*` cache. Increment the cache version whenever changing cached application files. Installation completes only if all required assets cache successfully. The app does not force an update over an active session. In Settings, **Check for app updates**, then **Update & reload** activates a waiting worker. Only caches with Medly’s own prefix are cleaned up; IndexedDB is never cleared by the worker.

## Verification

The browser integration script uses Playwright as a **development-only** tool, outside the runtime. Install it in a temporary directory if needed:

```sh
npm install --prefix /tmp/medly-test-tools playwright
npx --prefix /tmp/medly-test-tools playwright install chromium
# Start the static server separately, then:
MEDLY_PLAYWRIGHT_PATH=/tmp/medly-test-tools/node_modules/playwright node tests/browser.cjs
```

The script creates an isolated browser context with synthetic records, never touches a user's normal profile, and checks CRUD, persistence, reference safety, multi-record visits, file validation, backups including attachment bytes and maximum-size files, rejected malformed backups, atomic rollback, search, mobile overflow, and offline shell loading. Screenshots go to a temporary directory. `MEDLY_TEST_URL` may override the default `http://127.0.0.1:8080`. Set `MEDLY_BROWSER=chrome` to use an installed Google Chrome instead of Playwright's downloaded Chromium.

The initial implementation was verified with Google Chrome on macOS, including every section at 320px, overview layouts at 390px/768px/1440px, backup export/import controls, and offline reloads. Safari/iPhone has not been verified on a physical device.

Manual checks are still recommended on Safari/iPhone for file previews, native multi-select/date controls, Home Screen installation, and keyboard behavior. Browser/OS PDF previews and persistent-storage decisions vary.

## Development rules

- Keep runtime dependencies local and minimal; no build tooling is required.
- Never add real medical data, remote tracking, or external uploads.
- Escape user text, validate both form inputs and imported records, and preserve failed form input.
- Update this specification when changing behavior or schema.
- Test data-safety changes against a real IndexedDB implementation, including failed imports.
- Do not silently delete relationships or introduce destructive database migrations.
- Keep relative paths and the service worker asset list current when adding modules.
- Confirm destructive UI actions and preserve unsaved work on cancellation.

Bootstrap 5.3.3 is distributed under the MIT license; see [the bundled license](assets/vendor/BOOTSTRAP-LICENSE.txt).

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
- **Medical visits:** add, edit, delete, and inspect visits. Store date/time, doctor, type, reason, symptoms, tests/procedures, clinical findings, notes. Visit create/edit forms contain no diagnosis or treatment selectors or editors. Diagnoses and treatments each have their own section on the visit detail page. Use **Add diagnosis** to create one diagnosis in a separate modal, prefilled with the visit date; the diagnosis and visit link save atomically. Open a linked diagnosis to edit it from its own detail page. After saving a visit, use **Add treatment** on its detail page to create one course in a separate modal; the course, optional new library medicine, and visit link save atomically. The visit date and doctor prefill the new treatment. Open a linked treatment to edit it from its own detail page. Clinical visit edits preserve current diagnosis and treatment links. Show the doctor’s clinic, linked care records, documents, and completed appointments together on the detail page.
- **Connected follow-ups:** the main Medical visits list shows initial visits as episodes, with follow-up counts and latest follow-up dates. Each episode is a non-collapsible row showing its follow-up count and the latest follow-up’s reason, date, and time. Open the initial visit to see the follow-up history; follow-up cards are not rendered in the main list. Every follow-up is still its own visit with independent findings, diagnoses, treatments, documents, and notes. Create a connected follow-up only through **Add follow-up** on the initial visit’s detail page. This prefills the doctor and visit type and sets the initial visit link automatically. Normal list/quick-action creation creates a separate episode. Follow-up pages and individual follow-up cards do not offer an Add follow-up action; use their initial-visit link to return to the main visit first. Clinical details and treatment courses are not copied automatically. No visit creation or edit form shows a **Follow-up to** selector or hidden parent input. The parent link is captured from the initial-visit action and preserved when editing an existing follow-up. Forms do not offer manual reassignment or detaching of episodes. A follow-up cannot follow another follow-up. Follow-ups appear as compact cards in one chronological level under the initial visit, with findings, notes, and documents available inside each card. The cards omit repeated “Follow-up to” text and provide inline open/edit icons with accessible labels and 44px touch targets. Their clinical details stay visible, with no expand/collapse controls.
- **Search and filters:** case-insensitive partial matching across structured fields and notes. Visit search also includes linked care records, doctor specialty, and clinic name. Filter visits by doctor, specialty, type, and inclusive date range. All filters apply together to each encounter; if a follow-up matches, the owning initial episode is returned with a matching-follow-up count; open it to review the follow-ups. The main list remains non-collapsible even while filtering. Main-list sorting uses the initial visit date (or name), while follow-ups run oldest to newest. Global search, provider histories, and the health timeline continue to expose individual visits, including follow-ups. Dashboard visit totals count all encounters, not just episodes. Input is debounced by 220 ms and searches a cached snapshot rather than querying IndexedDB on each keystroke.
- **Diagnoses:** name, date, status (Active, Resolved, Monitoring), optional medical code, notes.
- **Treatments:** one course of care per episode, with name, optional library medication, prescribed dosage, frequency, prescriber, status (Active, Completed, Planned, Stopped, As needed), start/end dates, diagnosis, instructions, and notes. Non-medication care uses the same form without a medicine. Start dates may be left unknown. The optional reuse selector in treatment creation shows dates, status, dosage, and related visit, newest first. Reusing a previous treatment copies details into a new course, resets status to Active, clears the end date, and uses the new visit date (or today) as its start date. Review the copied prescription before saving.
- **Medication library:** one reusable product entry with name, optional strength, form, and notes. Dosage, frequency, dates, prescriber, instructions, and status belong to treatment courses. The library shows course counts and the most recent course date; each medicine opens its course history with links back to visits. New entries with the same trimmed, case-insensitive name, strength, and form are rejected in favor of selecting the existing medicine. Distinct strengths/forms remain separate products. Legacy/imported duplicates are preserved until explicitly combined after review; combining moves courses without merging their histories and retains source product details in the kept entry’s notes.
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
assets/js/db/database.js      IndexedDB initialization and transaction helper
assets/js/db/migrations.js    Historical schema upgrade and backup definitions
assets/js/db/relationships.js Shared referential integrity checks
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

The runtime is HTML, Bootstrap CSS, custom CSS, and vanilla ES modules. Native `<dialog>` handles focus trapping and keyboard behavior without a Bootstrap JavaScript dependency. Forms use Bootstrap controls and layouts. A shared entity definition keeps labels, fields, reference selectors, and import validation consistent without creating a framework. Larger reference directories include a filter input.

Data access is separate from rendering. UI renders escaped user text; document previews use DOM-created elements and revocable blob URLs. Errors reach a central notification area or remain inline in forms. Writes are considered successful only after transaction commit. There is no silent fallback database.

Search and list rendering use one snapshot per route/change, not per keystroke. This keeps personal archives simple and responsive; very large archives may eventually require pagination, incremental search indexing, and lazy attachment reads. The current snapshot includes document blobs, which are not converted to base64 for everyday use.

## Database schema (version 5)

Database name: `medly`. All stores use `id` (UUID) as their key, plus ISO `createdAt` and `updatedAt` timestamps. Record references are UUIDs, never embedded copies. Optional single references are empty strings; multi-references are arrays of UUIDs.

| Store          | Domain fields                                                                                                                                                                    | Indexes                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `visits`       | `reason`, `date`, `doctorId`, `parentVisitId`, `type`, `symptoms`, `procedures`, `findings`, `diagnosisIds[]`, `treatmentIds[]`, `notes` | `date`, `doctorId`, `type`, `parentVisitId`  |
| `diagnoses`    | `name`, `date`, `status`, `code`, `notes`                                                                                                                                        | `date`, `status`                                             |
| `treatments`   | `name`, `medicationId`, `dosage`, `frequency`, `doctorId`, `status`, `startDate`, `endDate`, `diagnosisId`, `instructions`, `notes`                                              | `startDate`, `endDate`, `status`, `medicationId`, `doctorId` |
| `medications`  | `name`, `strength`, `form`, `notes`                                                                                                                                              | `name`                                                       |
| `doctors`      | `name`, `specialty`, `clinicId`, `phone`, `address`, `notes`                                                                                                                     | `name`, `specialty`, `clinicId`                              |
| `clinics`      | `name`, `type`, `address`, `phone`, `website`, `notes`                                                                                                                           | `name`                                                       |
| `documents`    | `name`, `visitId`, `description`, `type`, `size`, `blob`                                                                                                                         | `visitId`, `createdAt`                                       |
| `appointments` | `reason`, `date`, `clinicId`, `doctorId`, `status`, `visitId`, `notes`                                                                                                           | `date`, `status`, `visitId`                                  |

Visit/appointment date-times use local wall-clock values (`YYYY-MM-DDTHH:mm`) representing the intended appointment time. Other clinical dates use `YYYY-MM-DD`; audit timestamps use UTC ISO strings. Medly does not currently model appointment time zones. Dates are displayed according to the browser locale, with date-only records protected against UTC day shifts.

### Relationships and deletion

- Clinic ← doctors and appointments.
- Doctor ← visits, treatment courses, and appointments.
- Diagnosis ← visits and treatments.
- Medication ← treatment courses.
- Treatment course ← visits.
- Visit ← documents, completed appointments, and direct follow-up visits.

Deleting referenced records is **blocked**, with an explanation, except treatments and diagnoses: after confirmation, deleting a treatment removes its references from every visit; deleting a diagnosis removes its references from every visit and treatment. Each deletion is one atomic transaction. Visits, other treatments, and library medications are retained. A parent visit cannot be deleted while follow-up visits still reference it. Visit forms preserve those links; remove dependent follow-up records first if you intend to remove an entire episode. Follow-up links cannot reference the same visit, a missing visit, or another follow-up; hierarchy validation runs within the save/import transaction, including validation of the final merged graph. An initial visit with follow-ups cannot itself become a follow-up. Episode membership is not editable in visit forms; clinical edits preserve the existing relationship. Unlink dependent records first, or keep the directory record for historical context. Reference validation and saves/deletes run in transactions spanning the relevant stores, protecting against deletion races. Clearing the archive is a separate, explicitly confirmed transaction.

The initial migration creates stores and indexes additively. Version 2 separates the medication library from treatment courses. The version-change transaction converts every old medication into a library entry (keeping its ID) and a separate treatment course containing its original dosage, frequency, status, dates, prescriber, instructions, notes, and audit timestamps. Visit medication references become course references, and existing treatments remain linked. Unknown dates stay unknown; dates and courses are never invented from visit dates. Identically named library entries are not automatically combined. Deterministic course IDs make repeated imports of a v1 backup idempotent. Attachments and unrelated records remain intact. Any upgrade failure aborts the entire transaction, leaving the old schema and records in place.

Version 3 adds an optional `parentVisitId` reference and index to visits. Empty or absent parent IDs mean an initial visit. The v2→v3 upgrade adds the index without rewriting stored records or guessing episode membership from names, dates, or visit types. Existing visits typed Follow-up stay visible as initial episodes until explicitly connected. The tree is derived from parent references; no duplicate episode/history store is created.

Version 4 limits episodes to one level of follow-ups. On upgrade from version 3, any deeper follow-ups are relinked directly to their original initial visit. Only those parent references change: clinical details, visit IDs, dates, audit timestamps, treatments, and document links remain intact. Flattening runs in the version-change transaction and rolls back entirely on failure. Cycles or missing parent records are rejected rather than guessed. Version-3 backups are validated against their former hierarchy rules, then flattened before restore; version-4 backups and normal writes reject deeper nesting.

Version 5 removes visit follow-up instructions and review dates, including date reminders and the old date index. Existing values are appended to visit notes with labels during upgrade and legacy backup import; existing notes, links, IDs, and audit timestamps are preserved. Visit notes allow 40,100 characters to retain the combined legacy fields without truncation. Use appointments for planned care and connected visits for completed follow-ups.

Exports use schema 5; imports accept schemas 1 through 5. Version-1 backups are validated against their original schema and relationships before being converted using the same migration. Newer unsupported schemas are rejected. Future schema changes must increment `SCHEMA_VERSION`, preserve records, update backup support, and test earlier supported backups. A database upgrade blocked by another tab is reported; version changes close the old connection and reload that tab.

## Backup format and recovery

Export produces a JSON object with `format: "medly-backup"`, `schemaVersion`, `appVersion`, `exportedAt`, and a `data` object containing every store. Documents replace their `blob` with `base64` only inside the backup. These backups contain readable sensitive medical information; protect the files accordingly.

Before import, Medly validates the JSON envelope, supported schema version, required stores, supported fields, UUIDs, timestamps, field types, date ranges, statuses, duplicate IDs, file size/type/signature, and relationships. Invalid backups do not modify the archive. A review dialog shows record and document counts before applying either mode:

- **Merge:** UUID is the identity. New IDs are added. Matching IDs keep the version with the later `updatedAt`; ties preserve the existing record. Independently created records with different UUIDs remain separate even when their names match.
- **Replace:** the validated backup becomes the whole archive. Requires explicit destructive confirmation.

Imports read the current archive, check final relationships, and write all stores within one transaction. Clearing during replace and writing attachments are part of that transaction. Failure or storage exhaustion aborts the entire operation. Existing records are not erased before validation. Backups up to **250 MiB** can be imported; JSON encoding/decoding temporarily uses extra memory. Keep archives below that backup size for this first version. Very large attachment collections need a future streaming backup format.

If you switch devices/browsers, export first, copy the JSON securely, open Medly on the destination, and import. To undo an unintended edit or deletion, restore an earlier backup. There is no recycle bin or automatic backup.

## Privacy and data-loss risks

Medly makes no analytics, advertising, tracking, cloud-database, or external API calls. Runtime assets are served from the app’s own origin. The service worker caches only the explicitly listed static shell; medical records stay in IndexedDB. File type/signature checks reduce accidental invalid uploads but are not malware scanning.

IndexedDB and JSON backups are **not encrypted**. Local-first storage does not protect records from another person using the same browser profile, a compromised browser/device, or malicious code served from the hosting origin. Use a trusted device and hosting source.

Browser or OS eviction, clearing site data, private browsing cleanup, switching origins, a lost device, or a lost browser profile can make the archive unavailable. Request persistent storage in Settings, but treat regular exported backups as essential. Storage denials, initialization failures, blocked upgrades, transaction failures, and quota errors are surfaced to the user. There is no claim of guaranteed permanent storage.

Cross-tab notifications contain only an invalidation signal, never medical content. Screens refresh after another tab changes data unless a form dialog is open. Each treatment added from a visit saves together with its optional new library medicine and visit link atomically. Cancelling that modal writes nothing. Treatment edits happen on the treatment detail page; confirmed deletion clears all visit references atomically. Diagnoses added from a visit also save atomically with their visit link; cancelling writes nothing. Confirmed diagnosis deletion clears visit and treatment references while retaining those records. Clinical visit edits retain the latest diagnosis and treatment links from storage. Other fields are saved as complete forms; simultaneous edits to the same record are not collaboratively merged. Avoid editing the same record in two tabs at once.

## Offline updates

`sw.js` precaches the explicit application shell under a versioned `medly-shell-*` cache. Increment the cache version whenever changing cached application files. Installation completes only if all required assets cache successfully. The app does not force an update over an active session. In Settings, **Check for app updates**, then **Update & reload** activates a waiting worker. Only caches with Medly’s own prefix are cleaned up; IndexedDB is never cleared by the worker.

## Verification

The browser integration script uses Playwright as a **development-only** tool, outside the runtime. Install it in a temporary directory if needed:

```sh
npm install --prefix /tmp/medly-test-tools playwright
npx --prefix /tmp/medly-test-tools playwright install chromium
# Start the static server separately, then:
MEDLY_PLAYWRIGHT_PATH=/tmp/medly-test-tools/node_modules/playwright node tests/browser.cjs
MEDLY_PLAYWRIGHT_PATH=/tmp/medly-test-tools/node_modules/playwright node tests/care.cjs
MEDLY_PLAYWRIGHT_PATH=/tmp/medly-test-tools/node_modules/playwright node tests/diagnoses.cjs
MEDLY_PLAYWRIGHT_PATH=/tmp/medly-test-tools/node_modules/playwright node tests/followups.cjs
MEDLY_PLAYWRIGHT_PATH=/tmp/medly-test-tools/node_modules/playwright node tests/followup-migration.cjs
```

The script creates an isolated browser context with synthetic records, never touches a user's normal profile, and checks CRUD, persistence, reference safety, multi-record visits, file validation, backups including attachment bytes and maximum-size files, rejected malformed backups, atomic rollback, search, mobile overflow, and offline shell loading. Screenshots go to a temporary directory. `MEDLY_TEST_URL` may override the default `http://127.0.0.1:8080`. Set `MEDLY_BROWSER=chrome` to use an installed Google Chrome instead of Playwright's downloaded Chromium.

The care suite also checks a populated v1 database upgrade to the current schema, all legacy prescription fields and attachments, repeated v1 backup imports, explicit library combination, five historical courses sharing one medicine, reuse with fresh dates, separate visit treatment modals, creation of new medicines and non-medication care, cancellation without orphan records, independent course edits, treatment deletion with atomic visit unlinking, preservation of current links during stale visit edits, duplicate-library prevention, failed treatment/link rollback, current-schema backup round trips, and a failed upgrade that rolls back schema, indexes, and records.

The diagnosis suite checks separate diagnosis creation from visits, hidden diagnosis selectors in visit forms, visit-date defaults, cancellation, independent diagnosis edits, related visit history, mobile layout, atomic save/delete rollback, missing-visit rejection, preservation of current links during stale edits, deletion unlinking visits and treatments, and backup restoration.

The follow-up suite checks a four-follow-up episode with one level of sibling encounters; inline care/documents; hiding follow-ups from the top-level list; searches and date/provider/specialty/type filters that match follow-ups; creation only from an initial visit, no parent selectors, preservation of links during edits; self/cycle/missing-parent/nested-parent rejection; rollback of related care when a link fails; protected parent deletion; read-only episode membership in forms; merge-created cycle rejection; backup round trips; a populated v2 upgrade; and mobile/offline episode history. The follow-up migration suite checks flattening a populated v3 chain into direct follow-ups, preserving every clinical field, timestamp, course and attachment byte, legacy-backup restoration, strict current-schema validation, and migration of retired review dates and instructions into notes (including maximum-length content), removal of reminders and the old index, and atomic rollback of failed v3/v4→v5 upgrades.

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

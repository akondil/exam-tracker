# Sınav Atlası — Exam Atlas

**An offline, Turkish-language desktop application for student assessment and progress reporting.**

**Application language: Turkish. This README and the repository documentation are written in English.**

Created as a **social responsibility project supporting the Guidance and Counseling Service at Cumhuriyet Secondary School**. The project supports school guidance staff and teachers in reviewing exam results and planning student support without a paid analytics platform.

Built with **Electron, Node.js and SQLite**. The application interface, validation messages, student reports and Windows installer are in Turkish. The repository documentation is in English. Imported exam titles, subject names and other source data retain their original wording. Turkish school-list header recognition is intentionally preserved.

## Privacy and the public repository

**This repository contains no real student records.** It starts with an empty database. The three PDF files in `samples/` are generated from deterministic, fictional data: students use labels such as `DEMO 01`, the school is `DEMO SCHOOL`, and no real school results are included. The beneficiary credit above identifies the purpose of the project, not a source of sample records.

Real PDFs, local databases, screenshots of real records, exported reports, CSV files, credentials, build outputs and dependency directories are excluded from this distribution. Run `npm run privacy:check` before committing or publishing. Ignore rules are an additional safeguard; they do not remove files already committed to Git.

Application data stays in a local SQLite database. The application includes no cloud synchronization, analytics or AI service. The database is **not encrypted**; use an appropriately secured device and authorized access. Import actual school records only on an authorized device, never into this repository.

## Select students for batch reports (1.7)

After choosing an exam in **Toplu karne / PDF**, use the student checkboxes to choose exactly whose reports to generate. All matching students are initially selected. **Tümünü seç** selects the full candidate list; **Seçimi temizle** clears the selection.

Search by student name, school number or class. Search only changes the displayed rows; existing selections remain checked even when hidden by the search. The header checkbox selects or deselects the currently visible rows. A live counter shows the selected and available student counts. PDF and print output are disabled when no students are selected.

Only checked students are sent to PDF generation and printing. Question counts, exam-history settings and shared teacher notes are preserved when changing selections. Choosing another exam or reopening the dialog starts a fresh selection for its filtered candidate list.

## Student report presentation (1.6.1)

Single and batch student reports do not display overall, province, district or school rankings. Exam history and progress charts remain available.

## Exam history on student reports (1.6)

Student reports now include an **exam history** table with date, exam title, class, score, total net and per-subject nets. Only results for the same student up to and including the selected exam are shown, in chronological order. The selected exam is highlighted; later results and other students' records are excluded.

A short history fits into the main A4 report. Longer histories, long exam titles or more than six historical subjects use additional numbered A4 sheets. Every available record and subject is retained; absent scores and subjects use a dash. Different subjects such as Social Studies and History are not merged.

History is enabled by default and can be disabled using **Sınav geçmişini karneye ekle** in the single-student report or the equivalent checkbox in batch reports. This option is independent of previous-exam graph comparison. The application remains in Turkish.

Run `npm run test:history-ui` to verify short and long PDFs, changed subjects, individual histories and the option to hide the table using synthetic data only.

## Batch student reports (1.5)

The application remains in Turkish. Open **Öğrenci sonuçları** (Student results), apply the year, school, grade, class or student filters, then choose **Toplu karne / PDF**. Select one exam and review the complete student list: all matching table pages are included.

- **Toplu PDF kaydet** creates one PDF containing the selected students' A4 reports, ordered by class, school number and name. Each student starts on a new page.
- **Toplu yazdır** opens one system print dialog for the complete batch. You can choose the printer, page range and copies there.
- Stored school logos and exam question counts are reused. Optional shared teacher notes apply to every report. Automatic summaries and previous-exam comparisons remain student-specific.
- Unknown question counts remain blank. Counts are validated before output; remembering them checks the entire exam. Missing or mixed-exam selections are rejected.
- Each batch supports up to 1,000 results. Reports with more than six subjects or long content may require additional pages. Large batches may take time to prepare.
- Temporary large-report HTML files use a private temporary directory and are removed when report generation finishes. Actual printer hardware is not exercised by automated tests.

Run `npm run test:batch-ui` to check a 36-student synthetic PDF, an 18-student class filter, cancellation and the print-dialog invocation. Generated reports are not included in this public repository.

## Features

- Import one or several supported school results PDFs after selecting an exam date in **dd/mm/yyyy** format.
- Review all detected students, validation issues, source averages and missing fields before saving.
- Edit identity fields, class, booklet, correct/wrong/blank/net values, source percentages, total scores, rankings and percentiles.
- Keep students without a school number separate. Complete a missing name before importing. Link an existing student only through an explicit selection.
- View dashboards and filter by year, school, exam, grade, class, subject and student.
- Edit saved results and exam information; preserve a local audit trail of manual changes.
- Compare a student's earlier results, add teacher notes and create an A4 PDF report or use the system print dialog.
- Export filtered results and source exam averages to CSV.
- Return from an exam's results to the archive without leaving a temporary exam filter behind.

No PDF-template learning screen, external AI model or Python runtime is required.

## Supported PDF layouts and limitations

The reader supports text-based institution results lists with per-subject correct/wrong/net columns, totals, a score, optional rankings and percentiles, and source averages. It also supports the worksheet layout with D/Y/N/P columns, a class-first identity section and no wrong-answer penalty.

Headers and coordinates are analyzed on each page. Dashes are treated as missing data rather than zero. Social Studies and History remain separate subjects. Inconsistent numeric data or structural errors block import rather than silently dropping rows. Editable rows remain available for correction.

This is not a universal PDF importer. Scanned images, OCR, unrelated layouts, score scales above 500 and individual report-card documents may require further development. Source-summary values without an identified metric are preserved without interpreting them as correct/wrong/net averages. Question counts are not guessed. Source averages and rankings are not silently recalculated when individual results change.

## Language

The application interface, reports, notifications and installer prompts are in **Turkish**. Only the repository documentation is written in **English**. Exam dates use **dd/mm/yyyy**. Imported titles, subject names and student entries are preserved as entered or read from the source document.

Turkish strings used to recognize PDF headers are part of the parser specification. They must remain unchanged for supported Turkish exam lists to work. Parser diagnostics are displayed in Turkish. The application does not use an English translation layer.

## Run locally

Requires Node.js **24 or newer** and npm. Electron supplies the desktop runtime.

```bash
npm ci
npm run check
npm test
npm run privacy:check
npm start
```

The public distribution uses the `org.examatlas.desktop` application ID and the `Sınav Atlası` product name. Its local `sinav-atlasi.sqlite` database is stored in a separate `sinav-atlasi-public` application-data folder. It does not automatically open an existing installation's database.

Use **PDF içe aktar** (Import PDF), select an exam date and choose a sample PDF. Samples are never imported automatically. To try the worksheet sample, complete the highlighted missing name first; the missing school numbers may remain blank.

## Tests and synthetic samples

```bash
npm run samples
npm test
npm run test:ui
npm run privacy:check
```

The sample generator is plain JavaScript and has no dependency on private files. Regeneration is deterministic. Tests cover both supported layouts, missing identities, validation, database persistence, explicit linking, manual editing, archive navigation and Turkish report rendering. The UI test uses a temporary database and only synthetic samples.

On Linux, Electron needs a graphical session. For a headless CI worker, run the UI test under Xvfb. A sandbox override is available **only in the test harness**, via `ATLAS_TEST_NO_SANDBOX=1`; the application itself enables sandboxing and context isolation by default.

## Build installers

```bash
npm run dist:win   # Windows x64 NSIS setup
npm run dist       # Host platform; AppImage when run on Linux
npm run dist:mac -- --arm64 --publish never  # On Apple Silicon macOS
npm run dist:mac -- --x64 --publish never    # On Intel macOS
```

Build artifacts are written to `dist/` and should be uploaded as GitHub Release assets, not committed to source control. The Windows setup uses Turkish prompts. Cross-building Windows on Linux may require Wine and related electron-builder tooling; native Windows CI is preferred.

The workflows in `.github/workflows/` check source changes and build Windows/Linux/macOS release assets when a `v*` tag is pushed. Automated releases are created as **drafts** for review. Version tags must match `package.json`, for example `v1.7.0`. Windows installers are not code-signed. macOS apps use ad-hoc signatures, without an Apple Developer certificate or notarization; Gatekeeper may block them.

### macOS installation

The release workflow is configured to build separate DMGs on native Intel and Apple Silicon runners ([GitHub runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)). Choose `mac-x64.dmg` for Intel or `mac-arm64.dmg` for Apple Silicon (M-series). Open the DMG and drag **Sınav Atlası** into **Applications**. The interface remains Turkish and the database is created empty on first launch.

Build macOS installers on macOS; a Linux build cannot validate the DMG or application launch. Both Mac jobs run the synthetic-data UI smoke test before packaging. Test the downloaded DMG on its target Mac before publishing the draft release. No successful Mac build or device test is claimed until those checks finish.

The current build uses [electron-builder ad-hoc signing](https://www.electron.build/v26/docs/mac/) with hardened runtime disabled to avoid library-validation conflicts with Electron frameworks. It has no Developer ID signature or Apple notarization. See [Apple's guidance for opening apps from unidentified developers](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac) if macOS blocks a trusted download. Developer ID signing and notarization require a separate certificate and credentials configured as GitHub secrets.

## Publishing this folder

This folder is a standalone public source distribution. Do **not** upload its parent workspace: that workspace may contain real school data and private outputs.

Create an empty GitHub repository, then run the following **inside this folder**, replacing the repository URL:

```bash
git init
git add .
git diff --cached --stat
npm run privacy:check
git commit -m "Initial public release of Exam Atlas"
git branch -M main
git remote add origin https://github.com/YOUR-ACCOUNT/exam-atlas.git
git push -u origin main
```

Review the staged files before committing. To prepare release installers after source CI passes:

```bash
git tag v1.7.0
git push origin v1.7.0
```

Review the generated draft release and publish it when ready. Repository hosting and actual release publication require your own GitHub account and repository; this source folder does not create either automatically.

## Contributing and support

See [CONTRIBUTING.md](CONTRIBUTING.md), [PRIVACY.md](PRIVACY.md), [SECURITY.md](SECURITY.md) and [PUBLISHING.md](PUBLISHING.md). Use synthetic data in issues and pull requests. Do not attach student lists, databases, report cards or identifiable screenshots.

## License

[MIT](LICENSE). This is a social responsibility project created for the Guidance and Counseling Service at Cumhuriyet Secondary School and shared for wider educational use.

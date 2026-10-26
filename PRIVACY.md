# Privacy

The public distribution includes source code, generic icons and three synthetic PDFs. No real student name, school number, result, database, exported report or identifiable screenshot is intentionally included.

The demo generator uses labels such as DEMO 01, DEMO SCHOOL, DEMO CITY and DEMO DISTRICT. These values are deliberately fictional. The named beneficiary, Guidance and Counseling Service at Cumhuriyet Secondary School, is a project credit and is not the identity of the demo school.

## Local application data

- Results, source filenames, PDF hashes, source page coordinates and import diagnostics are stored locally in SQLite.
- Manual edits retain previous and new values in a local audit trail. Correcting a field does not erase its previous value from that audit trail.
- Reports, logos and CSV exports selected by the user may contain personal data. Save them outside the repository.
- The database is not encrypted. Device users with access to the file may be able to read it.
- The application does not send exam records to a hosted service or AI model. Dependency installation and release downloads use the network.

School staff are responsible for authorized access, appropriate retention and handling of their own records. Never use real personal data in a public issue, pull request, screenshot or automated test fixture.

## Before sharing a repository or bug report

Run `npm run privacy:check`, inspect the staged Git diff and use only generated demo samples. If a real file was committed previously, adding it to `.gitignore` does not remove the published copy or Git history.

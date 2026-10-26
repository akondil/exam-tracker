# Publishing

1. Publish this standalone folder, not its parent workspace. No Git history has been copied from the private workspace.
2. Install dependencies with `npm ci`; run syntax checks, unit tests, UI tests and `npm run privacy:check`.
3. Review every staged file. Include only source, documentation, generic icons, workflows and the generated demo PDFs. Keep real records, exports, screenshots, databases and credentials out of Git.
4. Create an empty repository in your own GitHub account. Use the commands in README to commit and push this folder.
5. Enable Actions. For private vulnerability reports, enable the repository feature if desired.
6. Push a version tag matching package.json. The release workflow builds Windows and Linux installers and creates a draft GitHub Release. Check workflow results and test an installer on its target operating system before publishing the draft.
7. Publish release notes in English. Explain changes, supported PDF formats, privacy behavior and any remaining limitations.

The workflows use the repository-provided GITHUB_TOKEN with scoped permissions. No personal token, account name, remote repository or private key is bundled. They install dependencies and third-party actions, so review and maintain these dependencies as part of the release process.

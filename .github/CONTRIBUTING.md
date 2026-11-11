# Contributing

Thanks for taking the time 🎉<br />
Bug reports, typo fixes and whole features are all welcome. By joining in, you agree to our [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## Ways to contribute

- 🐛 **Report a bug** - open a [bug report](https://github.com/NotAFlightRisk/tubespotting/issues/new?template=bug_report.yml)
- 💡 **Suggest a feature** - open a [feature request](https://github.com/NotAFlightRisk/tubespotting/issues/new?template=feature_request.yml)
- 📖 **Improve the docs** - typos, unclear wording and missing examples are all fair game
- 🌍 **Translate** - fix a wording that reads oddly, or add a language, see [Translations](#translations)
- 🔧 **Submit a fix** - see below
- 🔒 **Report a vulnerability** - please _don't_ open a public issue, see [SECURITY.md](./SECURITY.md)

---

## Getting started

```bash
git clone git@github.com:NotAFlightRisk/tubespotting.git
cd tubespotting
npm install
npm run dev
```

There's a bit more detail in the [Development](./README.md#development) section of the README.

---

## Pull requests

1. **Open an issue first** for anything non-trivial. Saves you writing code we might not merge.
2. **Fork it**, and branch off `main`. Name it something descriptive, like `fix/timeout-handling`.
3. **Keep it focused.** One logical change per PR, please.
4. **Add tests** covering the new behaviour.
5. **Run `npm run check`, `npm run format:check` and `npm test`** before you push.
6. **Open the PR**, fill in the template, and link the issue it closes.

Dont worry about getting it perfect first time, we're happy to help get it over the line.

---

### Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/), and the release notes are generated from them, so it does matter:

```
feat: add support for custom timeouts
fix: handle empty response from upstream
docs: clarify the deployment steps
```

Types are `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `build`, `ci` and `chore`. Breaking changes get a `!` (like `feat!:`) plus a `BREAKING CHANGE:` footer.

---

### What we look for

- The change does one thing, and does it clearly
- Tests pass, and new behaviour has new tests
- Docs updated if public behaviour changed
- No unrelated reformatting mixed into the diff

---

### Translations

Everything the app says lives in [`src/lib/i18n/messages`](../src/lib/i18n/messages), one file per language, with `en.ts` as the source the rest follow. Line, station and platform names, and TfL's own status text, stay as TfL writes them.

To add a language, copy `en.ts` to `<code>.ts`, translate it, and add the language to `LOCALES` in [`src/lib/i18n/locales.ts`](../src/lib/i18n/locales.ts). Counts take the plural forms your language needs (`one`, `few`, `many`, `other`...), with `#` for the number. `npm run check` and `npm test` will catch a missing key, form or placeholder.

---

## Licensing

By contributing, you agree that your work is licensed under the [MIT License](../LICENSE) that covers this project.

# reactory-communicator-pwa-plugin

Client UI for the Reactory communicator module. Ships as a git submodule of
`reactory-pwa-client` at `src/components/plugins/reactory-communicator`.

## What is here

| Path | Purpose |
|---|---|
| `index.ts` | Plugin entry. Exports `components` (and the same array as `default`). |
| `communicator/graphql.ts` | The `communicator*` documents this plugin calls. |
| `communicator/types.ts` | Types mirroring the server's `CommunicatorEmailTemplate*` shapes. |
| `communicator/hooks/useEmailTemplates.ts` | Scope-filtered list loader. |
| `email-templates/EmailTemplatesPage.tsx` | Read-only list of transactional email templates. |

Registered component: **`communicator.EmailTemplates@1.0.0`**.

## Discovery — nothing to wire up

`src/components/plugins/__index.ts` in the parent client is generated before every
build by `pluginImportFactory.ts`. It imports every directory under
`plugins/` that has an entry point (`index.ts`, `index.tsx`, `index.js`,
`index.jsx` or `package.json`). Adding this directory is enough — there is no
allow-list, and the parent client needed no code change to pick this plugin up.

The generator also **skips** a directory with no entry point and prints why. That
matters here: an uninitialised submodule is an empty directory, and importing it
would fail the whole client build with `TS2307: Cannot find module`.

If the plugin is missing from a fresh clone:

```bash
git submodule update --init --recursive
```

## Editing email templates — why no rich-text editor

Template bodies are stored as **EJS source**, either inline or as a `$ref://`
pointer to a file in the repository. A WYSIWYG editor would normalise `<% %>`
markers and silently corrupt the template, so:

- bodies are edited as source in a code pane;
- preview is computed **server-side** (`communicatorPreviewEmailTemplate`), because
  that is where `$ref://` resolution, the `t()` translator and the tenant scope
  live — a client-side render would show something the recipient will not get;
- a file-backed element is only written after an explicit `detach`, which converts
  the pointer to inline content and records where it came from
  (`props.detachedFromRef`). Without that, saving is refused: forking a shipped
  template for one application should be a deliberate act.

Note that the **wording** of the seeded emails lives in the i18n bundles
(`emails.*` keys), not in the template. Editing a body changes structure and
placeholders; changing the copy is a translation change.

## Roles

The page is registered for `COMMUNICATOR_TEMPLATE_VIEW`,
`COMMUNICATOR_TEMPLATE_ADMIN` and `ADMIN`. The server enforces the same gates, so a
plain `USER` cannot read or write templates even by calling the API directly.

## Development

The parent client resolves `@reactory/client-core/*` through its own TypeScript and
jest configuration, so there is no separate build step and no package.json
dependencies here. Run the parent's tooling:

```bash
# from reactory-pwa-client
bash ./bin/generate.sh reactory local     # regenerate plugins/__index.ts
npx jest --coverage=false --testPathPattern "reactory-communicator"
```

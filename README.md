# tree-sitter-scua

A [tree-sitter](https://tree-sitter.github.io/) grammar for **SCUA**, a Lua-shaped, gradually-typed
scripting language.

It is scoped for **syntax highlighting and structural editing** (Zed, Neovim, …) — not for being a
second source of truth on semantics; the SCUA compiler owns that. The generated parser
(`src/parser.c` and friends) is committed so editors can build the grammar without `tree-sitter-cli`.

## Use in Zed

The SCUA Zed extension references this repository as its grammar source:

```toml
[grammars.scua]
repository = "https://github.com/unabated-games/tree-sitter-scua"
rev = "<commit>"
```

## Layout

- `grammar.js` — the grammar definition.
- `src/` — the generated parser (`parser.c`, `grammar.json`, `node-types.json`, `tree_sitter/` headers).
- `queries/highlights.scm` — highlight queries.

## Regenerating

```sh
npm install
npx tree-sitter generate
```

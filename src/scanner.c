// External scanner for tree-sitter-scua: the one token a regular expression cannot describe.
//
// A block comment `/* … */` nests, as the compiler's lexer reads it (lexer.zig `blockCommentEnd`):
// each `/*` inside one opens a level and each `*/` closes one, and nothing else inside means anything
// (a quote, a backtick or a `--` is just text). Nesting needs a counter, so the comment is scanned here.
// A comment that never closes runs to the end of the file, which the compiler refuses; colouring the rest
// of the file as a comment is how an editor shows that.

#include "tree_sitter/parser.h"

enum TokenType {
  BLOCK_COMMENT,
  // Never produced. The grammar lists it among the text pieces of every string and template, so it is
  // valid exactly when the parser is reading literal text, where a `/*` is text, not a comment.
  IN_LITERAL,
};

void *tree_sitter_scua_external_scanner_create(void) { return NULL; }
void tree_sitter_scua_external_scanner_destroy(void *payload) { (void)payload; }
unsigned tree_sitter_scua_external_scanner_serialize(void *payload, char *buffer) {
  (void)payload;
  (void)buffer;
  return 0;
}
void tree_sitter_scua_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  (void)payload;
  (void)buffer;
  (void)length;
}

static bool is_space(int32_t c) { return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v'; }

bool tree_sitter_scua_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  (void)payload;
  if (!valid_symbols[BLOCK_COMMENT] || valid_symbols[IN_LITERAL]) return false;
  while (is_space(lexer->lookahead)) lexer->advance(lexer, true);
  if (lexer->lookahead != '/') return false;
  lexer->advance(lexer, false);
  if (lexer->lookahead != '*') return false;
  lexer->advance(lexer, false);
  unsigned depth = 1;
  while (depth > 0) {
    if (lexer->eof(lexer)) break; // unclosed: the rest of the file is the comment
    if (lexer->lookahead == '/') {
      lexer->advance(lexer, false);
      if (lexer->lookahead == '*') {
        lexer->advance(lexer, false);
        depth++;
      }
    } else if (lexer->lookahead == '*') {
      lexer->advance(lexer, false);
      if (lexer->lookahead == '/') {
        lexer->advance(lexer, false);
        depth--;
      }
    } else {
      lexer->advance(lexer, false);
    }
  }
  lexer->mark_end(lexer);
  lexer->result_symbol = BLOCK_COMMENT;
  return true;
}

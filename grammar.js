/**
 * tree-sitter grammar for SCUA — a Lua-shaped, gradually-typed scripting language.
 *
 * Scoped for *highlighting and structural editing* (Zed, Neovim, etc.), not for being a second
 * source of truth on semantics — the Zig compiler owns that. It aims to parse the real `examples/`
 * without errors; precedence mirrors the compiler's operator table (design/09).
 */
module.exports = grammar({
  name: 'scua',

  word: $ => $.identifier,

  extras: $ => [/\s/, $.line_comment, $.block_comment],

  // A contract clause's `label:` and a range's `start:` both begin `<ident> :`; and `a:b:c` is ambiguous
  // (range-with-step vs nested range). Either parse highlights identically, so let GLR pick.
  // The pattern-vs-expression ambiguities (`match subj` arms vs indexing/constructor-calls) are resolved
  // structurally by `token.immediate('[')` on indexing, so no GLR conflict is declared for them.
  conflicts: $ => [
    [$.contract_clause, $._expression],
    [$.range],
    [$.select_arm], // a `wait_for(…)` after an arm body could start the next arm or be a statement in it
  ],

  rules: {
    source_file: $ => repeat($._statement),

    // ---- statements ----
    _statement: $ => choice(
      $.let_declaration,
      $.function_declaration,
      $.record_declaration,
      $.interface_declaration,
      $.enum_declaration,
      $.flags_declaration,
      $.contract_declaration,
      $.type_declaration,
      $.handle_declaration,
      $.partition_declaration,
      $.migrate_declaration,
      $.import_declaration,
      $.return_statement,
      $.if_statement,
      $.comptime_if,
      $.while_statement,
      $.for_statement,
      $.do_block,
      $.try_statement,
      $.match_statement,
      $.select_statement,
      $.spawn_block,
      $.log_statement,
      $.break_statement,
      $.tell_statement,
      $.assignment,
      $.expression_statement,
    ),

    // `select  wait_for(Tag) -> … / wait(d) -> … / default -> …  end` (design/12) — a filtered receive.
    select_statement: $ => seq('select', repeat($.select_arm), 'end'),
    select_arm: $ => seq(field('head', choice($.recv_wait, $.timer_wait, 'default')), '->', repeat($._statement)),
    timer_wait: $ => seq('wait', '(', $._expression, ')'),

    // `spawn do … end` (a partition background coroutine, design/12 slice 4) OR `spawn(fn)` (the builtin
    // that starts a scheduler task). `spawn` is a keyword, so both spellings are handled here.
    spawn_block: $ => seq('spawn', choice(
      seq('do', repeat($._statement), 'end'),
      seq('(', commaSep($._expression), ')'),
    )),

    // `enum Name  A  B(int)  C = 27  end` (ADR-0026/0027): payload-free ⇒ int-backed; a variant may carry
    // a positional payload or an explicit discriminant.
    enum_declaration: $ => seq('enum', field('name', $.type_identifier), repeat($.enum_variant), 'end'),
    enum_variant: $ => seq(
      field('name', $.type_identifier),
      optional(choice(seq('(', commaSep($.enum_field), ')'), seq('=', field('value', $._expression)))),
    ),
    // A variant payload field: a bare type (`Patrol(int)`) or a named one (`Chase(target: int)` — names
    // are documentation, matched positionally).
    enum_field: $ => seq(optional(seq(field('name', $.identifier), ':')), field('type', $._type)),

    // `flags Name  A  B  C  end` (research/32): a typed bit-set; each variant is a bare name (bit `1<<i`).
    flags_declaration: $ => seq('flags', field('name', $.type_identifier), repeat($.flags_variant), 'end'),
    flags_variant: $ => field('name', $.type_identifier),

    // `contract Name(p)  <clause>*  end` (ADR-0028): labelled boolean clauses with optional `else "reason"`.
    contract_declaration: $ => seq('contract', field('name', $.type_identifier), $._params, repeat($.contract_clause), 'end'),
    contract_clause: $ => prec.right(seq(
      optional(seq(field('label', $.identifier), ':')),
      field('predicate', $._expression),
      optional(seq('else', field('reason', $.string))),
    )),

    // `import name [as alias]` (M-Modules).
    import_declaration: $ => seq('import', field('name', $.identifier), optional(seq('as', field('alias', $.identifier)))),

    // `comptime if <cond> then … [elseif…] [else…] end` (ADR-0030): compile-time conditional.
    comptime_if: $ => seq(
      'comptime', 'if', field('condition', $._expression), 'then', repeat($._statement),
      repeat(seq('elseif', field('condition', $._expression), 'then', repeat($._statement))),
      optional(seq('else', repeat($._statement))),
      'end',
    ),

    // `trace`/`debug`/`info`/`warn`/`severe` ( message [, fields] ) — a leveled log (ADR-0029).
    log_statement: $ => seq(
      field('level', choice('trace', 'debug', 'info', 'warn', 'severe')),
      '(', commaSep($._expression), ')',
    ),

    let_declaration: $ => seq(
      field('kind', choice('let', 'const')),
      // One name, or several for a multi-binding `let a, b = f()` (ADR-0035). A `: type` applies only to
      // the single-name form; the multi form is untyped.
      commaSep1(field('name', choice($.identifier, $.type_identifier))), // a `const` is conventionally UPPER_CASE
      optional(seq(':', field('type', $._type))),
      '=',
      commaSep1(field('value', $._expression)),
    ),

    function_declaration: $ => seq(
      'fn',
      // The name may be lower- or upper-case: SCUA doesn't reserve casing for functions, and host-API
      // declarations (`--!declare`) routinely use PascalCase native names (raylib's `LoadTexture`).
      field('name', choice($.identifier, $.type_identifier)),
      $._params,
      optional(seq('->', field('return_type', $._return_type))),
      repeat($._statement),
      'end',
    ),

    record_declaration: $ => seq(
      'record',
      field('name', $.type_identifier),
      '{',
      sepTrailing(',', $.record_field),
      '}',
      repeat(seq('where', field('refinement', $._expression), optional(seq('else', $.string)))), // record-level `where` (ADR-0028)
    ),

    record_field: $ => choice(
      seq(field('name', $.identifier), ':', field('type', $._type), optional(seq('=', field('default', $._expression))), optional(seq('where', field('refinement', $._expression)))),
      seq('[', $._type, ']', ':', $._type), // open indexer: [string]: any
    ),

    // `interface Name { fn m(self [, p: T]*) [-> R]  … }` — a structural method contract (design/24).
    interface_declaration: $ => seq(
      'interface',
      field('name', $.type_identifier),
      '{',
      repeat($.interface_method),
      '}',
    ),
    interface_method: $ => seq(
      'fn', field('name', $.identifier),
      '(', 'self', repeat(seq(',', $.identifier, ':', $._type)), ')',
      optional(seq('->', $._return_type)),
      optional(','),
    ),

    type_declaration: $ => seq('type', field('name', $.type_identifier), '=', field('type', $._type)),
    // `handle Name` — an opaque host-resource handle type (ADR-0051), only in `--!declare` files. `handle`
    // is a contextual keyword (keyword extraction keeps it usable as an identifier elsewhere).
    handle_declaration: $ => seq('handle', field('name', $.type_identifier)),

    partition_declaration: $ => seq(
      'partition',
      field('name', $.type_identifier),
      repeat(choice($.state_field, $.handler)),
      'end',
    ),

    state_field: $ => seq('state', field('name', $.identifier), '=', field('value', $._expression)),

    handler: $ => seq(
      field('kind', choice('on', 'ask')),
      field('tag', $.type_identifier),
      $._params,
      repeat($._statement),
      'end',
    ),

    migrate_declaration: $ => seq(
      'migrate',
      field('name', $.type_identifier),
      '(',
      field('param', $.identifier),
      optional(seq(':', $._type)),
      ')',
      optional(seq('->', $._type)),
      repeat($._statement),
      'end',
    ),

    return_statement: $ => prec.right(seq('return', optional(commaSep1($._expression)))),

    if_statement: $ => seq(
      'if', field('condition', $._expression), 'then', repeat($._statement),
      repeat(seq('elseif', field('condition', $._expression), 'then', repeat($._statement))),
      optional(seq('else', repeat($._statement))),
      'end',
    ),

    while_statement: $ => seq('while', field('condition', $._expression), 'do', repeat($._statement), 'end'),

    for_statement: $ => seq(
      'for', commaSep1($.identifier), 'in', field('iterable', $._expression), 'do',
      repeat($._statement), 'end',
    ),

    do_block: $ => seq('do', repeat($._statement), 'end'),

    try_statement: $ => seq(
      'try', repeat($._statement),
      'rescue', field('error', $.identifier), repeat($._statement),
      'end',
    ),

    match_statement: $ => seq('match', field('subject', $._expression), repeat($.match_arm), 'end'),

    match_arm: $ => seq(field('pattern', $._pattern), optional(seq('when', field('guard', $._expression))), '->', $._statement),

    _pattern: $ => choice(
      $.or_pattern,
      $.enum_pattern,
      $.tag_pattern,
      $.array_pattern,
      $.table_pattern,
      $.identifier, // binding or `_`
      $._literal,
    ),

    // `0 | 1 | 2` — alternation (no bindings inside; research/18 slice E).
    or_pattern: $ => prec.left(seq($._pattern, '|', $._pattern)),

    // `Ok(0)`, `Ok(n)`, `Error([a, ..])` — a tag with one or more sub-*patterns* (research/18).
    tag_pattern: $ => seq(field('tag', $.type_identifier), '(', commaSep($._pattern), ')'),

    // `Enum.Variant` / `Enum.Variant(pat)` in a match arm (ADR-0026).
    enum_pattern: $ => seq(field('enum', $.type_identifier), '.', field('variant', $.type_identifier), optional(seq('(', commaSep($._pattern), ')'))),

    // `[a, b]` / `[h, ..t]` / `[..i, last]` — fixed prefix/suffix with an optional rest (research/18).
    array_pattern: $ => seq('[', commaSep(choice($._pattern, $.rest_pattern)), optional(','), ']'),
    rest_pattern: $ => seq('..', optional(field('binding', $.identifier))),

    // `{x, y}` / `{k = pat, ..}` — record/table patterns (research/18).
    table_pattern: $ => seq('{', commaSep(choice($.field_pattern, $.rest_pattern)), optional(','), '}'),
    field_pattern: $ => choice(seq(field('key', $.identifier), '=', $._pattern), field('shorthand', $.identifier)),

    break_statement: _ => 'break',

    // `tell partition.Tag(args)` — fire-and-forget message send. The target is a normal call expression
    // (`partition.Tag(args)`); spelling it out as `expr . Tag ( … )` here would make `$._expression` eat
    // the whole call greedily and leave nothing for the explicit tail.
    tell_statement: $ => seq('tell', $._expression),

    assignment: $ => seq(commaSep1(field('target', $._lvalue)), '=', commaSep1(field('value', $._expression))),

    _lvalue: $ => choice($.identifier, $.field_expression, $.index_expression, $.path_access),

    // Newlines are insignificant in SCUA, so a statement-level expression greedily extends into a
    // binary/postfix continuation (`a` newline `- b` is `a - b`); prefer that over a new statement.
    expression_statement: $ => prec(-1, $._expression),

    _params: $ => seq('(', commaSep(seq($.identifier, optional(seq(':', $._type)))), ')'),

    // ---- expressions ----
    _expression: $ => choice(
      $._literal,
      $.identifier,
      $.type_identifier,
      $.array,
      $.table,
      $.function_expression,
      $.call_expression,
      $.field_expression,
      $.index_expression,
      $.slice_expression,
      $.unary_expression,
      $.binary_expression,
      $.range,
      $.path_access,
      $.try_expression,
      $.ask_expression,
      $.recv_wait,
      $.import_expression,
      $.if_expression,
      $.match_expression,
      $.parenthesized,
    ),

    // `if c then a [elseif c then a]* else b end` as a value (a total conditional — `else` required).
    // Distinct from `if_statement` (whose branches are statement lists); shares the keyword only.
    if_expression: $ => prec(1, seq(
      'if', field('condition', $._expression), 'then', field('consequence', $._expression),
      repeat(seq('elseif', field('condition', $._expression), 'then', field('consequence', $._expression))),
      'else', field('alternative', $._expression), 'end',
    )),

    // `match subj  pat [when g] -> expr  … end` as a value. Each arm body is an expression.
    match_expression: $ => prec(1, seq('match', field('subject', $._expression), repeat($.match_expression_arm), 'end')),

    match_expression_arm: $ => seq(field('pattern', $._pattern), optional(seq('when', field('guard', $._expression))), '->', field('body', $._expression)),

    // `import(spec)` — the dynamic/expression import (design/11 Slice 2b). Higher precedence than a plain
    // call so `import(x)` isn't read as the identifier `import` applied to `x`.
    import_expression: $ => prec(15, seq('import', '(', field('specifier', $._expression), ')')),

    // `wait_for(Tag)` — selective receive as a value (`let p = wait_for(Priority)`); also a select head.
    recv_wait: $ => seq('wait_for', '(', field('tag', $.type_identifier), ')'),

    // The `@` path operator — a read (`root @ "a/b"`) as a value, or a write target in an assignment.
    path_access: $ => prec.left(4, seq($._expression, '@', $._expression)),

    parenthesized: $ => seq('(', $._expression, ')'),

    // `a:b` half-open range / `a:b:step` (ADR-0025). Precedence picked to resolve the `:` shift against
    // trailing-expression constructs (this grammar is for highlighting — exact binding doesn't matter).
    range: $ => prec.left(3, seq(field('start', $._expression), ':', field('end', $._expression), optional(seq(':', field('step', $._expression))))),

    function_expression: $ => seq('fn', $._params, optional(seq('->', $._return_type)), repeat($._statement), 'end'),

    call_expression: $ => prec(14, seq(field('function', $._expression), '(', commaSep($._expression), ')')),

    field_expression: $ => prec(14, seq(field('object', $._expression), '.', field('field', choice($.identifier, $.type_identifier)))),

    // The `[` must be *immediate* (no space) — `arr[i]` indexes, but `match subj` then a new-line `[a,b]`
    // is a pattern arm, not an index. Mirrors the compiler's same-line rule.
    index_expression: $ => prec(14, seq(field('object', $._expression), token.immediate('['), $._expression, ']')),

    slice_expression: $ => prec(14, seq(
      field('object', $._expression), token.immediate('['),
      optional($._expression), ':', optional($._expression), ']',
    )),

    try_expression: $ => prec(14, seq($._expression, '?')),

    // `ask partition.Tag(args) [timeout d]` — request/reply send (a value). Like `tell`, the target is a
    // normal call expression; `prec.right` lets the optional `timeout` clause attach to this `ask`.
    ask_expression: $ => prec.right(seq('ask', $._expression, optional(seq('timeout', $._expression)))),

    unary_expression: $ => prec(13, seq(choice('-', 'not', '~'), $._expression)),

    // Binding tightness as numbers (higher = tighter), mirroring the compiler's operator table.
    binary_expression: $ => choice(
      ...[
        ['**', 12, 'right'],
        ['*', 11], ['/', 11], ['//', 11], ['%', 11],
        ['+', 10], ['-', 10],
        ['<<', 9], ['>>', 9],
        ['&', 8], ['^', 7], ['|', 6],
        ['..', 5],
        ['==', 4], ['!=', 4], ['<', 4], ['<=', 4], ['>', 4], ['>=', 4],
        ['in', 4], ['matches', 4], // membership (ADR-0028) / contract match (ADR-0028 C7)
        ['and', 3], ['or', 2], ['??', 1],
      ].map(([op, p, assoc]) =>
        (assoc === 'right' ? prec.right : prec.left)(p, seq($._expression, op, $._expression))),
    ),

    array: $ => seq('[', sepTrailing(',', $._expression), ']'),

    table: $ => seq('{', sepTrailing(',', $.table_field), '}'),

    table_field: $ => seq(field('name', $.identifier), '=', field('value', $._expression)),

    // ---- types ----
    _type: $ => choice(
      $.type_identifier,
      $.primitive_type,
      $.optional_type,
      $.union_type,
      $.array_type,
      $.table_type,
      $.function_type,
    ),

    // `fn(T, U) -> R` — a first-class function type (M6). The return may be a `(T, U)` tuple (ADR-0035).
    function_type: $ => prec.right(seq('fn', '(', commaSep($._type), ')', optional(seq('->', $._return_type)))),

    // A function's return: a single type, or a `(T, U)` tuple denoting several return values (ADR-0035).
    _return_type: $ => choice($._type, $.tuple_type),
    tuple_type: $ => seq('(', commaSep1($._type), ')'),

    // Sized numeric kinds (f32/i32/u8/u16/u32) and the packed vector kinds (vec2/vec3/vec4) are the element
    // types of unboxed numeric buffers — `{ f32 }`, `{ vec2 }` (ADR-0046). They're valid type names in any
    // type position; listing them here (keyword extraction keeps `vec2(…)` a normal call in expression
    // position) is also what lets the brace/bracket array forms parse, since a `type_identifier` is uppercase.
    primitive_type: _ => choice('number', 'int', 'float', 'decimal', 'big', 'f32', 'i32', 'u8', 'u16', 'u32', 'vec2', 'vec3', 'vec4', 'string', 'bytes', 'key', 'bool', 'boolean', 'any', 'nil'),
    optional_type: $ => prec(2, seq($._type, '?')),
    union_type: $ => prec.left(1, seq($._type, '|', $._type)),
    array_type: $ => choice(seq('{', $._type, '}'), seq('[', $._type, ']')), // both spellings (`[T]` / `{ T }`)
    table_type: $ => seq('{', sepTrailing(',', seq($.identifier, ':', $._type)), '}'),

    // ---- literals ----
    _literal: $ => choice(
      $.duration,
      $.decimal,
      $.float,
      $.integer,
      $.string,
      $.key_lit,
      $.interpolated_string,
      $.path,
      $.boolean,
      $.nil,
    ),

    integer: _ => token(choice(/0x[0-9a-fA-F_]+/, /[0-9][0-9_]*/)),
    float: _ => token(/[0-9][0-9_]*\.[0-9_]+([eE][-+]?[0-9]+)?/),
    decimal: _ => token(/[0-9][0-9_]*(\.[0-9_]+)?d/), // exact fixed-point literal `12.34d` (ADR-0033)
    duration: _ => token(/[0-9][0-9_]*(\.[0-9_]+)?(ms|min|s|h)/),
    boolean: _ => choice('true', 'false'),
    nil: _ => 'nil',

    // The closing delimiters are `token.immediate` so the lexer never skips extras (whitespace/comments)
    // inside a string — otherwise a `--` right after the opening `"` lexes as a line comment.
    string: $ => seq('"', repeat(choice($.escape_sequence, token.immediate(prec(1, /[^"\\]+/)))), token.immediate('"')),

    // An interned `key` literal `$"name"` (ADR-0037). The `"` is `token.immediate` so only `$"` (no space) opens one.
    key_lit: $ => seq('$', token.immediate('"'), repeat(choice($.escape_sequence, token.immediate(prec(1, /[^"\\]+/)))), token.immediate('"')),

    interpolated_string: $ => seq('`', repeat(choice($.escape_sequence, $.interpolation, token.immediate('{{'), token.immediate('}}'), token.immediate(prec(1, /[^`\\{}]+/)))), token.immediate('`')),

    // `{expr}` or `{expr:spec}` — the format spec is the mini-language `[align][0][width][.prec][type]`.
    interpolation: $ => seq('{', $._expression, optional($.format_spec), '}'),
    format_spec: _ => token.immediate(seq(':', /[^}]*/)),

    path: $ => seq('path', token.immediate('"'), repeat(token.immediate(/[^"]+/)), '"'),

    escape_sequence: _ => token.immediate(/\\[nrt0"\\`]/),

    identifier: _ => /[a-z_][A-Za-z0-9_]*/,
    type_identifier: _ => /[A-Z][A-Za-z0-9_]*/,

    // A block comment `--[[ … ]]` wins (higher token precedence, and it's longer when multi-line); a
    // line comment is `--` then the rest of the line — including a bare `--` and an inner `--`.
    block_comment: _ => token(prec(1, seq('--[[', /[^\]]*(\][^\]]+)*\]*/, ']]'))),
    line_comment: _ => token(seq('--', /[^\n]*/)),
  },
});

function commaSep1(rule) { return seq(rule, repeat(seq(',', rule))); }
function commaSep(rule) { return optional(commaSep1(rule)); }
function sepTrailing(sep, rule) { return optional(seq(rule, repeat(seq(sep, rule)), optional(sep))); }

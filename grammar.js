/**
 * tree-sitter grammar for SCUA — a Lua-shaped, gradually-typed scripting language.
 *
 * Scoped for *highlighting and structural editing* (Zed, Neovim, etc.), not for being a second
 * source of truth on semantics — the SCUA compiler owns that. Precedence mirrors the compiler's
 * operator table.
 */
module.exports = grammar({
  name: 'scua',

  word: $ => $.identifier,

  extras: $ => [/\s/, $.line_comment, $.block_comment],

  rules: {
    source_file: $ => repeat($._statement),

    // ---- statements ----
    _statement: $ => choice(
      $.let_declaration,
      $.function_declaration,
      $.record_declaration,
      $.type_declaration,
      $.partition_declaration,
      $.migrate_declaration,
      $.return_statement,
      $.if_statement,
      $.while_statement,
      $.for_statement,
      $.do_block,
      $.try_statement,
      $.match_statement,
      $.break_statement,
      $.tell_statement,
      $.assignment,
      $.expression_statement,
    ),

    let_declaration: $ => seq(
      field('kind', choice('let', 'const')),
      field('name', $.identifier),
      optional(seq(':', field('type', $._type))),
      '=',
      field('value', $._expression),
    ),

    function_declaration: $ => seq(
      'fn',
      field('name', $.identifier),
      $._params,
      optional(seq('->', field('return_type', $._type))),
      repeat($._statement),
      'end',
    ),

    record_declaration: $ => seq(
      'record',
      field('name', $.type_identifier),
      '{',
      sepTrailing(',', $.record_field),
      '}',
    ),

    record_field: $ => choice(
      seq(field('name', $.identifier), ':', field('type', $._type), optional(seq('=', field('default', $._expression)))),
      seq('[', $._type, ']', ':', $._type), // open indexer: [string]: any
    ),

    type_declaration: $ => seq('type', field('name', $.type_identifier), '=', field('type', $._type)),

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

    return_statement: $ => prec.right(seq('return', optional($._expression))),

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

    match_arm: $ => seq(field('pattern', $._pattern), '->', $._statement),

    _pattern: $ => choice(
      $.tag_pattern,
      $.identifier, // binding or `_`
      $._literal,
    ),

    tag_pattern: $ => seq(field('tag', $.type_identifier), '(', field('binding', $.identifier), ')'),

    break_statement: _ => 'break',

    tell_statement: $ => seq('tell', $._expression, '.', $.type_identifier, '(', commaSep($._expression), ')'),

    assignment: $ => seq(field('target', $._lvalue), '=', field('value', $._expression)),

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
      $.path_access,
      $.try_expression,
      $.ask_expression,
      $.parenthesized,
    ),

    // The `@` path operator — a read (`root @ "a/b"`) as a value, or a write target in an assignment.
    path_access: $ => prec.left(4, seq($._expression, '@', $._expression)),

    parenthesized: $ => seq('(', $._expression, ')'),

    function_expression: $ => seq('fn', $._params, optional(seq('->', $._type)), repeat($._statement), 'end'),

    call_expression: $ => prec(14, seq(field('function', $._expression), '(', commaSep($._expression), ')')),

    field_expression: $ => prec(14, seq(field('object', $._expression), '.', field('field', $.identifier))),

    index_expression: $ => prec(14, seq(field('object', $._expression), '[', $._expression, ']')),

    slice_expression: $ => prec(14, seq(
      field('object', $._expression), '[',
      optional($._expression), ':', optional($._expression), ']',
    )),

    try_expression: $ => prec(14, seq($._expression, '?')),

    ask_expression: $ => seq('ask', $._expression, '.', $.type_identifier, '(', commaSep($._expression), ')', optional(seq('timeout', $._expression))),

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
    ),

    primitive_type: _ => choice('number', 'int', 'float', 'string', 'bool', 'boolean', 'any', 'nil'),
    optional_type: $ => prec(2, seq($._type, '?')),
    union_type: $ => prec.left(1, seq($._type, '|', $._type)),
    array_type: $ => seq('{', $._type, '}'),
    table_type: $ => seq('{', sepTrailing(',', seq($.identifier, ':', $._type)), '}'),

    // ---- literals ----
    _literal: $ => choice(
      $.duration,
      $.float,
      $.integer,
      $.string,
      $.interpolated_string,
      $.path,
      $.boolean,
      $.nil,
    ),

    integer: _ => token(choice(/0x[0-9a-fA-F_]+/, /[0-9][0-9_]*/)),
    float: _ => token(/[0-9][0-9_]*\.[0-9_]+([eE][-+]?[0-9]+)?/),
    duration: _ => token(/[0-9][0-9_]*(\.[0-9_]+)?(ms|min|s|h)/),
    boolean: _ => choice('true', 'false'),
    nil: _ => 'nil',

    string: $ => seq('"', repeat(choice($.escape_sequence, token.immediate(/[^"\\]+/))), '"'),

    interpolated_string: $ => seq('`', repeat(choice($.escape_sequence, $.interpolation, token.immediate(/[^`\\{]+/))), '`'),

    interpolation: $ => seq('{', $._expression, '}'),

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

; Highlight queries for SCUA (tree-sitter). Consumed by Zed, Neovim, Helix, etc.

; ---- comments ----
[(line_comment) (block_comment)] @comment

; ---- keywords ----
[
  "if" "then" "elseif" "else"
  "while" "do" "end" "for" "in"
  "return" "match" "try" "rescue"
  "on" "ask" "tell" "state"
  "comptime" "import" "as" "where"
] @keyword
(break_statement) @keyword

["and" "or" "not" "matches"] @keyword.operator

; log-level statement keywords (ADR-0029)
["trace" "debug" "info" "warn" "severe"] @keyword

["let" "const"] @keyword

["fn" "record" "enum" "contract" "type" "partition" "migrate"] @keyword

; ---- literals ----
[(integer) (float) (decimal) (duration)] @number
(boolean) @constant.builtin
(nil) @constant.builtin
[(string) (path) (key_lit)] @string
(interpolated_string) @string
(escape_sequence) @string.escape
(format_spec) @string.special

; interpolation braces + the embedded expression read normally
(interpolation ["{" "}"] @punctuation.special)

; ---- types ----
(primitive_type) @type.builtin
(type_identifier) @type

; ---- declarations ----
(function_declaration name: (identifier) @function)
(function_expression) @function
(record_declaration name: (type_identifier) @type)
(enum_declaration name: (type_identifier) @type)
(enum_variant name: (type_identifier) @constructor)
(enum_field name: (identifier) @property) ; named payload field (documentation; matched positionally)
(let_declaration name: (type_identifier) @constant) ; an UPPER_CASE `const NAME` binding
(contract_declaration name: (type_identifier) @type)
(contract_clause label: (identifier) @property)
(type_declaration name: (type_identifier) @type)
(partition_declaration name: (type_identifier) @type)
(migrate_declaration name: (type_identifier) @type)
(import_declaration name: (identifier) @namespace)
(import_declaration alias: (identifier) @namespace)

; ---- fields & calls ----
(record_field name: (identifier) @property)
(table_field name: (identifier) @property)
(field_expression field: (identifier) @property)
(field_expression field: (type_identifier) @constructor) ; Enum.Variant access
(enum_pattern enum: (type_identifier) @type variant: (type_identifier) @constructor)
(call_expression function: (identifier) @function.call)
(call_expression function: (type_identifier) @constructor) ; Ok(), Error(), Player(), tags
; a called member is a method, not a plain property: `rand.int(...)`, `str.trim(...)`, `list.map(...)`
(call_expression function: (field_expression field: (identifier) @function.method))
(tag_pattern tag: (type_identifier) @constructor)

; ---- parameters & variables ----
(identifier) @variable

; ---- operators & punctuation ----
[
  "+" "-" "*" "/" "//" "%" "**"
  "==" "!=" "<" "<=" ">" ">="
  "and" "or" "not"
  "&" "|" "^" "~" "<<" ">>"
  ".." "??" "@" "?" "->" "="
] @operator

[":" "," "."] @punctuation.delimiter
["(" ")" "[" "]" "{" "}"] @punctuation.bracket

; built-in / standard functions, highlighted distinctly when called
((call_expression function: (identifier) @function.builtin)
 (#match? @function.builtin "^(print|len|push|pop|remove|contains|slice|range|keys|values|get|set|getStrict|pcall|error|as|spawn|wait|now|dt|coroutine|resume|yield|status|actor|reply|vec2|vec3|vec4|quat|quat_id|quat_axis_angle|mat[234](_id|_translate|_scale|_rotate)?|dot|cross|length|normalize|ms|seconds|minutes|min|max)$"))

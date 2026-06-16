; Highlight queries for SCUA (tree-sitter). Consumed by Zed, Neovim, Helix, etc.

; ---- comments ----
[(line_comment) (block_comment)] @comment

; ---- keywords ----
[
  "if" "then" "elseif" "else"
  "while" "do" "end" "for" "in"
  "return" "match" "try" "rescue"
  "on" "ask" "tell" "state"
] @keyword
(break_statement) @keyword

["and" "or" "not"] @keyword.operator

["let" "const"] @keyword

["fn" "record" "type" "partition" "migrate"] @keyword

; ---- literals ----
[(integer) (float) (duration)] @number
(boolean) @constant.builtin
(nil) @constant.builtin
[(string) (path)] @string
(interpolated_string) @string
(escape_sequence) @string.escape

; interpolation braces + the embedded expression read normally
(interpolation ["{" "}"] @punctuation.special)

; ---- types ----
(primitive_type) @type.builtin
(type_identifier) @type

; ---- declarations ----
(function_declaration name: (identifier) @function)
(function_expression) @function
(record_declaration name: (type_identifier) @type)
(type_declaration name: (type_identifier) @type)
(partition_declaration name: (type_identifier) @type)
(migrate_declaration name: (type_identifier) @type)

; ---- fields & calls ----
(record_field name: (identifier) @property)
(table_field name: (identifier) @property)
(field_expression field: (identifier) @property)
(call_expression function: (identifier) @function.call)
(call_expression function: (type_identifier) @constructor) ; Ok(), Error(), Player(), tags
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

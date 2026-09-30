; Indent queries for SCUA. Uses the @indent/@outdent captures that Zed and Helix read.

[
  (function_declaration)
  (function_expression)
  (record_declaration)
  (partition_declaration)
  (migrate_declaration)
  (handler)
  (if_statement)
  (while_statement)
  (for_statement)
  (do_block)
  (try_statement)
  (match_statement)
  (match_expression)
  (table)
  (array)
] @indent

["end" "}" "]" ")"] @outdent

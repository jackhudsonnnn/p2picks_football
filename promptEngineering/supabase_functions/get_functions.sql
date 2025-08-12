SELECT
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS function_definition
FROM
  pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE
  n.nspname = 'public';
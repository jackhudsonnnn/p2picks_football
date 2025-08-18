SELECT
  event_object_schema AS table_schema,
  event_object_table AS table_name,
  trigger_schema,
  trigger_name,
  string_agg(event_manipulation, ',') AS event,
  action_timing AS activation,
  action_condition AS condition,
  action_statement AS definition
FROM
  information_schema.triggers
GROUP BY
  1, 2, 3, 4, 6, 7, 8
ORDER BY
  table_schema,
  table_name;
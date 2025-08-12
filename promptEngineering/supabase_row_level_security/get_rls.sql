select
  c.relname as table_name,
  p.polname as policy_name,
  case p.polcmd
    when 'r' then 'SELECT'
    when 'a' then 'INSERT'
    when 'w' then 'UPDATE'
    when 'd' then 'DELETE'
    when '*' then 'ALL'
  end as command,
  pg_get_expr(p.polqual, c.oid) as using_expression,
  pg_get_expr(p.polwithcheck, c.oid) as check_expression
from pg_policy p
join pg_class c on c.oid = p.polrelid
left join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
order by c.relname, p.polname;
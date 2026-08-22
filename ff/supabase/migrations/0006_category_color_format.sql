-- One format for `flowfinance_categories.color`.
--
-- The column shipped with `default 'slate'` — a palette token — while the app
-- only ever writes hex (`#64748b`), so the same column could hold either
-- depending on who inserted the row, and the reader papered over it with a
-- fallback. Hex is the format every consumer (chips, charts, the picker)
-- actually needs, so the token spellings are converted and the defaults are
-- brought in line with what the app sends.

update flowfinance_categories set color = case color
  when 'red'     then '#ef4444'
  when 'rose'    then '#f43f5e'
  when 'orange'  then '#f97316'
  when 'yellow'  then '#eab308'
  when 'green'   then '#22c55e'
  when 'emerald' then '#10b981'
  when 'blue'    then '#3b82f6'
  when 'indigo'  then '#6366f1'
  when 'purple'  then '#a855f7'
  when 'pink'    then '#ec4899'
  when 'slate'   then '#64748b'
  else color
end
where color !~ '^#[0-9a-fA-F]{6}$';

alter table flowfinance_categories alter column color set default '#64748b';
alter table flowfinance_categories alter column icon  set default '💰';

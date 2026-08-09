-- Stricter school label matching (prevents "any NYU program" / false positives).

create or replace function public._school_normalize(t text)
returns text
language sql
immutable
as $$
  select trim(both ' ' from regexp_replace(
    regexp_replace(
      regexp_replace(lower(trim(coalesce(t, ''))), '\m(in|at|the|of)\M', ' ', 'g'),
      '[^a-z0-9]+',
      ' ',
      'g'
    ),
    '\s+',
    ' ',
    'g'
  ));
$$;

create or replace function public._school_label_matches(candidate text, needle text)
returns boolean
language plpgsql
immutable
as $$
declare
  a text := public._school_normalize(candidate);
  b text := public._school_normalize(needle);
  a_tokens text[];
  b_tokens text[];
  shorter text[];
  longer text;
  tok text;
begin
  if a is null or b is null or length(a) = 0 or length(b) = 0 then
    return false;
  end if;
  if a = b then
    return true;
  end if;

  a_tokens := regexp_split_to_array(a, '\s+');
  b_tokens := regexp_split_to_array(b, '\s+');
  -- drop tiny tokens
  a_tokens := array(select t from unnest(a_tokens) t where length(t) > 1);
  b_tokens := array(select t from unnest(b_tokens) t where length(t) > 1);

  -- Multi-word: every token of the shorter side must appear in the longer string
  if coalesce(array_length(a_tokens, 1), 0) >= 2
     and coalesce(array_length(b_tokens, 1), 0) >= 2 then
    if array_length(a_tokens, 1) <= array_length(b_tokens, 1) then
      shorter := a_tokens;
      longer := b;
    else
      shorter := b_tokens;
      longer := a;
    end if;
    foreach tok in array shorter loop
      if position(tok in longer) = 0 then
        return false;
      end if;
    end loop;
    return true;
  end if;

  -- Single-token alias (Duke, UCLA, NYU) against a longer name
  if coalesce(array_length(a_tokens, 1), 0) = 1 and length(a_tokens[1]) >= 3 then
    if b_tokens[1] = a_tokens[1] then return true; end if;
    if coalesce(array_length(b_tokens, 1), 0) >= 2 and position(a_tokens[1] in b) > 0 then
      return true;
    end if;
  end if;
  if coalesce(array_length(b_tokens, 1), 0) = 1 and length(b_tokens[1]) >= 3 then
    if a_tokens[1] = b_tokens[1] then return true; end if;
    if coalesce(array_length(a_tokens, 1), 0) >= 2 and position(b_tokens[1] in a) > 0 then
      return true;
    end if;
  end if;

  -- Long substring only (avoid short accidental hits)
  if length(a) >= 8 and position(a in b) > 0 then return true; end if;
  if length(b) >= 8 and position(b in a) > 0 then return true; end if;

  return false;
end;
$$;

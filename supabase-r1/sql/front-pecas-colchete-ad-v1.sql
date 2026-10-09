-- Joyce (09/10/2026, "o nome do criativo não está no padrão"): nomes com o colchete do AD aberto, como
-- "[RGV][PER][VD][AD01[24092026]_AD01", passam a seguir o padrão ("[AD01][24092026]") e viram a peça "VD AD01".
create or replace function rgv.peca_chave(p_ad_name text) returns text language sql immutable set search_path to '' as $function$
select nullif(
  regexp_replace(
  regexp_replace(
  regexp_replace(
  regexp_replace(
    upper(regexp_replace(trim(coalesce(p_ad_name,'')), '\s+', ' ', 'g')),
    '\[((AD|CAR) ?[0-9]+)\[([0-9]{7,8})\]', '[\1][\3]', 'g'),
    '\s*([—–-]\s*)?(CÓPIA|COPIA|COPY)\s*$', '', 'g'),
    '\s*\.?MP4\s*$', '', 'g'),
    '(\]|\))\s*[_-]?\s*[0-9]?\s*[_-]*$', '\1', 'g'),
  '');
$function$;

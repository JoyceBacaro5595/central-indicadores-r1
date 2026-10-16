-- Aplicada em produção. Só leitura. Substitui a v1 na tela: liga a compra paga ao pedido por e-mail, CPF/CNPJ ou telefone
-- (mesma regra da fila), inclui compra anterior ao pedido e devolve ligado_por e compra_antes.
-- A v1 continua no banco enquanto a produção usar o front antigo.
create or replace function public.recuperacao_compra_detalhe_v2()
returns table(transacao_id text, compra_id text, compra_em timestamp without time zone, aprovado_em timestamp without time zone,
  compra_canal text, compra_produto text, compra_oferta text, compra_cidade text, compra_tipo text, compra_qtd integer,
  compra_valor numeric, compra_cupom text, compra_utm_campaign text, compra_link text, ligado_por text, compra_antes boolean)
language sql security definer set search_path to ''
as $function$
  select identity.exigir('recuperacao');
  select p.transacao_id, b.transacao_id, b.criado_em, b.aprovado_em, b.canal, b.produto_nome, b.oferta_nome, b.cidade_evento,
    b.tipo_ingresso, b.qtd_ingressos::integer, b.valor_bruto, b.cupom, b.utm_campaign, b.link,
    case when b.email_igual then 'e-mail' when b.doc_igual then 'CPF/CNPJ' else 'telefone' end,
    b.criado_em < p.criado_em
  from marts.vw_recuperacao_carrinho p
  join lateral (
    select * from (
      select b.*, g.payload->>'checkout_invoice_url' as link,
        lower(b.email) = lower(p.email) as email_igual,
        (length(regexp_replace(coalesce(p.documento, ''), '\D', '', 'g')) >= 11
          and regexp_replace(coalesce(b.documento, ''), '\D', '', 'g') = regexp_replace(coalesce(p.documento, ''), '\D', '', 'g')) as doc_igual,
        (length(regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g')) >= 10
          and right(regexp_replace(concat(g.payload->'contact'->>'phone_local_code', g.payload->'contact'->>'phone_number'), '\D', '', 'g'), 11)
            = right(regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g'), 11)) as tel_igual
      from marts.mv_ingresso_transacao b
      left join lateral (select payload from raw.guru_transaction g where g.guru_transaction_id = b.transacao_id
                         order by g.source_updated_at desc nulls last limit 1) g on true
      where b.produto_nome = p.produto_nome and b.aprovada and b.transacao_id <> p.transacao_id
    ) x where x.email_igual or x.doc_igual or x.tel_igual
    order by x.criado_em limit 1
  ) b on true
  where p.ja_comprou_depois;
$function$;

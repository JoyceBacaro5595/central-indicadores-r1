-- Detalhe da compra que recuperou (ou substituiu) um pedido do Carrinho: data/hora, cidade, produto, canal, link da fatura na Guru.
-- Aditivo: função nova, só leitura. Não altera view, tabela nem a função recuperacao_origem_compra_v2.
create or replace function public.recuperacao_compra_detalhe_v1()
returns table(transacao_id text, compra_id text, compra_em timestamp without time zone, aprovado_em timestamp without time zone,
  compra_canal text, compra_produto text, compra_oferta text, compra_cidade text, compra_tipo text, compra_qtd integer,
  compra_valor numeric, compra_cupom text, compra_utm_campaign text, compra_link text)
language sql security definer set search_path to ''
as $function$
  select identity.exigir('recuperacao');
  select p.transacao_id, b.transacao_id, b.criado_em, b.aprovado_em, b.canal, b.produto_nome, b.oferta_nome, b.cidade_evento,
    b.tipo_ingresso, b.qtd_ingressos, b.valor_bruto, b.cupom, b.utm_campaign, g.payload->>'checkout_invoice_url'
  from marts.vw_recuperacao_carrinho p
  join lateral (select * from marts.mv_ingresso_transacao b where b.email = p.email and b.produto_nome = p.produto_nome
                and b.aprovada and b.criado_em > p.criado_em order by b.criado_em limit 1) b on true
  left join lateral (select payload from raw.guru_transaction g where g.guru_transaction_id = b.transacao_id
                     order by g.source_updated_at desc nulls last limit 1) g on true
  where p.ja_comprou_depois;
$function$;

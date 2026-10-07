create table config.gerenciador_observacao (
tipo text not null check(tipo in ('parametro','agendamento','limite')),chave text not null,
observacoes text not null default '' check(char_length(observacoes)<=2000),
atualizado_em timestamptz not null default now(),atualizado_por uuid,
primary key(tipo,chave));
alter table config.gerenciador_observacao enable row level security;
revoke all on config.gerenciador_observacao from public,anon,authenticated;
insert into config.gerenciador_observacao(tipo,chave,observacoes) values
('limite','hubspot_historico_lote','Máximo de 50 negócios por lote quando a consulta ao HubSpot inclui histórico de etapas. A API rejeita lotes maiores com erro 400. A rotina utiliza lotes de até 50; editar esta observação não altera o limite técnico.'),
('parametro','guru_tentativas','Máximo de 3 tentativas por chamada, conforme decisão de 06/10/2026. É uma regra operacional cadastrada, não um limite informado pela API.');
create function public.gerenciador_observacoes() returns jsonb language plpgsql security definer set search_path='' as $$
begin
if auth.uid() is null then raise exception 'Login necessário';end if;
perform identity.exigir('gerenciador');
return (select coalesce(jsonb_agg(jsonb_build_object('tipo',tipo,'chave',chave,'observacoes',observacoes)),'[]'::jsonb) from config.gerenciador_observacao);
end $$;
create function public.gerenciador_observacao_salvar(p_tipo text,p_chave text,p_observacoes text) returns jsonb language plpgsql security definer set search_path='' as $$
declare anterior text;
begin
if auth.uid() is null then raise exception 'Login necessário';end if;
perform identity.exigir('gerenciador');
if p_observacoes is null or char_length(p_observacoes)>2000 then raise exception 'Observações: máximo de 2000 caracteres';end if;
if not ((p_tipo='parametro' and exists(select 1 from config.parametro where chave=p_chave))
or (p_tipo='agendamento' and exists(select 1 from config.agendamento where jobname=p_chave))
or (p_tipo='limite' and p_chave='hubspot_historico_lote')) then raise exception 'Ajuste desconhecido';end if;
select observacoes into anterior from config.gerenciador_observacao where tipo=p_tipo and chave=p_chave;
insert into config.gerenciador_observacao(tipo,chave,observacoes,atualizado_por) values(p_tipo,p_chave,p_observacoes,auth.uid())
on conflict(tipo,chave) do update set observacoes=excluded.observacoes,atualizado_por=excluded.atualizado_por,atualizado_em=now();
insert into config.historico(quem,tipo,chave,antes,depois) values(auth.uid(),'observacoes',p_tipo||':'||p_chave,to_jsonb(anterior),to_jsonb(p_observacoes));
return '{"ok":true}'::jsonb;
end $$;
revoke all on function public.gerenciador_observacoes() from public,anon;
revoke all on function public.gerenciador_observacao_salvar(text,text,text) from public,anon;
grant execute on function public.gerenciador_observacoes() to authenticated;
grant execute on function public.gerenciador_observacao_salvar(text,text,text) to authenticated;

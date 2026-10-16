import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Phone, Plus, TriangleAlert } from 'lucide-react';
import { presets } from '@/lib/periodos';
import { r1Rpc } from '@/integrations/r1/client';
import { useAuth } from '@/auth/AuthProvider';
import { Abas, FiltroMulti, PageHeader } from '@/components/shared';
import { ROTA, norm, mesmoEvento } from '@/pages/maquina-vendas/rota';

interface Template { id: string; nome: string; texto: string; ativo: boolean; padrao: boolean; atualizado_em: string }
interface Resumo {
  na_fila: number; valor_na_fila: number; contatados: number; recuperados: number; descartados: number; ja_compraram_depois: number; horas_parametro: number;
  por_cidade: { cidade: string | null; mes_evento: string | null; data_evento: string | null; na_fila: number; valor: number }[] | null;
}
interface Pedido {
  transacao_id: string; status: string; criado_em: string; horas_pendente: number; produto_nome: string; cidade_evento: string | null; mes_evento: string | null;
  tipo_ingresso: string | null; canal: string | null; qtd_ingressos: number; valor_bruto: number; metodo_pagamento: string; parcelas: number | null; cupom: string | null;
  nome_contato: string | null; email: string | null; telefone: string | null; cidade_comprador: string | null; uf_comprador: string | null;
  utm_source: string | null; utm_campaign: string | null; ja_comprou_depois: boolean; situacao: string; observacao: string | null; situacao_em: string | null;
  data_evento: string | null; produto_criado_em: string | null; campanha_id: string | null; anuncio_id: string | null; conta_id: string | null; destino_url: string | null; utm_content: string | null;
}
interface Registro { transacao_id: string; situacao: string | null; observacao: string | null; criado_por_nome: string | null; criado_em: string }
type Situacao = 'pendente' | 'contatado' | 'em_atendimento' | 'sem_resposta' | 'aguardando_retorno' | 'recuperado' | 'descartado' | 'todos';

const num = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR');
interface CompraDetalhe { transacao_id: string; compra_id: string; compra_em: string; aprovado_em: string | null; compra_canal: string | null; compra_produto: string | null; compra_oferta: string | null; compra_cidade: string | null; compra_tipo: string | null; compra_qtd: number | null; compra_valor: number | null; compra_cupom: string | null; compra_utm_campaign: string | null; compra_link: string | null; ligado_por: string | null; compra_antes: boolean | null }
const ORIGEM_ROTULO: Record<string, string> = { social_selling: 'Social Selling', recuperado: 'Recuperado', mesmo_link: 'Comprou mesmo link, sem recuperação', outro_link: 'Comprou com outro link, sem recuperação' };
const brl = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const mesLabel = (d: string | null) => { if (!d) return '—'; const [y, m] = d.split('-'); return `${m}/${y}`; };
/** Data do evento: a cadastrada na Central; sem ela, a da Rota 45. */
const dataDoEvento = (cidade: string | null, mes: string | null, doBanco: string | null) => {
  if (doBanco) return doBanco;
  if (!cidade || !mes) return null;
  return ROTA.cidades.find((c) => mesmoEvento({ cidade, mes_evento: mes }, c))?.data ?? null;
};
const diaMes = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : null);
const diaCompleto = (d: string | null) => (d && d.length === 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');
const TIPOS = [{ k: '', r: 'Todos os ingressos' }, { k: 'comum', r: 'Comum' }, { k: 'vip', r: 'VIP' }, { k: 'mais1', r: 'Mais de 1 ingresso' }];
/* Acima de 24 h, mostra em dias e horas (ex.: 34 h -> 1 dia e 10 h). */
const duracao = (h: number) => {
  const t = Math.max(0, Math.round(h));
  if (t < 24) return `${num(t)} h`;
  const d = Math.floor(t / 24), r = t % 24;
  return `${num(d)} ${d === 1 ? 'dia' : 'dias'}${r ? ` e ${r} h` : ''}`;
};
const batePedidoTipo = (p: { tipo_ingresso: string | null; qtd_ingressos: number }, k: string) => !k || (k === 'mais1' ? (p.qtd_ingressos ?? 0) > 1 : norm(p.tipo_ingresso ?? '') === k);
const linkAnuncio = (p: Pedido) => (p.conta_id && p.anuncio_id ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${p.conta_id}&selected_ad_ids=${p.anuncio_id}` : p.conta_id && p.campanha_id ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${p.conta_id}&selected_campaign_ids=${p.campanha_id}` : null);
/** Horário do pedido (criado_em) vem da base já em Brasília e sem fuso: mostra como está. Datas com fuso (registros do atendimento) são convertidas para Brasília. */
const comFuso = (d: string) => d.endsWith('Z') || /[+-]\d{2}(:?\d{2})?$/.test(d);
const quando = (d: string | null) => {
  if (!d) return '—';
  if (!comFuso(d)) return `${d.slice(8, 10)}/${d.slice(5, 7)}, ${d.slice(11, 16)}`;
  return new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};
const STATUS: Record<string, string> = { expired: 'Expirada', canceled: 'Cancelada', abandoned: 'Abandonada', waiting_payment: 'Ag. pagamento', recovering: 'Em recuperação', unpaid: 'Não paga' };
const PAG: Record<string, string> = { pix: 'Pix', credit_card: 'Cartão', billet: 'Boleto', free: 'Gratuito' };
const SIT: Record<string, string> = { pendente: 'Não contatado', contatado: 'Mensagem enviada', em_atendimento: 'Em atendimento', aguardando_retorno: 'Aguardando retorno', sem_resposta: 'Sem resposta', recuperado: 'Recuperado', descartado: 'Sem Interesse' };
/** Opções do seletor do atendente (em_atendimento ficou só para registros antigos). */
const OPCOES = ['pendente', 'contatado', 'aguardando_retorno', 'sem_resposta', 'recuperado', 'descartado'];
const SITUACOES: { k: Situacao; r: string }[] = [{ k: 'pendente', r: 'Não contatados' }, { k: 'contatado', r: 'Mensagem enviada' }, { k: 'aguardando_retorno', r: 'Aguardando retorno' }, { k: 'sem_resposta', r: 'Sem resposta' }, { k: 'recuperado', r: 'Recuperados' }, { k: 'descartado', r: 'Sem Interesse' }, { k: 'todos', r: 'Todos' }];

const tel = (t: string | null) => (t ? t.replace(/\D/g, '') : '');
const MSG_PADRAO = 'Olá, {nome}! Sou {atendente} do Grupo R1. Vi que você iniciou a compra do ingresso do evento {evento} e o pagamento não foi concluído. Posso te ajudar a finalizar?';
const VARIAVEIS = ['{nome}', '{atendente}', '{evento}', '{produto}', '{cidade}', '{valor}'];
const eventoDe = (p: Pedido) => (p.cidade_evento ? `${p.cidade_evento}${p.mes_evento ? ` (${mesLabel(p.mes_evento)})` : ''}` : p.produto_nome ?? '');
const preencher = (texto: string, p: Pedido, atendente: string) => texto
  .replace(/\{atendente\}/g, atendente)
  .replace(/\{evento\}/g, eventoDe(p))
  .replace(/\{nome\}/g, (p.nome_contato ?? '').split(' ')[0] || 'tudo bem')
  .replace(/\{produto\}/g, p.produto_nome ?? '')
  .replace(/\{cidade\}/g, p.cidade_evento ?? '')
  .replace(/\{valor\}/g, brl(p.valor_bruto));
const whats = (p: Pedido, texto: string, atendente: string) => {
  const d = tel(p.telefone); if (!d) return null;
  const n = d.startsWith('55') ? d : `55${d}`;
  return `https://wa.me/${n}?text=${encodeURIComponent(preencher(texto, p, atendente))}`;
};

function csv(l: Pedido[]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const cab = ['pedido', 'criado_em', 'horas_pendente', 'status', 'produto', 'cidade', 'data_evento', 'tipo', 'canal', 'qtd', 'valor', 'pagamento', 'nome', 'email', 'telefone', 'cidade_comprador', 'uf', 'utm_source', 'utm_campaign', 'situacao', 'observacao'];
  const corpo = l.map((p) => [p.transacao_id, p.criado_em, p.horas_pendente, STATUS[p.status] ?? p.status, p.produto_nome, p.cidade_evento, dataDoEvento(p.cidade_evento, p.mes_evento, p.data_evento), p.tipo_ingresso, p.canal, p.qtd_ingressos, p.valor_bruto, PAG[p.metodo_pagamento] ?? p.metodo_pagamento, p.nome_contato, p.email, p.telefone, p.cidade_comprador, p.uf_comprador, p.utm_source, p.utm_campaign, SIT[p.situacao] ?? p.situacao, p.observacao].map(esc).join(';'));
  return '﻿' + [cab.join(';'), ...corpo].join('\n');
}

/* Filtros lembrados no navegador (sobrevivem a recarregar a página). Período em atalho é recalculado a cada abertura. */
const PREF_KEY = 'central.recuperacao.filtros';
type Pref = { situacao?: string; cidade?: string | string[]; tipo?: string | string[]; recomprados?: boolean; periodo?: string; de?: string; ate?: string; porPagina?: number };
const comoLista = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : []);
const lerPref = (): Pref => { try { return JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as Pref; } catch { return {}; } };
const periodoInicial = (pref: Pref) => {
  const k = pref.periodo ?? 'todos';
  if (k === 'custom') return { periodo: k, de: pref.de ?? '', ate: pref.ate ?? '' };
  const p = presets().find((x) => x.chave === k);
  return p ? { periodo: k, de: p.de, ate: p.ate } : { periodo: 'todos', de: '', ate: '' };
};

export default function Recuperacao() {
  const { pode, perfil, session } = useAuth();
  const atendente = (perfil?.nome || session?.user.email || '').trim().split(' ')[0] || 'a equipe';
  const qc = useQueryClient();
  const PREF = useMemo(lerPref, []);
  const PERIODO_INICIAL = useMemo(() => periodoInicial(PREF), [PREF]);
  const [situacao, setSituacao] = useState<Situacao>(SITUACOES.some((x) => x.k === PREF.situacao) ? (PREF.situacao as Situacao) : 'pendente');
  const [cidades, setCidades] = useState<string[]>(comoLista(PREF.cidade));
  const [recomprados, setRecomprados] = useState(PREF.recomprados === true);
  const [tipos, setTipos] = useState<string[]>(comoLista(PREF.tipo));
  const [busca, setBusca] = useState('');
  const [de, setDe] = useState(PERIODO_INICIAL.de);
  const [ate, setAte] = useState(PERIODO_INICIAL.ate);
  const [periodo, setPeriodo] = useState(PERIODO_INICIAL.periodo);
  const periodos = useMemo(presets, []);
  const aplicarPeriodo = (chave: string) => {
    setPeriodo(chave);
    if (chave === 'custom') return;
    if (chave === 'todos') { setDe(''); setAte(''); return; }
    const p = periodos.find((x) => x.chave === chave);
    if (p) { setDe(p.de); setAte(p.ate); }
  };
  const [obs, setObs] = useState<Record<string, string>>({});
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [tabelaCompraram, setTabelaCompraram] = useState(false);
  const [errosStatus, setErrosStatus] = useState<Record<string, string>>({});
  /* Linhas que o atendente mexeu ficam na tela (na mesma posição) até trocar de filtro, mesmo saindo da situação filtrada. */
  const [fixos, setFixos] = useState<Record<string, { p: Pedido; i: number }>>({});
  const fixosRef = useRef(fixos);
  fixosRef.current = fixos;
  const [aba, setAba] = useState<'carrinho' | 'resgate' | 'templates'>('carrinho');
  const [tplId, setTplId] = useState('');
  const tpls = useQuery({ queryKey: ['recuperacao-templates'], queryFn: () => r1Rpc<Template[]>('recuperacao_templates_listar'), retry: false });
  const tplAtivos = (tpls.data ?? []).filter((t) => t.ativo);
  const tplEscolhido = tplAtivos.find((t) => t.id === tplId) ?? tplAtivos.find((t) => t.padrao) ?? tplAtivos[0];
  const textoMsg = tplEscolhido?.texto ?? MSG_PADRAO;
  const veDados = pode('dados_pessoais');

  useEffect(() => { setFixos({}); }, [situacao, cidades, recomprados]);
  const [porPagina, setPorPagina] = useState([10, 20, 50, 100].includes(PREF.porPagina ?? 0) ? (PREF.porPagina as number) : 10);
  useEffect(() => { try { localStorage.setItem(PREF_KEY, JSON.stringify({ situacao, cidade: cidades, tipo: tipos, recomprados, periodo, de, ate, porPagina })); } catch { /* sem armazenamento, segue sem lembrar */ } }, [situacao, cidades, tipos, recomprados, periodo, de, ate, porPagina]);
  const [pagina, setPagina] = useState(0);
  useEffect(() => { setPagina(0); }, [situacao, cidades, recomprados, tipos, de, ate, busca, porPagina]);
  const resumo = useQuery({ queryKey: ['recuperacao-resumo', de, ate], queryFn: () => r1Rpc<Resumo[]>('recuperacao_resumo_v2', { p_de: de || null, p_ate: ate || null }).then((r) => r[0]), refetchInterval: 5 * 60_000 });
  const fila = useQuery({ queryKey: ['recuperacao-fila', situacao, '', recomprados], queryFn: () => r1Rpc<Pedido[]>('recuperacao_fila_v2', { p_situacao: situacao, p_cidade: null, p_incluir_recomprados: recomprados }), refetchInterval: 5 * 60_000 });
  const filaTodas = useQuery({ queryKey: ['recuperacao-fila', situacao, '', recomprados], queryFn: () => r1Rpc<Pedido[]>('recuperacao_fila_v2', { p_situacao: situacao, p_cidade: null, p_incluir_recomprados: recomprados }), refetchInterval: 5 * 60_000 });
  const baseCards = useQuery({ queryKey: ['recuperacao-fila', 'todos', '', true], queryFn: () => r1Rpc<Pedido[]>('recuperacao_fila_v2', { p_situacao: 'todos', p_cidade: null, p_incluir_recomprados: true }), refetchInterval: 5 * 60_000 });
  const origens = useQuery({ queryKey: ['recuperacao-origem'], queryFn: () => r1Rpc<{ transacao_id: string; compra_em: string; origem: 'social_selling' | 'recuperado' | 'mesmo_link' | 'outro_link' }[]>('recuperacao_origem_compra_v2'), refetchInterval: 5 * 60_000, retry: false });
  const compras = useQuery({ queryKey: ['recuperacao-compra-detalhe'], queryFn: () => r1Rpc<CompraDetalhe[]>('recuperacao_compra_detalhe_v2'), refetchInterval: 5 * 60_000, retry: false });
  const compraDe = useMemo(() => new Map((compras.data ?? []).map((c) => [c.transacao_id, c])), [compras.data]);
  const cps = useQuery({ queryKey: ['recuperacao-cp'], queryFn: () => r1Rpc<{ transacao_id: string; cp: string | null }[]>('recuperacao_cp_pedido_v1'), refetchInterval: 5 * 60_000, retry: false });
  const cpDe = useMemo(() => new Map((cps.data ?? []).map((c) => [c.transacao_id, c.cp])), [cps.data]);
  const origemDe = useMemo(() => new Map((origens.data ?? []).map((o) => [o.transacao_id, o])), [origens.data]);
  const outras = useQuery({ queryKey: ['recuperacao-outra-cidade'], queryFn: () => r1Rpc<{ transacao_id: string; cidade: string; mes_evento: string | null; data_evento: string | null; compra_em: string }[]>('recuperacao_outra_cidade'), refetchInterval: 5 * 60_000, retry: false });
  const outraCidade = useMemo(() => new Map((outras.data ?? []).map((o) => [o.transacao_id, o])), [outras.data]);
  const [avisoId, setAvisoId] = useState<string | null>(null);
  const historico = useQuery({ queryKey: ['recuperacao-historico'], queryFn: () => r1Rpc<Registro[]>('recuperacao_historico'), refetchInterval: 5 * 60_000, retry: false });
  const porPedido = useMemo(() => { const m = new Map<string, Registro[]>(); for (const r of historico.data ?? []) { const l = m.get(r.transacao_id); if (l) l.push(r); else m.set(r.transacao_id, [r]); } return m; }, [historico.data]);
  const salvarObs = useMutation({
    mutationFn: (v: { id: string; situacao: string; observacao: string }) => r1Rpc('recuperacao_registrar', { p_transacao_id: v.id, p_observacao: v.observacao, p_situacao: v.situacao }),
    onSuccess: (_d, v) => { setFixos((f) => (f[v.id] ? { ...f, [v.id]: { ...f[v.id], p: { ...f[v.id].p, observacao: v.observacao, situacao_em: new Date().toISOString() } } } : f)); setObs((o) => ({ ...o, [v.id]: '' })); qc.invalidateQueries({ queryKey: ['recuperacao-historico'] }); qc.invalidateQueries({ queryKey: ['recuperacao-fila'] }); },
  });
  const marcar = useMutation({
    mutationFn: (v: { id: string; situacao: string; observacao?: string | null }) => r1Rpc('recuperacao_marcar', { p_transacao_id: v.id, p_situacao: v.situacao, p_observacao: v.observacao ?? null }),
    // Troca o status na tela na hora; se o banco recusar, volta ao valor anterior e mostra o motivo
    onMutate: async (v) => {
      setErrosStatus((e) => { const { [v.id]: _, ...resto } = e; return resto; });
      await qc.cancelQueries({ queryKey: ['recuperacao-fila'] });
      const antes = qc.getQueriesData<Pedido[]>({ queryKey: ['recuperacao-fila'] });
      qc.setQueriesData<Pedido[]>({ queryKey: ['recuperacao-fila'] }, (l) => l?.map((p) => (p.transacao_id === v.id ? { ...p, situacao: v.situacao } : p)));
      for (const [, d] of antes) {
        const composta = comFixos(d ?? [], fixosRef.current, (id) => origemDe.has(id));
        const i = composta.findIndex((x) => x.transacao_id === v.id);
        if (i >= 0) { setFixos((f) => ({ ...f, [v.id]: { p: { ...composta[i], situacao: v.situacao, observacao: v.observacao ?? composta[i].observacao, situacao_em: new Date().toISOString() }, i } })); break; }
      }
      return { antes };
    },
    onError: (e, v, ctx) => { setFixos((f) => { const { [v.id]: _, ...resto } = f; return resto; }); ctx?.antes.forEach(([k, d]) => qc.setQueryData(k, d)); setErrosStatus((x) => ({ ...x, [v.id]: (e as Error).message })); },
    onSettled: () => { qc.invalidateQueries({ queryKey: ['recuperacao-fila'] }); qc.invalidateQueries({ queryKey: ['recuperacao-resumo'] }); qc.invalidateQueries({ queryKey: ['recuperacao-historico'] }); },
  });

  /* Mesmos filtros da lista (situação, tipo, período, busca, recomprados), para a lista e para a "Fila por evento" baterem sempre. */
  const filtra = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const dia = (d: string) => (comFuso(d) ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : d.slice(0, 10));
    const qd = q.replace(/\D/g, '');
    return (base: Pedido[]) => {
      const l = base.filter((p) => (tipos.length === 0 || tipos.some((k) => batePedidoTipo(p, k))) && (!de || dia(p.criado_em) >= de) && (!ate || dia(p.criado_em) <= ate));
      return q ? l.filter((p) => [p.nome_contato, p.email, p.produto_nome].some((x) => (x ?? '').toLowerCase().includes(q)) || (qd.length > 0 && tel(p.telefone).includes(qd))) : l;
    };
  }, [busca, de, ate, tipos]);
  const lista = useMemo(() => filtra(comFixos(fila.data ?? [], fixos, (id) => origemDe.has(id))).filter((p) => cidades.length === 0 || cidades.includes(p.cidade_evento ?? '')), [fila.data, fixos, origemDe, filtra, cidades]);
  const porEvento = useMemo(() => {
    const m = new Map<string, { cidade: string | null; mes_evento: string; data_evento: string | null; n: number; valor: number }>();
    for (const p of filtra(filaTodas.data ?? [])) {
      const k = `${p.cidade_evento ?? ''}|${p.mes_evento}`;
      const c = m.get(k) ?? { cidade: p.cidade_evento, mes_evento: p.mes_evento, data_evento: p.data_evento, n: 0, valor: 0 };
      c.n += 1; c.valor += Number(p.valor_bruto) || 0;
      m.set(k, c);
    }
    return Array.from(m.values()).sort((x, y) => y.n - x.n);
  }, [filaTodas.data, filtra]);
  /* Cards do topo: seguem cidade, ingresso, período e busca (a Situação não entra, porque cada card já é uma situação). */
  const cards = useMemo(() => {
    if (baseCards.isLoading || baseCards.isPlaceholderData) return undefined;
    const l = filtra(baseCards.data ?? []).filter((p) => cidades.length === 0 || cidades.includes(p.cidade_evento ?? ''));
    const soma = (x: Pedido[]) => x.reduce((acc, p) => acc + (Number(p.valor_bruto) || 0), 0);
    const mk = (x: Pedido[]) => ({ n: x.length, valor: soma(x), pct: l.length ? (x.length / l.length) * 100 : 0 });
    return {
      total: l.length,
      na_fila: mk(l.filter((p) => p.situacao === 'pendente' && !p.ja_comprou_depois)),
      contatados: mk(l.filter((p) => ['contatado', 'em_atendimento', 'sem_resposta', 'aguardando_retorno'].includes(p.situacao))),
      recuperados: mk(l.filter((p) => p.situacao === 'recuperado')),
      descartados: mk(l.filter((p) => p.situacao === 'descartado')),
      ja_compraram_depois: mk(l.filter((p) => p.ja_comprou_depois)),
    };
  }, [baseCards.data, baseCards.isLoading, baseCards.isPlaceholderData, filtra, cidades]);
  /* Pop-up do card "Compraram depois": mesmos filtros dos cards, uma linha por pedido que saiu da fila porque a pessoa já tem compra paga. */
  const compraramLista = useMemo(() => filtra(baseCards.data ?? []).filter((p) => (cidades.length === 0 || cidades.includes(p.cidade_evento ?? '')) && p.ja_comprou_depois), [baseCards.data, filtra, cidades]);
  /* Recuperação por evento: pedidos marcados como Recuperado sobre todos os pedidos do evento (qualquer situação), com os mesmos filtros. */
  const recPorEvento = useMemo(() => {
    const m = new Map<string, { total: number; rec: number }>();
    for (const p of filtra(baseCards.data ?? [])) {
      const k = `${p.cidade_evento ?? ''}|${p.mes_evento}`;
      const c = m.get(k) ?? { total: 0, rec: 0 };
      c.total += 1; if (p.situacao === 'recuperado') c.rec += 1;
      m.set(k, c);
    }
    return m;
  }, [baseCards.data, filtra]);
  const cidades_ = useMemo(() => Array.from(new Set([...(resumo.data?.por_cidade ?? []).map((c) => c.cidade), ...porEvento.map((c) => c.cidade)].filter(Boolean) as string[])).sort(), [resumo.data, porEvento]);

  const baixar = () => {
    const blob = new Blob([csv(lista)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `recuperacao-${situacao}${cidades.length ? `-${cidades.join('+')}` : ''}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const totalPaginas = Math.max(1, Math.ceil(lista.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const r = resumo.isPlaceholderData ? undefined : resumo.data;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        titulo={aba === 'templates' ? 'Templates de mensagem' : aba === 'resgate' ? 'Resgate MDV' : 'Recuperação de carrinho'}
        subtitulo={`Pedidos expirados, cancelados, abandonados ou em recuperação, e aguardando pagamento há mais de ${r?.horas_parametro ?? 1} h · eventos que ainda não aconteceram, com produto cadastrado · todo o período`}
        onAtualizar={() => { resumo.refetch(); fila.refetch(); }}
        atualizando={fila.isFetching}
      />

      <main className="py-6 space-y-6 mx-auto max-w-[1520px] px-4 md:px-8">
        <Abas<'carrinho' | 'resgate' | 'templates'> valor={aba} onChange={setAba} itens={[{ valor: 'carrinho', rotulo: 'Carrinho' }, { valor: 'resgate', rotulo: 'Resgate MDV' }, { valor: 'templates', rotulo: 'Templates' }]} />
        {aba === 'templates' ? (
          <Templates lista={tpls.data ?? []} erro={tpls.error as Error | null} carregando={tpls.isLoading} />
        ) : aba === 'resgate' ? (
          <section className="surface p-6 text-sm text-muted-foreground">Resgate MDV: aba criada, o conteúdo será definido em seguida.</section>
        ) : (<>
        {(resumo.error || fila.error) && <div className="surface p-4 text-sm text-red-400">{((resumo.error ?? fila.error) as Error).message}</div>}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="kpi-card"><div className="kpi-label">Não contatados</div><div className="kpi-value mono">{cards ? num(cards.na_fila.n) : '…'}</div>{cards && <div className="text-[11px] text-muted-foreground mt-1">{brl(cards.na_fila.valor)} · {cards.na_fila.pct.toFixed(0)}%</div>}</div>
          <div className="kpi-card"><div className="kpi-label">Em contato</div><div className="kpi-value mono">{cards ? num(cards.contatados.n) : '…'}</div>{cards && <div className="text-[11px] text-muted-foreground mt-1">{brl(cards.contatados.valor)} · {cards.contatados.pct.toFixed(0)}%</div>}</div>
          <div className="kpi-card"><div className="kpi-label">Recuperados</div><div className="kpi-value mono text-emerald-400">{cards ? num(cards.recuperados.n) : '…'}</div>{cards && <div className="text-[11px] text-muted-foreground mt-1">{brl(cards.recuperados.valor)} · {cards.recuperados.pct.toFixed(0)}%</div>}</div>
          <button type="button" onClick={() => setTabelaCompraram(true)} className="kpi-card text-left cursor-pointer hover:bg-secondary/40" aria-haspopup="dialog" title="Ver os pedidos, um por linha"><div className="kpi-label">Compraram depois</div><div className="kpi-value mono">{cards ? num(cards.ja_compraram_depois.n) : '…'}</div>{cards && <div className="text-[11px] text-muted-foreground mt-1">{brl(cards.ja_compraram_depois.valor)} · {cards.ja_compraram_depois.pct.toFixed(0)}%</div>}<div className="text-[10px] text-muted-foreground">já têm compra paga do mesmo produto (e-mail, CPF/CNPJ ou telefone); saem da fila sozinhos. Clique para ver a tabela</div></button>
          <div className="kpi-card"><div className="kpi-label">Sem Interesse</div><div className="kpi-value mono">{cards ? num(cards.descartados.n) : '…'}</div>{cards && <div className="text-[11px] text-muted-foreground mt-1">{brl(cards.descartados.valor)} · {cards.descartados.pct.toFixed(0)}%</div>}</div>
        </div>

        {!filaTodas.isPlaceholderData && porEvento.length > 0 && (
          <section className="surface p-4">
            <span className="section-label">Fila por evento</span>
            <div className="flex flex-wrap gap-2 mt-3">
              {porEvento.map((c) => (
                <button key={`${c.cidade}-${c.mes_evento}`} onClick={() => setCidades((l) => (l.includes(c.cidade ?? '') ? l.filter((x) => x !== c.cidade) : [...l, c.cidade ?? '']))} className={`text-left px-3 py-2 rounded-lg text-xs ${cidades.includes(c.cidade ?? '') ? 'bg-primary/15 text-primary' : 'bg-secondary hover:bg-secondary/70'}`}>
                  <div className="font-semibold">{c.cidade ?? 'Sem cidade'} <span className="text-muted-foreground font-normal">{diaMes(dataDoEvento(c.cidade, c.mes_evento, c.data_evento)) ?? mesLabel(c.mes_evento)}</span></div>
                  <div className="mono">{num(c.n)} · {brl(c.valor)} · {(() => { const t = recPorEvento.get(`${c.cidade ?? ''}|${c.mes_evento}`)?.total ?? 0; return t ? ((c.n / t) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : 0; })()}%</div>
                  {(() => { const r2 = recPorEvento.get(`${c.cidade ?? ''}|${c.mes_evento}`); const pct = r2 && r2.total ? ((r2.rec / r2.total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '0'; return <div className="text-[10px] text-emerald-400 mt-0.5">Recuperados: {num(r2?.rec ?? 0)} · {pct}% dos {num(r2?.total ?? 0)} pedidos</div>; })()}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="surface p-4 overflow-x-auto">
          <div className="flex flex-col gap-2">
            <span className="section-label">Pedidos</span>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">Situação
                <select value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)} className="bg-secondary rounded px-2 py-1 text-xs font-semibold text-foreground" title="Filtrar por situação" aria-label="Filtrar por situação">
                {SITUACOES.map((s) => <option key={s.k} value={s.k}>{s.r}</option>)}
                </select>
                </label>
                <FiltroMulti rotulo="Cidade" opcoes={cidades_.map((c) => ({ valor: c, rotulo: c }))} valor={cidades} onChange={setCidades} />
                <FiltroMulti rotulo="Ingresso" opcoes={TIPOS.filter((t) => t.k).map((t) => ({ valor: t.k, rotulo: t.r }))} valor={tipos} onChange={setTipos} />
                <select aria-label="Período" title="Período" value={periodo} onChange={(e) => aplicarPeriodo(e.target.value)} className="bg-secondary rounded px-2 py-1 text-xs font-semibold text-foreground">
                <option value="custom">Personalizado</option>
                {periodos.map((p) => <option key={p.chave} value={p.chave}>{p.rotulo}</option>)}
                </select>
                {periodo === 'custom' && <>
                <label className="text-[11px] text-muted-foreground flex items-center gap-1">De <input type="date" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} className="bg-secondary rounded px-2 py-1 text-xs text-foreground" /></label>
                <label className="text-[11px] text-muted-foreground flex items-center gap-1">Até <input type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} className="bg-secondary rounded px-2 py-1 text-xs text-foreground" /></label>
                </>}
              </div>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, e-mail, telefone, produto" className="bg-secondary rounded px-2 py-1 text-xs text-foreground w-full md:w-72" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
              {tplAtivos.length > 0 && <select value={tplEscolhido?.id ?? ''} onChange={(e) => setTplId(e.target.value)} className="bg-secondary rounded px-2 py-1 text-xs text-foreground" title="Mensagem enviada pelo botão WhatsApp">{tplAtivos.map((t) => <option key={t.id} value={t.id}>Mensagem: {t.nome}</option>)}</select>}
              <button onClick={() => setAba('templates')} className="flex items-center justify-center w-7 h-7 rounded bg-secondary text-foreground hover:bg-secondary/70" title="Cadastrar template de mensagem" aria-label="Cadastrar template de mensagem"><Plus className="w-4 h-4" /></button>
              <button onClick={baixar} disabled={!lista.length} className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-secondary text-foreground disabled:opacity-50"><Download className="w-3.5 h-3.5" /> CSV</button>
              </div>
              <label className="text-[11px] text-muted-foreground flex items-center gap-1"><input type="checkbox" checked={recomprados} onChange={(e) => setRecomprados(e.target.checked)} /> incluir quem já comprou depois</label>
            </div>
          </div>
          {!veDados && <p className="text-xs text-muted-foreground mt-3">Seu perfil vê a fila com nome e e-mail mascarados e sem telefone (recurso "dados pessoais").</p>}
          <table className="w-full text-xs">
            <thead><tr className="text-muted-foreground text-left">
              <th className="pb-2 font-semibold">Pedido</th><th className="pb-2 font-semibold">Comprador</th><th className="pb-2 font-semibold">Evento</th><th className="pb-2 font-semibold">Tipo de ingresso</th><th className="pb-2 font-semibold text-right">Valor</th><th className="pb-2 font-semibold">Pagamento</th><th className="pb-2 font-semibold">Origem</th><th className="pb-2 font-semibold">Situação</th><th className="pb-2 font-semibold">Ações</th>
            </tr></thead>
            <tbody>
              {(fila.isLoading || fila.isPlaceholderData) && <tr><td colSpan={9} className="py-3 text-muted-foreground" role="status">Carregando os pedidos deste filtro…</td></tr>}
              {!fila.isLoading && !fila.isPlaceholderData && lista.length === 0 && <tr><td colSpan={9} className="py-3 text-muted-foreground">Nenhum pedido nesta situação e período.</td></tr>}
              {(fila.isPlaceholderData ? [] : lista.slice(paginaAtual * porPagina, (paginaAtual + 1) * porPagina)).map((p) => {
                const w = veDados ? whats(p, textoMsg, atendente) : null;
                return (
                  <tr key={p.transacao_id} className={`border-t border-border align-top ${p.ja_comprou_depois ? 'opacity-60' : ''}`}>
                    <td className="py-2"><div className="mono text-foreground">{quando(p.criado_em)}</div><div className="text-muted-foreground">{STATUS[p.status] ?? p.status} · há {duracao(p.horas_pendente)}</div></td>
                    <td className="py-2"><div className="font-semibold text-foreground flex items-center gap-1.5">{p.nome_contato ?? '—'}{outraCidade.has(p.transacao_id) && <button onClick={() => setAvisoId(avisoId === p.transacao_id ? null : p.transacao_id)} className="text-amber-400 hover:text-amber-300" title="Comprou ingresso em outra cidade" aria-label="Comprou ingresso em outra cidade"><TriangleAlert className="w-3.5 h-3.5" /></button>}</div>{avisoId === p.transacao_id && outraCidade.get(p.transacao_id) && (() => { const o = outraCidade.get(p.transacao_id)!; const dt = diaMes(dataDoEvento(o.cidade, o.mes_evento, o.data_evento)); return <div className="mt-1 mb-1 rounded bg-amber-500/10 text-amber-300 px-2 py-1 text-[11px]" role="status">Comprou ingresso em outra cidade: {o.cidade}{dt ? ` (${dt})` : ''}, em {quando(o.compra_em)}.</div>; })()}<div className="mono">{p.email ?? '—'}</div>{p.telefone && <div className="mono">{p.telefone}</div>}{(p.cidade_comprador || p.uf_comprador) && <div className="text-muted-foreground">{[p.cidade_comprador, p.uf_comprador].filter(Boolean).join(' / ')}</div>}</td>
                    <td className="py-2"><div className="text-foreground">{p.cidade_evento ?? '—'}</div><div className="text-muted-foreground">{diaCompleto(dataDoEvento(p.cidade_evento, p.mes_evento, p.data_evento)) !== '—' ? `Evento em ${diaCompleto(dataDoEvento(p.cidade_evento, p.mes_evento, p.data_evento))}` : mesLabel(p.mes_evento)}</div><div className="text-muted-foreground truncate max-w-[220px]" title={p.produto_nome}>{p.produto_nome}</div>{p.produto_criado_em && <div className="text-muted-foreground">Produto cadastrado em {diaCompleto(p.produto_criado_em)}</div>}</td>
                    <td className="py-2"><div className="text-foreground">{p.tipo_ingresso ?? '—'}</div><div className="text-muted-foreground">{num(p.qtd_ingressos)} {p.qtd_ingressos === 1 ? 'ingresso' : 'ingressos'}</div>{cpDe.get(p.transacao_id) && <div className="text-[10px] font-bold text-primary mt-0.5" title="Tipo de público (CP) do checkout">{cpDe.get(p.transacao_id)}</div>}</td>
                    <td className="py-2 text-right mono">{brl(p.valor_bruto)}{p.cupom && <div className="text-muted-foreground">cupom {p.cupom}</div>}</td>
                    <td className="py-2">{PAG[p.metodo_pagamento] ?? p.metodo_pagamento}{p.parcelas && p.parcelas > 1 ? ` ${p.parcelas}x` : ''}</td>
                    <td className="py-2 text-muted-foreground">{p.utm_source ?? '—'}{p.utm_campaign && <div className="truncate max-w-[160px]" title={p.utm_campaign}>{p.utm_campaign}</div>}
                      {(p.destino_url || linkAnuncio(p)) && <div className="flex gap-2 mt-1">{p.destino_url && <a href={p.destino_url} target="_blank" rel="noreferrer" className="text-primary font-semibold">Página</a>}{linkAnuncio(p) && <a href={linkAnuncio(p)!} target="_blank" rel="noreferrer" className="text-primary font-semibold">Gerenciador</a>}</div>}</td>
                    <td className="py-2"><span className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${p.situacao === 'recuperado' ? 'bg-sky-500/15 text-sky-400' : p.situacao === 'contatado' ? 'bg-cyan-500/15 text-cyan-400' : p.situacao === 'em_atendimento' ? 'bg-sky-500/15 text-sky-400' : p.situacao === 'aguardando_retorno' ? 'bg-violet-500/15 text-violet-400' : p.situacao === 'sem_resposta' ? 'bg-orange-500/15 text-orange-400' : p.situacao === 'descartado' ? 'bg-secondary text-muted-foreground' : 'bg-amber-500/15 text-amber-400'}`}>{SIT[p.situacao]}</span>{p.ja_comprou_depois && (() => { const o = origemDe.get(p.transacao_id)?.origem; const [txt, cor] = o === 'social_selling' ? ['Social Selling', 'bg-emerald-500/15 text-emerald-400'] : o === 'recuperado' ? ['Recuperado', 'bg-sky-500/15 text-sky-400'] : o === 'outro_link' ? ['Comprou com outro link - Sem recuperação', 'bg-secondary text-muted-foreground'] : ['Comprou mesmo link - Sem recuperação', 'bg-secondary text-muted-foreground']; return <div className={`text-[10px] mt-1 px-1.5 py-0.5 rounded inline-block ${cor}`}>{txt}</div>; })()}{p.situacao !== 'pendente' && p.situacao_em && <div className="text-[10px] text-muted-foreground mt-1">alterado em {quando(p.situacao_em)}</div>}{p.observacao && <div className="text-muted-foreground mt-1 max-w-[180px]">{p.observacao}</div>}</td>
                    <td className="py-2">
                      <div className="flex flex-col gap-1.5 w-[250px]">
                        <div className="flex items-center gap-1.5">
                          {w && <a href={w} target="_blank" rel="noreferrer" className="shrink-0 flex items-center justify-center w-7 h-7 rounded bg-emerald-500/15 text-emerald-400" title="Abrir WhatsApp" aria-label="Abrir WhatsApp"><Phone className="w-3.5 h-3.5" /></a>}
                          <select value={p.situacao} onChange={(e) => marcar.mutate({ id: p.transacao_id, situacao: e.target.value, observacao: e.target.value === 'pendente' ? null : (obs[p.transacao_id] ?? p.observacao) })} className="bg-secondary rounded px-2 py-1 text-[11px] font-semibold text-foreground" title="Mudar o status do atendimento">
                          {(OPCOES.includes(p.situacao) ? OPCOES : [p.situacao, ...OPCOES]).map((k) => <option key={k} value={k}>{SIT[k]}</option>)}
                        </select>
                          <button onClick={() => setDetalheId(p.transacao_id)} className="px-2 py-1 rounded bg-secondary text-foreground text-[11px] font-semibold" aria-haspopup="dialog">Detalhes{(porPedido.get(p.transacao_id) ?? []).length > 0 ? ` (${(porPedido.get(p.transacao_id) ?? []).length})` : ''}</button>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input value={obs[p.transacao_id] ?? ''} onChange={(e) => setObs({ ...obs, [p.transacao_id]: e.target.value })} placeholder="Observações" className="bg-secondary rounded px-2 py-1 text-[11px] text-foreground min-w-0 flex-1" />
                          <button onClick={() => salvarObs.mutate({ id: p.transacao_id, situacao: p.situacao, observacao: (obs[p.transacao_id] ?? '').trim() })} disabled={!(obs[p.transacao_id] ?? '').trim() || salvarObs.isPending} className="px-2 py-1 rounded bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-50">Salvar</button>
                        </div>
                      </div>
                      {errosStatus[p.transacao_id] && <div className="text-[10px] text-red-400 mt-1">Não consegui salvar o status: {errosStatus[p.transacao_id]}</div>}
                      {salvarObs.isError && salvarObs.variables?.id === p.transacao_id && <div className="text-[10px] text-red-400 mt-1">{(salvarObs.error as Error).message}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {lista.length > 0 && !fila.isPlaceholderData && (
            <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-[11px] text-muted-foreground">
              <span>Mostrando {num(paginaAtual * porPagina + 1)}–{num(Math.min((paginaAtual + 1) * porPagina, lista.length))} de {num(lista.length)} pedidos</span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5">Ver
                  <select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="bg-secondary rounded px-2 py-1 text-xs text-foreground" aria-label="Pedidos por vez">
                    {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select> por vez
                </label>
                <button onClick={() => setPagina(paginaAtual - 1)} disabled={paginaAtual === 0} className="px-2 py-1 rounded bg-secondary text-foreground disabled:opacity-40">Anterior</button>
                <span>Página {paginaAtual + 1} de {totalPaginas}</span>
                <button onClick={() => setPagina(paginaAtual + 1)} disabled={paginaAtual >= totalPaginas - 1} className="px-2 py-1 rounded bg-secondary text-foreground disabled:opacity-40">Próxima</button>
              </div>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-3">Entram na fila pedidos com qualquer forma de pagamento nos status Expirada, Cancelada, Abandonada e Em recuperação assim que acontecem, e Ag. pagamento há mais de {r?.horas_parametro ?? 4} h (prazo editável no Gerenciador, parâmetro "recuperacao_horas"). Quem fez um pedido aprovado depois, com o mesmo e-mail e produto, sai da fila automaticamente. Cortesias, eventos já passados e eventos sem produto cadastrado na Guru não entram. Os links de Página e Gerenciador aparecem quando o pedido traz o anúncio nos parâmetros de origem (UTM). Os pedidos vêm da Guru a cada hora; use "Atualizar período agora" na Central para antecipar.</p>
        </section>
        {(() => {
          const d = detalheId ? (fila.data ?? []).find((x) => x.transacao_id === detalheId) ?? Object.values(fixos).find((f) => f.p.transacao_id === detalheId)?.p : undefined;
          if (!detalheId) return null;
          const hist = [...(porPedido.get(detalheId) ?? [])].sort((a, b) => b.criado_em.localeCompare(a.criado_em));
          return (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setDetalheId(null)} onKeyDown={(e) => { if (e.key === 'Escape') setDetalheId(null); }} role="presentation">
              <div role="dialog" aria-modal="true" aria-label="Detalhes do atendimento" className="surface-elevated rounded-xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 p-4 border-b border-border">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-foreground">Detalhes do atendimento</h3>
                    {d && <p className="text-[11px] text-muted-foreground truncate">{d.nome_contato ?? '—'} · {d.produto_nome}</p>}
                  </div>
                  <button autoFocus onClick={() => setDetalheId(null)} className="px-2 py-1 rounded bg-secondary text-foreground text-[11px] font-semibold shrink-0">Fechar</button>
                </div>
                <div className="p-4 overflow-y-auto space-y-3">
                  {(() => {
                    const c = compraDe.get(detalheId), o = origemDe.get(detalheId);
                    if (!c) return o ? <p className="text-xs text-muted-foreground">Este pedido virou compra ({ORIGEM_ROTULO[o.origem] ?? o.origem}) em {quando(o.compra_em)}. Os detalhes da compra ainda não estão disponíveis.</p> : null;
                    return (
                      <div className="rounded-lg border border-border p-3 text-xs space-y-1">
                        <div className="font-bold text-foreground">Compra realizada{o ? ` · ${ORIGEM_ROTULO[o.origem] ?? o.origem}` : ''}</div>
                        <div className="text-muted-foreground">Comprou em: <span className="mono text-foreground">{quando(c.aprovado_em ?? c.compra_em)}</span>{c.compra_antes != null && ` (${c.compra_antes ? 'antes' : 'depois'} do pedido)`}</div>
                        {c.ligado_por && <div className="text-muted-foreground">Ligado por: <span className="text-foreground">{c.ligado_por}</span></div>}
                        <div className="text-muted-foreground">Cidade: <span className="text-foreground">{c.compra_cidade ?? '—'}</span></div>
                        <div className="text-muted-foreground">Produto: <span className="text-foreground">{c.compra_produto ?? '—'}{c.compra_oferta ? ` · ${c.compra_oferta}` : ''}</span></div>
                        <div className="text-muted-foreground">Ingresso: <span className="text-foreground">{[c.compra_tipo, c.compra_qtd ? `${c.compra_qtd} ingresso${c.compra_qtd > 1 ? 's' : ''}` : null, c.compra_valor != null ? brl(c.compra_valor) : null].filter(Boolean).join(' · ') || '—'}</span></div>
                        <div className="text-muted-foreground">Canal: <span className="text-foreground">{[c.compra_canal, c.compra_cupom ? `cupom ${c.compra_cupom}` : null, c.compra_utm_campaign].filter(Boolean).join(' · ') || '—'}</span></div>
                        {c.compra_link && <a href={c.compra_link} target="_blank" rel="noopener noreferrer" className="inline-block mt-1 px-2 py-1 rounded bg-secondary text-foreground text-[11px] font-semibold">Abrir a venda na Guru</a>}
                      </div>
                    );
                  })()}
                  {hist.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma ação registrada neste pedido.</p>}
                  {hist.map((h, i) => (
                    <div key={i} className="text-xs border-b border-border pb-2 last:border-0">
                      <div className="text-muted-foreground"><span className="mono text-foreground">{quando(h.criado_em)}</span> · Atendente: <span className="text-foreground">{h.criado_por_nome ?? '—'}</span></div>
                      {h.situacao && <div className="text-muted-foreground">Status: <span className="text-foreground">{SIT[h.situacao] ?? h.situacao}</span></div>}
                      <div className="text-muted-foreground">Observação: {h.observacao ? <span className="text-foreground whitespace-pre-wrap">{h.observacao}</span> : '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
        {tabelaCompraram && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setTabelaCompraram(false)} onKeyDown={(e) => { if (e.key === 'Escape') setTabelaCompraram(false); }} role="presentation">
            <div role="dialog" aria-modal="true" aria-label="Pedidos que já compraram" className="surface-elevated rounded-xl w-full max-w-6xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 p-4 border-b border-border">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-foreground">Compraram depois · {num(compraramLista.length)} pedidos</h3>
                  <p className="text-[11px] text-muted-foreground">Cada linha é um pedido da recuperação cuja pessoa já tem compra paga do mesmo produto.</p>
                </div>
                <button autoFocus onClick={() => setTabelaCompraram(false)} className="px-2 py-1 rounded bg-secondary text-foreground text-[11px] font-semibold shrink-0">Fechar</button>
              </div>
              <div className="overflow-auto p-4">
                <table className="w-full text-xs">
                  <thead><tr className="text-muted-foreground text-left">
                    {['Pedido da recuperação', 'Comprador', 'Evento', 'Compra paga', 'Cidade', 'Ingresso', 'Valor', 'Canal', 'Ligado por', 'Venda'].map((h) => <th key={h} className="pb-2 pr-3 font-semibold whitespace-nowrap">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {compraramLista.map((p) => {
                      const c = compraDe.get(p.transacao_id);
                      return (
                        <tr key={p.transacao_id} className="border-t border-border align-top">
                          <td className="py-2 pr-3 whitespace-nowrap"><div className="mono text-foreground">{quando(p.criado_em)}</div><div className="text-muted-foreground">{STATUS[p.status] ?? p.status} · {brl(p.valor_bruto)}</div></td>
                          <td className="py-2 pr-3"><div className="font-semibold text-foreground">{p.nome_contato ?? '—'}</div><div className="text-muted-foreground">{p.email ?? '—'}</div><div className="mono text-muted-foreground">{p.telefone ?? '—'}</div></td>
                          <td className="py-2 pr-3"><div className="text-foreground">{p.cidade_evento ?? '—'}</div><div className="text-muted-foreground">{p.produto_nome}</div></td>
                          <td className="py-2 pr-3 whitespace-nowrap"><div className="mono text-foreground">{c ? quando(c.aprovado_em ?? c.compra_em) : '—'}</div>{c && <div className="text-muted-foreground">{c.compra_antes ? 'antes do pedido' : 'depois do pedido'}</div>}</td>
                          <td className="py-2 pr-3 text-foreground">{c?.compra_cidade ?? '—'}</td>
                          <td className="py-2 pr-3"><div className="text-foreground">{c?.compra_tipo ?? '—'}</div><div className="text-muted-foreground">{c?.compra_qtd ? `${num(c.compra_qtd)} ${c.compra_qtd === 1 ? 'ingresso' : 'ingressos'}` : ''}</div></td>
                          <td className="py-2 pr-3 mono whitespace-nowrap text-foreground">{c?.compra_valor != null ? brl(c.compra_valor) : '—'}</td>
                          <td className="py-2 pr-3 text-foreground">{[c?.compra_canal, c?.compra_cupom ? `cupom ${c.compra_cupom}` : null].filter(Boolean).join(' · ') || '—'}</td>
                          <td className="py-2 pr-3 text-foreground whitespace-nowrap">{c?.ligado_por ?? '—'}</td>
                          <td className="py-2">{c?.compra_link ? <a href={c.compra_link} target="_blank" rel="noopener noreferrer" className="px-2 py-1 rounded bg-secondary text-foreground text-[11px] font-semibold whitespace-nowrap">Abrir na Guru</a> : '—'}</td>
                        </tr>
                      );
                    })}
                    {compraramLista.length === 0 && <tr><td colSpan={10} className="py-6 text-center text-muted-foreground">Nenhum pedido neste filtro.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </>)}
      </main>
    </div>
  );
}

/** Junta à fila as linhas que o atendente mexeu e que saíram da situação filtrada, na posição em que estavam (menos as que já recompraram). */
function comFixos(dados: Pedido[], fixos: Record<string, { p: Pedido; i: number }>, recomprou: (id: string) => boolean): Pedido[] {
  const base = [...dados];
  const presentes = new Set(base.map((x) => x.transacao_id));
  Object.values(fixos).filter((f) => !presentes.has(f.p.transacao_id) && !recomprou(f.p.transacao_id)).sort((a, b) => a.i - b.i).forEach((f) => base.splice(Math.min(f.i, base.length), 0, f.p));
  return base;
}

function Templates({ lista, erro, carregando }: { lista: Template[]; erro: Error | null; carregando: boolean }) {
  const qc = useQueryClient();
  const { perfil } = useAuth();
  const vazio = { id: '', nome: '', texto: '', ativo: true, padrao: false };
  const [f, setF] = useState(vazio);
  const salvar = useMutation({
    mutationFn: () => r1Rpc('recuperacao_template_salvar', { p_id: f.id || null, p_nome: f.nome, p_texto: f.texto, p_ativo: f.ativo, p_padrao: f.padrao }),
    onSuccess: () => { setF(vazio); qc.invalidateQueries({ queryKey: ['recuperacao-templates'] }); },
  });
  const alternar = useMutation({
    mutationFn: (t: Template) => r1Rpc('recuperacao_template_salvar', { p_id: t.id, p_nome: t.nome, p_texto: t.texto, p_ativo: !t.ativo, p_padrao: t.padrao }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recuperacao-templates'] }),
  });
  const apagar = useMutation({
    mutationFn: (id: string) => r1Rpc('recuperacao_template_apagar', { p_id: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recuperacao-templates'] }),
  });
  const exemplo = f.texto.replace(/\{atendente\}/g, 'Grazi').replace(/\{evento\}/g, 'Belém (10/2026)').replace(/\{nome\}/g, 'Maria').replace(/\{produto\}/g, 'Ingresso Máquina de Vendas').replace(/\{cidade\}/g, 'Belém').replace(/\{valor\}/g, 'R$ 497,00');
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <section className="surface p-4 space-y-3">
        <span className="section-label">{f.id ? 'Editar template' : 'Novo template'}</span>
        <input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Nome (ex.: Pix expirado)" className="w-full bg-secondary rounded px-2 py-1.5 text-sm text-foreground" />
        <textarea value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} rows={6} placeholder="Texto da mensagem" className="w-full bg-secondary rounded px-2 py-1.5 text-sm text-foreground" />
        <div className="flex flex-wrap gap-1">
          {VARIAVEIS.map((v) => <button key={v} type="button" onClick={() => setF({ ...f, texto: `${f.texto}${v}` })} className="px-2 py-0.5 rounded bg-secondary text-[11px] mono text-foreground">{v}</button>)}
        </div>
        {f.texto && <div className="text-xs rounded bg-emerald-500/10 text-foreground p-2"><div className="text-[10px] text-muted-foreground mb-1">Prévia</div>{exemplo}</div>}
        <label className="text-xs text-muted-foreground flex items-center gap-1"><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> ativo (aparece para o atendente)</label>
        <label className="text-xs text-muted-foreground flex items-center gap-1"><input type="checkbox" checked={f.padrao} onChange={(e) => setF({ ...f, padrao: e.target.checked })} /> usar como mensagem padrão</label>
        {salvar.error && <p className="text-xs text-red-400">{(salvar.error as Error).message}</p>}
        <div className="flex gap-2">
          <button onClick={() => salvar.mutate()} disabled={!f.nome.trim() || !f.texto.trim() || salvar.isPending} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">Salvar</button>
          {f.id && <button onClick={() => setF(vazio)} className="px-3 py-1.5 rounded bg-secondary text-xs text-foreground">Cancelar</button>}
        </div>
      </section>
      <section className="surface p-4 space-y-2">
        <span className="section-label">Templates</span>
        {apagar.error && <p className="text-xs text-red-400">{(apagar.error as Error).message}</p>}
        {erro && <p className="text-xs text-red-400">Não foi possível ler os templates: {erro.message}</p>}
        {carregando && <p className="text-xs text-muted-foreground">Carregando…</p>}
        {!carregando && !erro && lista.length === 0 && <p className="text-xs text-muted-foreground">Nenhum template ainda.</p>}
        {lista.map((t) => (
          <div key={t.id} className={`rounded border border-border p-3 text-xs ${t.ativo ? '' : 'opacity-60'}`}>
            <div className="flex items-center gap-2"><span className="font-semibold text-foreground">{t.nome}</span>{t.padrao && <span className="px-1.5 rounded bg-primary/15 text-primary text-[10px]">padrão</span>}{!t.ativo && <span className="text-[10px] text-muted-foreground">inativo</span>}
              <span className="ml-auto flex gap-1"><button onClick={() => setF({ id: t.id, nome: t.nome, texto: t.texto, ativo: t.ativo, padrao: t.padrao })} className="px-2 py-0.5 rounded bg-secondary text-foreground">Editar</button><button onClick={() => alternar.mutate(t)} className="px-2 py-0.5 rounded bg-secondary text-muted-foreground">{t.ativo ? 'Desativar' : 'Ativar'}</button>{perfil?.papel === 'administrador' && <button onClick={() => { if (window.confirm(`Excluir o template "${t.nome}"? Não dá para desfazer.`)) apagar.mutate(t.id); }} className="px-2 py-0.5 rounded bg-red-500/15 text-red-400">Excluir</button>}</span></div>
            <p className="mt-1 text-muted-foreground whitespace-pre-wrap">{t.texto}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

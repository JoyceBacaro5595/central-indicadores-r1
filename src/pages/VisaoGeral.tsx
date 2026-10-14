import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { r1Rpc } from '@/integrations/r1/client';
import { useAuth } from '@/auth/AuthProvider';
import { usePerpetuo } from '@/hooks/usePerpetuo';
import { ROTA, mesmoEvento } from './maquina-vendas/rota';

/* Visão geral do grupo, página inicial do app (pedido da Joyce, 14/10): réplica do layout do painel "Sala R1 · tempo real"
   (fundo preto, quatro colunas, cards com número grande), com os números reais do banco. Sem barra de rolagem visível. */
const TEMA_PRETO = { '--background': '0 0% 5%', '--card': '0 0% 9%', '--secondary': '0 0% 13%', '--muted': '0 0% 13%', '--border': '0 0% 17%' } as React.CSSProperties;
const VERMELHO = '#ff1744';
const AMARELO = '#ffd54f';

const num = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR'));
const brl = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const brlMil = (v: number | null | undefined) => (v == null ? '—' : v >= 1000 ? `R$ ${Math.round(v / 1000).toLocaleString('pt-BR')} mil` : brl(v));
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v).toLocaleString('pt-BR')}%`);
const hojeISO = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const mesISO = (offset: number) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + offset); return d.toISOString().slice(0, 7) + '-01'; };
const dataCurta = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');
const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MES3 = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const diasAte = (iso: string, hoje: string) => Math.round((Date.parse(iso + 'T12:00:00') - Date.parse(hoje + 'T12:00:00')) / 86400000);
const PADRAO = { meta: 250, capacidade: 350 }; /* iguais aos da Máquina de Vendas: valem só quando o evento não tem valor próprio */
const hhmm = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

interface Evento { id: number; cidade: string; mes_evento: string; data_evento: string | null; capacidade: number | null; meta_ingressos: number | null; meta_faturamento: number | null; realizado: number; pagos: number; cortesias: number; faturamento: number; dias_restantes: number }
interface MetaEvento { cidade: string; mes_evento: string; investimento: number }

function Coluna({ titulo, ponto, nota, children }: { titulo: string; ponto: string; nota?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card/60 p-4 min-w-0 flex flex-col gap-3">
      <header className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-foreground leading-tight"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ponto }} />{titulo}</h2>
        {nota && <div className="text-[10px] text-muted-foreground text-right leading-tight">{nota}</div>}
      </header>
      {children}
    </section>
  );
}

function Quadro({ rotulo, valor, sub, cor, barra }: { rotulo: string; valor: string; sub?: string; cor?: string; barra?: number | null }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-3 min-w-0">
      <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{rotulo}</div>
      <div className="text-xl font-extrabold leading-tight whitespace-nowrap" style={cor ? { color: cor } : undefined}>{valor}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
      {barra != null && <div className="h-1 rounded-full bg-muted mt-1.5 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(2, barra))}%`, background: AMARELO }} /></div>}
    </div>
  );
}

const soma = <T,>(l: T[], f: (x: T) => number) => l.reduce((s, x) => s + (f(x) || 0), 0);

export default function VisaoGeral() {
  const { pode } = useAuth();
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 30_000); return () => clearInterval(t); }, []);
  const de = mesISO(-1), ate = mesISO(4);
  const eventosQ = useQuery({ queryKey: ['vg-eventos', de, ate], queryFn: () => r1Rpc<Evento[]>('eventos_listar', { p_de: de, p_ate: ate }), refetchInterval: 5 * 60_000, enabled: pode('eventos') });
  const metaQ = useQuery({ queryKey: ['vg-meta', de, ate], queryFn: () => r1Rpc<MetaEvento[]>('meta_eventos', { p_de: de, p_ate: ate }), refetchInterval: 15 * 60_000, enabled: pode('eventos') });
  const perpBase = usePerpetuo(undefined, undefined, pode('perpetuo'));
  const ciclo = perpBase.data?.ciclos?.find((c) => c.inicio <= hojeISO() && hojeISO() <= c.fim) ?? perpBase.data?.ciclos?.[perpBase.data.ciclos.length - 1];
  const perp = usePerpetuo(ciclo?.inicio, hojeISO(), pode('perpetuo') && !!ciclo);

  const hoje = hojeISO();
  const eventos = eventosQ.data ?? [];
  // Cada praça da rota: dados do banco + data (a do evento, ou a da rota quando o evento ainda não tem data cadastrada).
  const rota = ROTA.cidades.map((c) => {
    const e = eventos.find((x) => mesmoEvento(x, c));
    const data = e?.data_evento ?? c.data;
    return { c, e, data, dias: diasAte(data, hoje), cap: e?.capacidade ?? PADRAO.capacidade, meta: e?.meta_ingressos ?? PADRAO.meta, pagos: e?.pagos ?? 0, cort: e?.cortesias ?? 0, real: e?.realizado ?? 0, fat: e?.faturamento ?? 0, metaFat: e?.meta_faturamento ?? 0 };
  });
  const proximos = rota.filter((x) => x.dias >= 0).sort((a, b) => (a.data < b.data ? -1 : 1)).slice(0, 5);
  const metaRota = (metaQ.data ?? []).filter((m) => ROTA.cidades.some((c) => mesmoEvento(m, c)));
  const vendas = soma(rota, (x) => x.real), pagos = soma(rota, (x) => x.pagos), receita = soma(rota, (x) => x.fat);
  const metaIng = soma(rota, (x) => x.meta), metaFat = soma(rota, (x) => x.metaFat);
  const invRota = soma(metaRota, (m) => m.investimento);
  const capTotal = soma(rota, (x) => x.cap);

  const r = perp.data?.resumo;
  const diario = (perp.data?.diario ?? []).slice(-14);
  const maxDia = Math.max(1, ...diario.map((d) => d.leads_crm ?? 0));
  const atualizado = Math.max(eventosQ.dataUpdatedAt, metaQ.dataUpdatedAt, perp.dataUpdatedAt);
  const hace = atualizado ? Math.max(0, Math.round((agora.getTime() - atualizado) / 60000)) : null;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-4" style={TEMA_PRETO}>
      <div className="inline-flex"><span className="rounded-t-md border border-border bg-secondary/60 px-4 py-2 text-[11px] font-extrabold tracking-widest text-foreground">TEMPO REAL</span></div>
      <header className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-end gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-extrabold tracking-widest text-muted-foreground"><span className="w-2 h-2 rounded-full" style={{ background: VERMELHO }} />SALA R1 · TEMPO REAL</div>
          <div className="text-2xl font-extrabold text-foreground">{DIAS[agora.getDay()]}, {agora.getDate()} de {MESES[agora.getMonth()]}</div>
        </div>
        <div className="text-6xl md:text-7xl font-black tracking-tight text-foreground leading-none">{hhmm(agora)}</div>
        <div className="md:text-right">
          <div className="text-[10px] font-extrabold tracking-widest text-muted-foreground">DADOS DOS PAINÉIS</div>
          <div className="text-sm font-bold text-foreground">{atualizado ? `atualizado às ${hhmm(new Date(atualizado))} · há ${hace} min` : 'carregando…'}</div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        <Coluna titulo="Próximos eventos" ponto={VERMELHO} nota="Central de eventos">
          {!pode('eventos') ? <p className="text-xs text-muted-foreground">Sem permissão para ver eventos.</p> : proximos.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum evento futuro cadastrado.</p> : (
            <>
              <div className="rounded-xl p-4 border border-orange-500/30" style={{ background: 'linear-gradient(135deg,#7a3d00,#1c1208)' }}>
                <div className="text-[9px] font-extrabold tracking-widest text-orange-200/80">PRÓXIMO · TURNÊ MDV</div>
                <div className="text-2xl font-black text-white leading-tight mt-1">{proximos[0].c.cidade}</div>
                <div className="text-xs text-white/80">{dataCurta(proximos[0].data)} · {proximos[0].dias === 0 ? 'hoje' : `em ${proximos[0].dias} dias`}</div>
                {proximos[0].dias === 0 && <div className="mt-2 inline-block rounded-md bg-black/50 px-3 py-1 text-lg font-black text-white">AO VIVO</div>}
              </div>
              <ul className="divide-y divide-border">
                {proximos.slice(1).map((x) => {
                  const d = new Date(`${x.data}T12:00:00`);
                  return (
                    <li key={x.c.cidade} className="flex items-center gap-3 py-2">
                      <div className="w-9 text-center leading-none"><div className="text-lg font-black text-foreground">{d.getDate()}</div><div className="text-[9px] font-bold text-muted-foreground">{MES3[d.getMonth()]}</div></div>
                      <div className="min-w-0 flex-1 text-xs font-bold text-foreground truncate">{x.c.cidade}</div>
                      <div className="text-[10px] text-muted-foreground whitespace-nowrap">em {x.dias} dias</div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Coluna>

        <Coluna titulo="Turnê Máquina de Vendas" ponto={AMARELO} nota={<>{ROTA.nome}<br />ocupação {capTotal > 0 ? pct((vendas / capTotal) * 100) : '—'}<br />vendas {num(vendas)}</>}>
          {!pode('eventos') ? <p className="text-xs text-muted-foreground">Sem permissão para ver eventos.</p> : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Quadro rotulo="Vendas + cortesias" valor={num(vendas)} sub={metaIng > 0 ? `${pct((vendas / metaIng) * 100)} de ${num(metaIng)} · ${num(pagos)} + ${num(vendas - pagos)}` : `${num(pagos)} + ${num(vendas - pagos)}`} barra={metaIng > 0 ? (vendas / metaIng) * 100 : null} />
                <Quadro rotulo="Receita" valor={brlMil(receita)} sub={metaFat > 0 ? `${pct((receita / metaFat) * 100)} de ${brlMil(metaFat)}` : undefined} barra={metaFat > 0 ? (receita / metaFat) * 100 : null} />
                <Quadro rotulo="CAC ingresso" valor={pagos > 0 ? brl(invRota / pagos) : brl(0)} cor="#4ade80" />
                <Quadro rotulo="Investido" valor={brlMil(invRota)} />
              </div>
              <div className="text-[11px] font-bold text-foreground">Ocupação por praça <span className="font-normal text-muted-foreground">(vendas + cortesias) / capacidade</span></div>
              <ul className="space-y-1.5">
                {rota.map((x) => (
                  <li key={x.c.cidade} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-xs">
                    <span className="truncate font-semibold text-foreground">{x.c.cidade}</span>
                    <span className="font-bold text-foreground whitespace-nowrap">{num(x.real)} / {num(x.cap)} <span className="font-normal text-muted-foreground">{num(x.pagos)}+{num(x.cort)}</span></span>
                    <span className="text-[10px] text-muted-foreground w-16 text-right">{x.dias < 0 ? 'realizado' : x.dias === 0 ? 'hoje' : `${x.dias} dias`}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Coluna>

        <Coluna titulo={`Método RGV · ${ciclo ? ciclo.ciclo.replace(/^RGV\s*/, 'Ciclo ') : 'Ciclo'}`} ponto={VERMELHO} nota={ciclo ? `${dataCurta(ciclo.inicio)} a ${dataCurta(ciclo.fim)}` : undefined}>
          {!pode('perpetuo') ? <p className="text-xs text-muted-foreground">Sem permissão para ver o Perpétuo.</p> : (
            <>
              <div className="rounded-xl border border-border bg-secondary/40 p-4">
                <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Leads no ciclo (HubSpot)</div>
                <div className="text-4xl font-black text-foreground leading-tight">{perp.error ? '—' : r ? num(r.leads_crm) : 'Carregando…'}</div>
                {perp.error && <div className="text-[11px] text-red-400">Erro ao ler o funil: {String((perp.error as Error).message ?? perp.error)}</div>}
                <div className="text-[11px] text-muted-foreground">MQL {num(r?.mql)} · vendas RGV {num(r?.vendas)}</div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Quadro rotulo="Investido" valor={brlMil(r?.investimento)} />
                <Quadro rotulo="CPL" valor={brl(r?.cpl)} cor="#4ade80" />
                <Quadro rotulo="MQL" valor={num(r?.mql)} sub={r?.leads_crm ? `${pct(((r.mql ?? 0) / r.leads_crm) * 100)} dos leads` : undefined} />
              </div>
              <div className="text-[11px] font-bold text-foreground">Leads por dia</div>
              <div className="flex items-end gap-1 h-40">
                {diario.map((d) => (
                  <div key={d.data} className="flex-1 min-w-0 flex flex-col items-center justify-end gap-0.5 h-full">
                    <span className="text-[8px] font-bold text-foreground">{d.leads_crm ?? '—'}</span>
                    <div className="w-full rounded-sm" style={{ height: `${((d.leads_crm ?? 0) / maxDia) * 100}%`, background: VERMELHO }} />
                    <span className="text-[7px] text-muted-foreground">{dataCurta(d.data)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Coluna>

        <Coluna titulo="Black Friday 10X" ponto={AMARELO}>
          <div className="rounded-xl border border-border bg-secondary/40 p-4 text-xs text-muted-foreground">
            Não disponível: os inscritos, pagos e gratuitos da Black Friday 10X ficam no Dashboard da Lovable e ainda não chegam ao banco desta central. Falta ligar essa fonte para o card mostrar números reais.
          </div>
        </Coluna>
      </div>
    </div>
  );
}

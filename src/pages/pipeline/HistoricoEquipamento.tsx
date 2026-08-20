import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { CarregandoTela } from '../../components/CarregandoTela';
import { Badge } from '../../components/Badge';
import { formatarMoeda } from '../../lib/formato';
import { STATUS_PRONTO_ENTREGA, STATUS_ENTREGUE, tonoDoStatusOS } from '../../lib/statusOS';

interface ResultadoBusca {
  id: number;
  numero_os: string;
  cliente_nome: string;
  optica_desc: string | null;
  optica_fab: string | null;
  optica_sn: string | null;
  status_os: string | null;
  data_abertura: string;
}

interface StatusHistoricoLinha {
  id: number;
  status_anterior: string | null;
  status_novo: string;
  alterado_em: string;
  alterado_por: number | null;
}

// Histórico completo de uma OS/equipamento - reúne o que hoje está
// espalhado em 6+ telas diferentes (Entrada, OS, Orçamento, aprovação,
// finalização da manutenção, devolução, financeiro) num só lugar,
// buscável por número de série. "Quando finalizou a manutenção" vem da
// tabela ordens_servico_status_historico (migração 091) - antes disso só
// o status ATUAL ficava salvo, sem rastro de quando cada etapa aconteceu.
export function HistoricoEquipamento() {
  const [busca, setBusca] = useState('');
  const [termoBuscado, setTermoBuscado] = useState('');
  const [osSelecionadaId, setOsSelecionadaId] = useState<number | null>(null);

  const resultadosQuery = useQuery({
    queryKey: ['historico-busca-os', termoBuscado],
    enabled: !!termoBuscado,
    queryFn: async (): Promise<ResultadoBusca[]> => {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('id, numero_os, cliente_nome, optica_desc, optica_fab, optica_sn, status_os, data_abertura')
        .ilike('optica_sn', `%${termoBuscado}%`)
        .order('data_abertura', { ascending: false });
      if (error) throw error;
      return data as ResultadoBusca[];
    },
  });

  const detalheQuery = useQuery({
    queryKey: ['historico-detalhe-os', osSelecionadaId],
    enabled: !!osSelecionadaId,
    queryFn: async () => {
      const osId = osSelecionadaId!;
      const [osRes, entradaRes, orcamentoRes, statusHistRes, entregaRes, laudosRes, funcionariosRes] = await Promise.all([
        supabase.from('ordens_servico').select('*').eq('id', osId).single(),
        supabase.from('entradas_equipamento').select('*').eq('ordem_servico_id', osId).maybeSingle(),
        supabase.from('orcamentos').select('*').eq('ordem_servico_id', osId).order('id', { ascending: false }).limit(1).maybeSingle(),
        supabase
          .from('ordens_servico_status_historico')
          .select('id, status_anterior, status_novo, alterado_em, alterado_por')
          .eq('ordem_servico_id', osId)
          .order('alterado_em'),
        supabase.from('entregas').select('*').eq('ordem_servico_id', osId).maybeSingle(),
        supabase
          .from('laudos')
          .select('numero_laudo, tipo_laudo, resultado, data_emissao')
          .eq('ordem_servico_id', osId)
          .order('data_emissao'),
        supabase.from('funcionarios').select('id, nome'),
      ]);
      if (osRes.error) throw osRes.error;

      let cliente = null;
      if (osRes.data.cliente_id) {
        const { data } = await supabase.from('clientes').select('razao_social').eq('id', osRes.data.cliente_id).maybeSingle();
        cliente = data;
      }
      let clienteFinal = null;
      if (osRes.data.cliente_final_id) {
        const { data } = await supabase.from('clientes').select('razao_social').eq('id', osRes.data.cliente_final_id).maybeSingle();
        clienteFinal = data;
      }

      let itensOrcamento: { nome: string; quantidade: number; preco_unitario: number | null }[] = [];
      let contasReceber: Record<string, unknown> | null = null;
      if (orcamentoRes.data) {
        const { data: itensData } = await supabase
          .from('orcamento_itens')
          .select('quantidade, preco_unitario, descricao_servico, produtos_servicos(nome)')
          .eq('orcamento_id', orcamentoRes.data.id);
        itensOrcamento = (itensData ?? []).map((it) => ({
          nome: (it as unknown as { produtos_servicos: { nome: string } | null }).produtos_servicos?.nome ?? it.descricao_servico ?? '-',
          quantidade: it.quantidade,
          preco_unitario: it.preco_unitario,
        }));
        const { data: cr } = await supabase.from('contas_receber').select('*').eq('orcamento_id', orcamentoRes.data.id).maybeSingle();
        contasReceber = cr;
      }

      return {
        os: osRes.data,
        cliente,
        clienteFinal,
        entrada: entradaRes.data,
        orcamento: orcamentoRes.data,
        itensOrcamento,
        statusHist: (statusHistRes.data ?? []) as StatusHistoricoLinha[],
        entrega: entregaRes.data,
        laudos: laudosRes.data ?? [],
        funcionarios: (funcionariosRes.data ?? []) as { id: number; nome: string }[],
        contasReceber,
      };
    },
  });

  function nomeFunc(id: number | null): string | null {
    if (!id) return null;
    return detalheQuery.data?.funcionarios.find((f) => f.id === id)?.nome ?? null;
  }

  function buscar() {
    setTermoBuscado(busca.trim());
    setOsSelecionadaId(null);
  }

  const d = detalheQuery.data;
  // Quando precificado por valor fixo (por modelo de ótica ou por
  // modalidade de manutenção), os itens ficam com preço zerado de
  // propósito e o valor de verdade vem de orcamentos.valor_fixo_contrato.
  const valorTotalOrcamento =
    (d?.orcamento as { valor_fixo_contrato?: number | null } | null | undefined)?.valor_fixo_contrato ??
    d?.itensOrcamento.reduce((s, it) => s + (it.preco_unitario ?? 0) * it.quantidade, 0) ??
    0;
  const eventoFinalizacao = d?.statusHist.find((h) => h.status_novo === STATUS_PRONTO_ENTREGA);

  return (
    <div>
      <h1>Histórico do equipamento</h1>
      <p style={{ fontSize: 12, color: 'var(--ink-400)', margin: '0 0 16px', maxWidth: 700 }}>
        Busque por <strong>número de série</strong> para ver todas as vezes que esse equipamento passou pela CVF, e o
        histórico completo de uma OS: entrada, ordem de serviço, orçamento, quem/como aprovou, quando a manutenção
        terminou, devolução e financeiro.
      </p>

      <div style={{ display: 'flex', gap: 8, maxWidth: 420, marginBottom: 16 }}>
        <input
          type="text"
          className="campo-filtro-coluna"
          style={{ flex: 1 }}
          placeholder="Nº de série do equipamento..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && buscar()}
        />
        <button className="botao-primario botao-pequeno" onClick={buscar} disabled={!busca.trim()}>
          Buscar
        </button>
      </div>

      {resultadosQuery.isLoading && <CarregandoTela />}

      {termoBuscado && !resultadosQuery.isLoading && (
        <table className="tabela-crud" style={{ marginBottom: 20 }}>
          <thead>
            <tr>
              <th>OS</th>
              <th>Cliente</th>
              <th>Equipamento</th>
              <th>Nº de série</th>
              <th>Status atual</th>
              <th>Aberta em</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(resultadosQuery.data ?? []).map((r) => (
              <tr key={r.id} style={osSelecionadaId === r.id ? { background: 'var(--copper-500-12)' } : undefined}>
                <td className="mono">{r.numero_os}</td>
                <td>{r.cliente_nome}</td>
                <td>
                  {r.optica_desc ?? '-'} {r.optica_fab ? `(${r.optica_fab})` : ''}
                </td>
                <td className="mono">{r.optica_sn ?? '-'}</td>
                <td>
                  <Badge tono={tonoDoStatusOS(r.status_os)}>{r.status_os ?? '-'}</Badge>
                </td>
                <td>{new Date(r.data_abertura).toLocaleDateString('pt-BR')}</td>
                <td className="acoes-tabela">
                  <button className="botao-secundario botao-pequeno" onClick={() => setOsSelecionadaId(r.id)}>
                    Ver histórico
                  </button>
                </td>
              </tr>
            ))}
            {(resultadosQuery.data ?? []).length === 0 && (
              <tr>
                <td colSpan={7}>Nenhuma OS encontrada com esse número de série.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {osSelecionadaId && detalheQuery.isLoading && <CarregandoTela />}

      {osSelecionadaId && d && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760 }}>
          <Secao titulo="1. Entrada">
            {d.entrada ? (
              <>
                <LinhaInfo rotulo="Código" valor={d.entrada.codigo_entrada} />
                <LinhaInfo rotulo="Data de entrada" valor={new Date(d.entrada.data_entrada).toLocaleString('pt-BR')} />
                <LinhaInfo rotulo="Condição de chegada" valor={d.entrada.condicao_chegada ?? '-'} />
                <LinhaInfo rotulo="Recebido por" valor={nomeFunc(d.entrada.recebido_por) ?? '-'} />
              </>
            ) : (
              <p style={{ margin: 0, color: 'var(--ink-400)' }}>Nenhum registro de entrada encontrado.</p>
            )}
          </Secao>

          <Secao titulo="2. Ordem de serviço">
            <LinhaInfo rotulo="Nº da OS" valor={d.os.numero_os} />
            <LinhaInfo rotulo="Cliente" valor={d.cliente?.razao_social ?? d.os.cliente_nome} />
            {d.clienteFinal && <LinhaInfo rotulo="Unidade atendida" valor={d.clienteFinal.razao_social} />}
            <LinhaInfo rotulo="Equipamento" valor={`${d.os.optica_desc ?? '-'} ${d.os.optica_fab ? `(${d.os.optica_fab})` : ''}`} />
            <LinhaInfo rotulo="Nº de série" valor={d.os.optica_sn ?? '-'} />
            <LinhaInfo rotulo="Defeito relatado" valor={d.os.defeito_relatado ?? '-'} />
            <LinhaInfo rotulo="Aberta em" valor={new Date(d.os.data_abertura).toLocaleString('pt-BR')} />
            <LinhaInfo rotulo="Status atual" valor={<Badge tono={tonoDoStatusOS(d.os.status_os)}>{d.os.status_os ?? '-'}</Badge>} />
          </Secao>

          <Secao titulo="3. Orçamento">
            {d.orcamento ? (
              <>
                <LinhaInfo rotulo="Nº do orçamento" valor={d.orcamento.numero_orcamento} />
                <LinhaInfo rotulo="Status" valor={d.orcamento.status} />
                <LinhaInfo rotulo="Criado em" valor={new Date(d.orcamento.data_criacao).toLocaleString('pt-BR')} />
                <LinhaInfo rotulo="Criado por" valor={nomeFunc(d.orcamento.criado_por) ?? '-'} />
                {d.orcamento.precificado_por && (
                  <LinhaInfo rotulo="Precificado por" valor={nomeFunc(d.orcamento.precificado_por) ?? '-'} />
                )}
                {d.orcamento.data_envio && (
                  <LinhaInfo rotulo="Enviado ao cliente em" valor={new Date(d.orcamento.data_envio).toLocaleString('pt-BR')} />
                )}
                <LinhaInfo rotulo="Valor total" valor={formatarMoeda(d.orcamento.valor_fixo_contrato ?? valorTotalOrcamento)} />
                {d.itensOrcamento.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--ink-400)', marginBottom: 3 }}>Itens:</div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                      {d.itensOrcamento.map((it, i) => (
                        <li key={i}>
                          {it.nome} (x{it.quantidade}) - {formatarMoeda((it.preco_unitario ?? 0) * it.quantidade)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p style={{ margin: 0, color: 'var(--ink-400)' }}>Nenhum orçamento encontrado.</p>
            )}
          </Secao>

          <Secao titulo="4. Quem e como aprovou">
            {!d.orcamento ? (
              <p style={{ margin: 0, color: 'var(--ink-400)' }}>Sem orçamento, nada a aprovar ainda.</p>
            ) : d.orcamento.aprovacao_manual ? (
              <>
                <LinhaInfo rotulo="Como" valor={<Badge tono="copper">Aprovação manual (pela equipe)</Badge>} />
                <LinhaInfo rotulo="Aprovado por" valor={nomeFunc(d.orcamento.aprovado_manualmente_por) ?? '-'} />
                <LinhaInfo rotulo="Motivo" valor={d.orcamento.motivo_aprovacao_manual ?? '-'} />
              </>
            ) : d.orcamento.data_resposta_cliente ? (
              <>
                <LinhaInfo rotulo="Como" valor={<Badge tono="teal">Pelo portal do cliente</Badge>} />
                <LinhaInfo rotulo="Quando" valor={new Date(d.orcamento.data_resposta_cliente).toLocaleString('pt-BR')} />
              </>
            ) : (
              <p style={{ margin: 0, color: 'var(--ink-400)' }}>Ainda não foi aprovado.</p>
            )}
          </Secao>

          <Secao titulo="5. Quando finalizou a manutenção">
            {eventoFinalizacao ? (
              <>
                <LinhaInfo rotulo="Data" valor={new Date(eventoFinalizacao.alterado_em).toLocaleString('pt-BR')} />
                <LinhaInfo rotulo="Marcado por" valor={nomeFunc(eventoFinalizacao.alterado_por) ?? '-'} />
              </>
            ) : (
              <p style={{ margin: 0, color: 'var(--ink-400)' }}>
                Ainda não chegou em "Pronto para entrega", ou essa OS é de antes do sistema passar a registrar esse
                histórico (só a partir de 20/08/2026).
              </p>
            )}
            {d.statusHist.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--ink-400)' }}>
                  Ver todas as mudanças de status ({d.statusHist.length})
                </summary>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
                  {d.statusHist.map((h) => (
                    <li key={h.id}>
                      {h.status_anterior ? `${h.status_anterior} → ` : ''}
                      <strong>{h.status_novo}</strong> - {new Date(h.alterado_em).toLocaleString('pt-BR')}
                      {nomeFunc(h.alterado_por) ? ` (${nomeFunc(h.alterado_por)})` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Secao>

          <Secao titulo="6. Quando e como devolveu">
            {d.entrega ? (
              <>
                <LinhaInfo rotulo="Data da entrega" valor={new Date(d.entrega.data_entrega).toLocaleString('pt-BR')} />
                <LinhaInfo rotulo="Forma de devolução" valor={d.entrega.forma_devolucao} />
                <LinhaInfo rotulo="Registrado por" valor={nomeFunc(d.entrega.responsavel_id) ?? '-'} />
                <LinhaInfo
                  rotulo="Confirmado pelo cliente"
                  valor={
                    d.entrega.confirmado_pelo_cliente_em ? (
                      <Badge tono="teal">{new Date(d.entrega.confirmado_pelo_cliente_em).toLocaleString('pt-BR')}</Badge>
                    ) : d.entrega.finalizado_manualmente_em ? (
                      <Badge tono="copper">
                        Finalizado manualmente {new Date(d.entrega.finalizado_manualmente_em).toLocaleString('pt-BR')}
                        {nomeFunc(d.entrega.finalizado_manualmente_por) ? ` (${nomeFunc(d.entrega.finalizado_manualmente_por)})` : ''}
                      </Badge>
                    ) : (
                      <Badge tono="neutro">Aguardando confirmação</Badge>
                    )
                  }
                />
              </>
            ) : d.os.status_os === STATUS_ENTREGUE || d.os.status_os === STATUS_PRONTO_ENTREGA ? (
              <p style={{ margin: 0, color: 'var(--ink-400)' }}>Sem registro de entrega detalhado pra essa OS.</p>
            ) : (
              <p style={{ margin: 0, color: 'var(--ink-400)' }}>Ainda não foi devolvido.</p>
            )}
          </Secao>

          <Secao titulo="7. Financeiro">
            {d.contasReceber ? (
              <>
                <LinhaInfo rotulo="Nº da conta" valor={String(d.contasReceber.numero_conta ?? '-')} />
                <LinhaInfo rotulo="Valor" valor={formatarMoeda(Number(d.contasReceber.valor ?? 0))} />
                <LinhaInfo rotulo="Status" valor={String(d.contasReceber.status ?? '-')} />
                <LinhaInfo
                  rotulo="Recebimento"
                  valor={
                    d.contasReceber.data_recebimento
                      ? `${new Date(String(d.contasReceber.data_recebimento) + 'T00:00:00').toLocaleDateString('pt-BR')} - ${d.contasReceber.forma_recebimento ?? '-'}`
                      : '-'
                  }
                />
                {d.contasReceber.nf_numero && (
                  <LinhaInfo rotulo="NF" valor={`${d.contasReceber.nf_tipo ?? ''} ${d.contasReceber.nf_numero}`} />
                )}
              </>
            ) : (
              <p style={{ margin: 0, color: 'var(--ink-400)' }}>Ainda não foi lançado no financeiro (Faturamento).</p>
            )}
          </Secao>

          {d.laudos.length > 0 && (
            <Secao titulo="8. Laudos emitidos">
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {d.laudos.map((l) => (
                  <li key={l.numero_laudo}>
                    {l.numero_laudo} - {l.tipo_laudo ?? 'ISO 8600 / outro'} -{' '}
                    <Badge tono={l.resultado === 'Aprovado' ? 'teal' : 'danger'}>{l.resultado}</Badge> -{' '}
                    {new Date(l.data_emissao).toLocaleDateString('pt-BR')}
                  </li>
                ))}
              </ul>
            </Secao>
          )}
        </div>
      )}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div
        style={{
          background: 'var(--copper-500)',
          color: '#fff',
          fontWeight: 600,
          fontSize: 12.5,
          textTransform: 'uppercase',
          letterSpacing: '.03em',
          padding: '7px 14px',
        }}
      >
        {titulo}
      </div>
      <div style={{ padding: '10px 14px', fontSize: 13 }}>{children}</div>
    </div>
  );
}

function LinhaInfo({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
      <div style={{ width: 180, color: 'var(--ink-400)', flexShrink: 0 }}>{rotulo}</div>
      <div>{valor}</div>
    </div>
  );
}

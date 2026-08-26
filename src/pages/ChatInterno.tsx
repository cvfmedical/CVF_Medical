import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { CarregandoTela } from '../components/CarregandoTela';
import { mensagemErro } from '../lib/erros';

interface FuncionarioContato {
  id: number;
  nome: string;
  cargo: string | null;
}

interface MensagemInterna {
  id: number;
  remetente_id: number;
  destinatario_id: number;
  mensagem: string;
  lida_em: string | null;
  criado_em: string;
}

// Chat privado 1-a-1 entre funcionários (não é um mural público - só o
// remetente e o destinatário veem cada mensagem, via RLS). Sem Realtime
// de propósito: o resto do sistema já usa poll simples pra "atualizar
// sozinho" (ex.: Orçamentos aprovados), aqui é o mesmo padrão.
export function ChatInterno() {
  const { funcionario } = useAuth();
  const qc = useQueryClient();
  const meuId = funcionario?.id ?? null;

  const [contatoSelecionadoId, setContatoSelecionadoId] = useState<number | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimDaListaRef = useRef<HTMLDivElement>(null);

  const contatosQuery = useQuery({
    queryKey: ['chat-contatos', meuId],
    enabled: !!meuId,
    queryFn: async (): Promise<FuncionarioContato[]> => {
      const { data, error } = await supabase
        .from('funcionarios')
        .select('id, nome, cargo')
        .eq('status_ativo', true)
        .neq('id', meuId!)
        .order('nome');
      if (error) throw error;
      return data as FuncionarioContato[];
    },
  });

  // Todas as minhas mensagens (enviadas e recebidas) de uma vez - a lista
  // de conversas e a conversa aberta são derivadas disso na hora, sem
  // consulta separada por contato.
  const mensagensQuery = useQuery({
    queryKey: ['chat-mensagens', meuId],
    enabled: !!meuId,
    refetchInterval: 4000,
    queryFn: async (): Promise<MensagemInterna[]> => {
      const { data, error } = await supabase
        .from('mensagens_internas')
        .select('id, remetente_id, destinatario_id, mensagem, lida_em, criado_em')
        .or(`remetente_id.eq.${meuId},destinatario_id.eq.${meuId}`)
        .order('criado_em', { ascending: true });
      if (error) throw error;
      return data as MensagemInterna[];
    },
  });

  const conversas = useMemo(() => {
    const mapa = new Map<number, { ultima: MensagemInterna; naoLidas: number }>();
    for (const m of mensagensQuery.data ?? []) {
      const outroId = m.remetente_id === meuId ? m.destinatario_id : m.remetente_id;
      const naoLida = m.destinatario_id === meuId && !m.lida_em ? 1 : 0;
      const atual = mapa.get(outroId);
      if (!atual) {
        mapa.set(outroId, { ultima: m, naoLidas: naoLida });
      } else {
        mapa.set(outroId, {
          ultima: m.criado_em > atual.ultima.criado_em ? m : atual.ultima,
          naoLidas: atual.naoLidas + naoLida,
        });
      }
    }
    return mapa;
  }, [mensagensQuery.data, meuId]);

  const contatosOrdenados = useMemo(() => {
    const lista = contatosQuery.data ?? [];
    return [...lista].sort((a, b) => {
      const dataA = conversas.get(a.id)?.ultima.criado_em ?? '';
      const dataB = conversas.get(b.id)?.ultima.criado_em ?? '';
      return dataB.localeCompare(dataA) || a.nome.localeCompare(b.nome, 'pt-BR');
    });
  }, [contatosQuery.data, conversas]);

  const mensagensDaConversa = useMemo(() => {
    if (!contatoSelecionadoId) return [];
    return (mensagensQuery.data ?? []).filter(
      (m) => m.remetente_id === contatoSelecionadoId || m.destinatario_id === contatoSelecionadoId,
    );
  }, [mensagensQuery.data, contatoSelecionadoId]);

  // Marca como lidas as mensagens recebidas dessa pessoa assim que a
  // conversa é aberta (ou assim que uma nova chega enquanto ela já está
  // aberta, via o poll).
  useEffect(() => {
    if (!contatoSelecionadoId || !meuId) return;
    const naoLidas = mensagensDaConversa.filter((m) => m.destinatario_id === meuId && !m.lida_em);
    if (naoLidas.length === 0) return;
    supabase
      .from('mensagens_internas')
      .update({ lida_em: new Date().toISOString() })
      .in(
        'id',
        naoLidas.map((m) => m.id),
      )
      .then(() => qc.invalidateQueries({ queryKey: ['chat-mensagens', meuId] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contatoSelecionadoId, mensagensDaConversa, meuId]);

  useEffect(() => {
    fimDaListaRef.current?.scrollIntoView({ block: 'end' });
  }, [mensagensDaConversa.length]);

  async function enviar() {
    const conteudo = texto.trim();
    if (!conteudo || !contatoSelecionadoId || !meuId) return;
    setEnviando(true);
    setErro(null);
    try {
      const { error } = await supabase.from('mensagens_internas').insert({
        remetente_id: meuId,
        destinatario_id: contatoSelecionadoId,
        mensagem: conteudo,
      });
      if (error) throw error;
      setTexto('');
      qc.invalidateQueries({ queryKey: ['chat-mensagens', meuId] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  }

  if (contatosQuery.isLoading || mensagensQuery.isLoading) return <CarregandoTela />;

  const contatoSelecionado = contatosOrdenados.find((c) => c.id === contatoSelecionadoId) ?? null;

  return (
    <div>
      <h1>Chat interno</h1>
      <p style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: -8, marginBottom: 12 }}>
        Mensagens privadas entre funcionários - só você e o destinatário veem a conversa. Atualiza sozinho a cada
        poucos segundos.
      </p>

      <div
        style={{
          display: 'flex',
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
          height: 560,
          background: 'var(--paper-0)',
        }}
      >
        <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
          {contatosOrdenados.map((c) => {
            const conversa = conversas.get(c.id);
            const naoLidas = conversa?.naoLidas ?? 0;
            const ativo = c.id === contatoSelecionadoId;
            return (
              <div
                key={c.id}
                onClick={() => setContatoSelecionadoId(c.id)}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  background: ativo ? 'var(--paper-50)' : 'transparent',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <strong style={{ fontSize: 13, fontWeight: naoLidas > 0 ? 700 : 500 }}>{c.nome}</strong>
                  {naoLidas > 0 && (
                    <span
                      style={{
                        background: 'var(--danger-500)',
                        color: '#fff',
                        borderRadius: 10,
                        fontSize: 11,
                        padding: '1px 7px',
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {naoLidas}
                    </span>
                  )}
                </div>
                {c.cargo && <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{c.cargo}</div>}
                {conversa && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--ink-400)',
                      marginTop: 2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {conversa.ultima.remetente_id === meuId ? 'Você: ' : ''}
                    {conversa.ultima.mensagem}
                  </div>
                )}
              </div>
            );
          })}
          {contatosOrdenados.length === 0 && (
            <p style={{ padding: 14, fontSize: 13, color: 'var(--ink-400)' }}>Nenhum outro funcionário cadastrado.</p>
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!contatoSelecionado ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--ink-400)',
                fontSize: 13,
              }}
            >
              Selecione alguém pra conversar.
            </div>
          ) : (
            <>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 14 }}>
                {contatoSelecionado.nome}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {mensagensDaConversa.map((m) => {
                  const minha = m.remetente_id === meuId;
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: minha ? 'flex-end' : 'flex-start' }}>
                      <div
                        style={{
                          maxWidth: '70%',
                          padding: '8px 12px',
                          borderRadius: 10,
                          background: minha ? 'var(--copper-500)' : 'var(--paper-50)',
                          color: minha ? '#fff' : 'var(--ink-900)',
                          border: minha ? 'none' : '1px solid var(--border)',
                        }}
                      >
                        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.mensagem}</div>
                        <div style={{ fontSize: 10, opacity: 0.75, marginTop: 3, textAlign: 'right' }}>
                          {new Date(m.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {mensagensDaConversa.length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>Nenhuma mensagem ainda - diga oi.</p>
                )}
                <div ref={fimDaListaRef} />
              </div>
              {erro && (
                <p className="erro-login" style={{ margin: '0 16px 8px' }}>
                  {erro}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border)', alignItems: 'flex-start' }}>
                <div className="campo-form" style={{ flex: 1, margin: 0 }}>
                  <input
                    type="text"
                    placeholder="Escreva uma mensagem..."
                    value={texto}
                    disabled={enviando}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        enviar();
                      }
                    }}
                  />
                </div>
                <button className="botao-primario" onClick={enviar} disabled={enviando || !texto.trim()}>
                  Enviar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { useAuth } from '../../contexts/AuthContext';
import { CarregandoTela } from '../../components/CarregandoTela';
import { urlAssinadaFoto } from '../../lib/storage';
import { abrirImpressao } from '../../lib/imprimir';
import { linkEmail, linkWhatsApp, PORTAL_CLIENTE_URL } from '../../lib/compartilhar';
import { IconPhoto } from '@tabler/icons-react';

interface OrcamentoPendente {
  id: number;
  numero_orcamento: string;
  ordem_servico_id: number;
  observacoes_tecnico: string | null;
  ordens_servico: { numero_os: string; cliente_nome: string; cliente_id: number } | null;
}

interface ItemOrcamento {
  id: number;
  produto_servico_id: number | null;
  quantidade: number;
  preco_unitario: number | null;
  observacao: string | null;
  foto_peca_danificada_path: string | null;
  produtos_servicos: { nome: string } | null;
}

interface Cliente {
  id: number;
  razao_social: string;
  telefone: string | null;
  email: string | null;
}

export function OrcamentoFinanceiro() {
  const { funcionario } = useAuth();
  const qc = useQueryClient();
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);
  const [observacoesFinanceiro, setObservacoesFinanceiro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Preços editados localmente (controlado) - persistidos em lote ao
  // enviar, em vez de depender só do onBlur de cada input (mais robusto:
  // funciona mesmo se o usuário for direto no botão "Enviar ao cliente").
  const [precos, setPrecos] = useState<Record<number, string>>({});

  const pendentesQuery = useQuery({
    queryKey: ['orcamentos-pendentes'],
    queryFn: async (): Promise<OrcamentoPendente[]> => {
      const { data, error } = await supabase
        .from('orcamentos')
        .select('id, numero_orcamento, ordem_servico_id, observacoes_tecnico, ordens_servico(numero_os, cliente_nome, cliente_id)')
        .eq('status', 'Aguardando Precificação')
        .order('data_criacao', { ascending: true });
      if (error) throw error;
      return data as unknown as OrcamentoPendente[];
    },
  });

  const orcamentoSelecionado = pendentesQuery.data?.find((o) => o.id === selecionadoId);

  const itensQuery = useQuery({
    queryKey: ['itens-orcamento-financeiro', selecionadoId],
    enabled: !!selecionadoId,
    queryFn: async (): Promise<ItemOrcamento[]> => {
      const { data, error } = await supabase
        .from('orcamento_itens')
        .select('id, produto_servico_id, quantidade, preco_unitario, observacao, foto_peca_danificada_path, produtos_servicos(nome)')
        .eq('orcamento_id', selecionadoId!);
      if (error) throw error;
      return data as unknown as ItemOrcamento[];
    },
  });

  const clienteQuery = useQuery({
    queryKey: ['cliente-do-orcamento', orcamentoSelecionado?.ordens_servico?.cliente_id],
    enabled: !!orcamentoSelecionado?.ordens_servico?.cliente_id,
    queryFn: async (): Promise<Cliente> => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, razao_social, telefone, email')
        .eq('id', orcamentoSelecionado!.ordens_servico!.cliente_id)
        .single();
      if (error) throw error;
      return data as Cliente;
    },
  });

  useEffect(() => {
    if (!itensQuery.data) return;
    const iniciais: Record<number, string> = {};
    for (const item of itensQuery.data) {
      iniciais[item.id] = item.preco_unitario != null ? String(item.preco_unitario) : '';
    }
    setPrecos(iniciais);
  }, [itensQuery.data]);

  const total = (itensQuery.data ?? []).reduce(
    (soma, item) => soma + (Number(precos[item.id]) || 0) * item.quantidade,
    0,
  );

  async function verFoto(caminho: string | null) {
    if (!caminho) return;
    const url = await urlAssinadaFoto(caminho);
    if (url) window.open(url, '_blank');
  }

  async function imprimirOrcamento() {
    if (!orcamentoSelecionado) return;
    const linhas = (itensQuery.data ?? [])
      .map(
        (item) => `
        <tr>
          <td>${item.produtos_servicos?.nome ?? ''}</td>
          <td>${item.quantidade}</td>
          <td>R$ ${(Number(precos[item.id]) || 0).toFixed(2)}</td>
          <td>R$ ${((Number(precos[item.id]) || 0) * item.quantidade).toFixed(2)}</td>
        </tr>`,
      )
      .join('');

    abrirImpressao(
      `Orçamento ${orcamentoSelecionado.numero_orcamento}`,
      `
      <h1>Orçamento de Manutenção</h1>
      <p class="subtitulo">Q-CVF Medical - Manutenção em Equipamentos Cirúrgicos</p>
      <div class="linha"><div class="rotulo">Nº orçamento</div><div class="valor mono">${orcamentoSelecionado.numero_orcamento}</div></div>
      <div class="linha"><div class="rotulo">OS</div><div class="valor mono">${orcamentoSelecionado.ordens_servico?.numero_os}</div></div>
      <div class="linha"><div class="rotulo">Cliente</div><div class="valor">${orcamentoSelecionado.ordens_servico?.cliente_nome}</div></div>
      <div class="secao">Itens</div>
      <table>
        <thead><tr><th>Item</th><th>Qtd.</th><th>Preço unit.</th><th>Subtotal</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <p style="text-align:right; font-weight:bold; margin-top:12px;">Total: R$ ${total.toFixed(2)}</p>
      <div class="secao">Observações</div>
      <div class="valor">${observacoesFinanceiro || '-'}</div>
      `,
    );
  }

  function compartilhar(vetorEnvio: 'whatsapp' | 'email') {
    if (!orcamentoSelecionado || !clienteQuery.data) return;
    const mensagem = `Olá! Segue o orçamento ${orcamentoSelecionado.numero_orcamento} (OS ${orcamentoSelecionado.ordens_servico?.numero_os}) no valor de R$ ${total.toFixed(2)}. Acompanhe e aprove pelo portal do cliente: ${PORTAL_CLIENTE_URL}`;
    if (vetorEnvio === 'whatsapp') {
      window.open(linkWhatsApp(clienteQuery.data.telefone, mensagem), '_blank');
    } else {
      window.open(
        linkEmail(clienteQuery.data.email, `Q-CVF Medical - Orçamento ${orcamentoSelecionado.numero_orcamento}`, mensagem),
        '_blank',
      );
    }
  }

  async function enviarAoCliente() {
    if (!selecionadoId) return;
    setErro(null);
    setEnviando(true);
    try {
      const orcamento = pendentesQuery.data?.find((o) => o.id === selecionadoId);

      // Persiste todos os preços editados antes de mudar o status.
      for (const item of itensQuery.data ?? []) {
        const valor = precos[item.id];
        const preco = valor ? Number(valor) : null;
        if (preco !== item.preco_unitario) {
          const { error } = await supabase.from('orcamento_itens').update({ preco_unitario: preco }).eq('id', item.id);
          if (error) throw error;
        }
      }

      const { error } = await supabase
        .from('orcamentos')
        .update({
          status: 'Enviado ao Cliente',
          observacoes_financeiro: observacoesFinanceiro || null,
          precificado_por: funcionario?.id ?? null,
          data_envio: new Date().toISOString(),
        })
        .eq('id', selecionadoId);
      if (error) throw error;

      if (orcamento) {
        await supabase
          .from('ordens_servico')
          .update({ status_os: '3. AGUARDANDO APROVAÇÃO DO CLIENTE' })
          .eq('id', orcamento.ordem_servico_id);
      }

      setSelecionadoId(null);
      setObservacoesFinanceiro('');
      qc.invalidateQueries({ queryKey: ['orcamentos-pendentes'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  }

  if (pendentesQuery.isLoading) return <CarregandoTela />;

  return (
    <div>
      <h1>Precificar orçamentos</h1>

      <table className="tabela-crud">
        <thead>
          <tr>
            <th>Nº orçamento</th>
            <th>OS</th>
            <th>Cliente</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(pendentesQuery.data ?? []).map((o) => (
            <tr key={o.id}>
              <td className="mono">{o.numero_orcamento}</td>
              <td className="mono">{o.ordens_servico?.numero_os}</td>
              <td>{o.ordens_servico?.cliente_nome}</td>
              <td className="acoes-tabela">
                <button className="botao-secundario" onClick={() => setSelecionadoId(o.id)}>
                  Precificar
                </button>
              </td>
            </tr>
          ))}
          {(pendentesQuery.data ?? []).length === 0 && (
            <tr>
              <td colSpan={4}>Nenhum orçamento aguardando precificação.</td>
            </tr>
          )}
        </tbody>
      </table>

      {selecionadoId && (
        <div className="modal-fundo" onClick={() => setSelecionadoId(null)}>
          <div className="modal-card" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <h2>Precificar itens</h2>

            <table className="tabela-crud">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qtd.</th>
                  <th>Preço unitário (R$)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(itensQuery.data ?? []).map((item) => (
                  <tr key={item.id}>
                    <td>{item.produtos_servicos?.nome}</td>
                    <td>{item.quantidade}</td>
                    <td>
                      <input
                        type="number"
                        value={precos[item.id] ?? ''}
                        onChange={(e) => setPrecos((p) => ({ ...p, [item.id]: e.target.value }))}
                        style={{ width: 110 }}
                      />
                    </td>
                    <td>
                      {item.foto_peca_danificada_path && (
                        <button className="botao-icone" title="Ver foto da peça" onClick={() => verFoto(item.foto_peca_danificada_path)}>
                          <IconPhoto size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p style={{ textAlign: 'right', fontWeight: 500 }}>Total: R$ {total.toFixed(2)}</p>

            <div className="campo-form">
              <label>Observações do financeiro</label>
              <textarea value={observacoesFinanceiro} onChange={(e) => setObservacoesFinanceiro(e.target.value)} />
            </div>

            {erro && <p className="erro-login">{erro}</p>}

            <div className="modal-acoes" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="botao-secundario" onClick={imprimirOrcamento}>
                  Imprimir
                </button>
                <button className="botao-secundario" onClick={() => compartilhar('whatsapp')}>
                  WhatsApp
                </button>
                <button className="botao-secundario" onClick={() => compartilhar('email')}>
                  E-mail
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="botao-secundario" onClick={() => setSelecionadoId(null)}>
                  Fechar
                </button>
                <button className="botao-primario" onClick={enviarAoCliente} disabled={enviando}>
                  {enviando ? 'Enviando...' : 'Enviar ao cliente'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { gerarNumeroSequencial } from '../../lib/numeroSequencial';
import { mensagemErro } from '../../lib/erros';
import { useAuth } from '../../contexts/AuthContext';
import { formatarMoeda, formatarModeloOtica } from '../../lib/formato';
import { ComboboxBusca } from '../../components/ComboboxBusca';
import { IconPlus, IconTrash } from '@tabler/icons-react';

interface Cliente {
  id: number;
  razao_social: string;
  eh_terceirizado: boolean;
  representante_id: number | null;
}

interface CatalogoOtica {
  id: number;
  fabricante: string;
  modelo: string;
  tipo: string | null;
  diametro_mm: number | null;
  angulo_graus: number | null;
}

interface ProdutoServico {
  id: number;
  nome: string;
  preco_unitario: number | null;
}

interface LinhaItem {
  produto_servico_id: string;
  descricao_servico: string;
  quantidade: string;
  preco_unitario: string;
}

const linhaVazia: LinhaItem = { produto_servico_id: '', descricao_servico: '', quantidade: '1', preco_unitario: '' };

// Tela pra lançar de uma vez só orçamentos que vieram do sistema antigo e
// já foram aprovados pelo cliente lá - sem precisar passar pelas 3 telas
// do fluxo normal (Entrada/Triagem não faz sentido pra dado retroativo,
// técnico e financeiro viram um passo só). Ao salvar, a OS entra
// diretamente em "Orçamentos aprovados", pronta pra "Iniciar manutenção"
// e seguir o fluxo real (montagem, testes, entrega) normalmente.
export function LancamentoRetroativo() {
  const { funcionario } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [clienteId, setClienteId] = useState('');
  const [clienteFinalId, setClienteFinalId] = useState('');
  const [ehOtica, setEhOtica] = useState(false);
  const [catalogoOticaId, setCatalogoOticaId] = useState('');
  const [equipamentoDesc, setEquipamentoDesc] = useState('');
  const [equipamentoFab, setEquipamentoFab] = useState('');
  const [equipamentoSn, setEquipamentoSn] = useState('');
  const [itens, setItens] = useState<LinhaItem[]>([{ ...linhaVazia }]);
  const [desconto, setDesconto] = useState('');
  const [dataAprovacao, setDataAprovacao] = useState(() => new Date().toISOString().slice(0, 10));
  const [justificativa, setJustificativa] = useState('Aprovado no sistema antigo.');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<{ numeroOS: string; numeroOrcamento: string } | null>(null);

  const clientesQuery = useQuery({
    queryKey: ['clientes-opcoes-completo'],
    queryFn: async (): Promise<Cliente[]> => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, razao_social, eh_terceirizado, representante_id')
        .order('razao_social');
      if (error) throw error;
      return data as Cliente[];
    },
  });

  const catalogoQuery = useQuery({
    queryKey: ['catalogo-oticas-opcoes'],
    queryFn: async (): Promise<CatalogoOtica[]> => {
      const { data, error } = await supabase
        .from('catalogo_oticas')
        .select('id, fabricante, modelo, tipo, diametro_mm, angulo_graus')
        .order('fabricante');
      if (error) throw error;
      return data as CatalogoOtica[];
    },
  });

  const produtosQuery = useQuery({
    queryKey: ['produtos-servicos-opcoes'],
    queryFn: async (): Promise<ProdutoServico[]> => {
      const { data, error } = await supabase
        .from('produtos_servicos')
        .select('id, nome, preco_unitario')
        .eq('status_ativo', true)
        .order('nome');
      if (error) throw error;
      return data as ProdutoServico[];
    },
  });

  function preencherDoCatalogo(id: string) {
    const item = catalogoQuery.data?.find((c) => String(c.id) === id);
    if (!item) return;
    setCatalogoOticaId(id);
    setEhOtica(true);
    setEquipamentoFab(item.fabricante);
    setEquipamentoDesc(formatarModeloOtica({ ...item, fabricante: '' }));
  }

  function atualizarItem(i: number, campo: keyof LinhaItem, valor: string) {
    setItens((lista) => {
      const nova = [...lista];
      const linha = { ...nova[i], [campo]: valor };
      if (campo === 'produto_servico_id') {
        const p = produtosQuery.data?.find((pr) => String(pr.id) === valor);
        if (p) {
          linha.descricao_servico = '';
          if (!linha.preco_unitario && p.preco_unitario != null) linha.preco_unitario = String(p.preco_unitario);
        }
      }
      nova[i] = linha;
      return nova;
    });
  }

  function adicionarLinha() {
    setItens((lista) => [...lista, { ...linhaVazia }]);
  }

  function removerLinha(i: number) {
    setItens((lista) => lista.filter((_, idx) => idx !== i));
  }

  const subtotal = itens.reduce((s, it) => s + (Number(it.preco_unitario) || 0) * (Number(it.quantidade) || 0), 0);
  const total = Math.max(subtotal - (Number(desconto) || 0), 0);

  function limparFormulario() {
    setClienteId('');
    setClienteFinalId('');
    setEhOtica(false);
    setCatalogoOticaId('');
    setEquipamentoDesc('');
    setEquipamentoFab('');
    setEquipamentoSn('');
    setItens([{ ...linhaVazia }]);
    setDesconto('');
    setDataAprovacao(new Date().toISOString().slice(0, 10));
    setJustificativa('Aprovado no sistema antigo.');
    setErro(null);
  }

  async function lancar() {
    setErro(null);
    if (!clienteId) {
      setErro('Selecione o cliente.');
      return;
    }
    const itensValidos = itens.filter((it) => it.produto_servico_id || it.descricao_servico.trim());
    if (itensValidos.length === 0) {
      setErro('Adicione ao menos um item ou serviço.');
      return;
    }
    setSalvando(true);
    try {
      const cliente = clientesQuery.data!.find((c) => String(c.id) === clienteId)!;

      const numeroOS = await gerarNumeroSequencial('OS', 'ordens_servico', 'numero_os');
      const { data: os, error: erroOS } = await supabase
        .from('ordens_servico')
        .insert({
          numero_os: numeroOS,
          cliente_id: Number(clienteId),
          cliente_nome: cliente.razao_social,
          cliente_final_id: clienteFinalId ? Number(clienteFinalId) : null,
          optica_desc: equipamentoDesc || null,
          optica_fab: equipamentoFab || null,
          optica_sn: equipamentoSn || null,
          eh_otica: ehOtica,
          catalogo_otica_id: catalogoOticaId ? Number(catalogoOticaId) : null,
          status_os: '1. TRIAGEM / RECEBIMENTO',
        })
        .select('id')
        .single();
      if (erroOS) throw erroOS;

      const numeroOrcamento = await gerarNumeroSequencial('ORC', 'orcamentos', 'numero_orcamento');
      const { data: orcamento, error: erroOrc } = await supabase
        .from('orcamentos')
        .insert({
          numero_orcamento: numeroOrcamento,
          ordem_servico_id: os.id,
          status: 'Aguardando Precificação',
          desconto: Number(desconto) || 0,
        })
        .select('id')
        .single();
      if (erroOrc) throw erroOrc;

      const linhasItens = itensValidos.map((it) => ({
        orcamento_id: orcamento.id,
        produto_servico_id: it.produto_servico_id ? Number(it.produto_servico_id) : null,
        descricao_servico: it.produto_servico_id ? null : it.descricao_servico.trim() || null,
        quantidade: Number(it.quantidade) || 1,
        preco_unitario: it.preco_unitario ? Number(it.preco_unitario) : 0,
      }));
      const { error: erroItens } = await supabase.from('orcamento_itens').insert(linhasItens);
      if (erroItens) throw erroItens;

      // Última atualização, separada: é ela que muda o status pra "Aprovado" e
      // dispara o gatilho que avança a OS pra "4. EM MANUTENÇÃO" - assim o
      // registro aparece certinho em "Orçamentos aprovados".
      const { error: erroAprova } = await supabase
        .from('orcamentos')
        .update({
          status: 'Aprovado',
          aprovacao_manual: true,
          motivo_aprovacao_manual: justificativa.trim() || 'Aprovado no sistema antigo.',
          data_resposta_cliente: new Date(`${dataAprovacao}T12:00:00`).toISOString(),
          aprovado_manualmente_por: funcionario?.id ?? null,
          precificado_por: funcionario?.id ?? null,
        })
        .eq('id', orcamento.id);
      if (erroAprova) throw erroAprova;

      qc.invalidateQueries({ queryKey: ['orcamentos-aprovados'] });
      setSucesso({ numeroOS, numeroOrcamento });
      limparFormulario();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  // Restrita a Administrador: o lançamento cria a OS (permissão Recepção) e
  // o orçamento (permissão Técnico de Laboratório) num só passo - um
  // funcionário só-Financeiro veria a tela mas a gravação falharia no meio
  // por RLS. Administrador tem as três permissões sempre.
  if (funcionario?.nivel_acesso !== 'Administrador') {
    return (
      <div>
        <h1>Lançamento retroativo</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>
          Esta tela é restrita a Administradores (ela cria de uma vez a OS, o orçamento e a aprovação, que juntos
          exigem permissões de Recepção, Técnico de Laboratório e Financeiro).
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1>Lançamento retroativo</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: -8, marginBottom: 16 }}>
        Pra orçamentos que vieram do sistema antigo e já foram aprovados pelo cliente lá - cria a OS e o orçamento já
        como "Aprovado" (sem passar por triagem, envio de e-mail ou portal), pronto pra "Iniciar manutenção" em
        Orçamentos aprovados.
      </p>

      {sucesso && (
        <div
          style={{
            background: 'var(--teal-500-12)',
            border: '1px solid var(--teal-500)',
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          Lançado com sucesso: <strong>{sucesso.numeroOrcamento}</strong> (OS {sucesso.numeroOS}). Já aparece em{' '}
          <button
            className="botao-secundario botao-pequeno"
            style={{ marginLeft: 6 }}
            onClick={() => navigate('/orcamentos-aprovados')}
          >
            Orçamentos aprovados
          </button>
        </div>
      )}

      <div className="campo-form" style={{ maxWidth: 420 }}>
        <label>Cliente *</label>
        <ComboboxBusca
          opcoes={(clientesQuery.data ?? []).map((c) => ({ value: String(c.id), label: c.razao_social }))}
          valor={clienteId}
          onChange={(v) => {
            setClienteId(v);
            setClienteFinalId('');
          }}
        />
      </div>
      {clientesQuery.data?.find((c) => String(c.id) === clienteId)?.eh_terceirizado && (
        <div className="campo-form" style={{ maxWidth: 420 }}>
          <label>Unidade atendida (cliente final)</label>
          <ComboboxBusca
            opcoes={(clientesQuery.data ?? [])
              .filter((c) => c.representante_id === Number(clienteId))
              .map((c) => ({ value: String(c.id), label: c.razao_social }))}
            valor={clienteFinalId}
            onChange={setClienteFinalId}
          />
        </div>
      )}

      <div className="campo-form" style={{ maxWidth: 420 }}>
        <label>Selecionar do catálogo de óticas (opcional)</label>
        <ComboboxBusca
          opcoes={(catalogoQuery.data ?? []).map((c) => ({ value: String(c.id), label: formatarModeloOtica(c) }))}
          valor=""
          onChange={preencherDoCatalogo}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, maxWidth: 620 }}>
        <div className="campo-form" style={{ flex: 2 }}>
          <label>Descrição do equipamento</label>
          <input type="text" value={equipamentoDesc} onChange={(e) => setEquipamentoDesc(e.target.value)} />
        </div>
        <div className="campo-form" style={{ flex: 1 }}>
          <label>Fabricante</label>
          <input type="text" value={equipamentoFab} onChange={(e) => setEquipamentoFab(e.target.value)} />
        </div>
        <div className="campo-form" style={{ flex: 1 }}>
          <label>Nº de série</label>
          <input type="text" value={equipamentoSn} onChange={(e) => setEquipamentoSn(e.target.value)} />
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 16, cursor: 'pointer' }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={ehOtica} onChange={(e) => setEhOtica(e.target.checked)} />
        É uma ótica (habilita os ensaios ISO 8600 no fluxo)
      </label>

      <table className="tabela-crud">
        <thead>
          <tr>
            <th>Produto/serviço</th>
            <th>Ou descrição livre</th>
            <th>Qtd.</th>
            <th>Preço unit. (R$)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {itens.map((it, i) => (
            <tr key={i}>
              <td>
                <ComboboxBusca
                  opcoes={(produtosQuery.data ?? []).map((p) => ({ value: String(p.id), label: p.nome }))}
                  valor={it.produto_servico_id}
                  onChange={(v) => atualizarItem(i, 'produto_servico_id', v)}
                />
              </td>
              <td>
                <input
                  type="text"
                  disabled={!!it.produto_servico_id}
                  value={it.descricao_servico}
                  onChange={(e) => atualizarItem(i, 'descricao_servico', e.target.value)}
                  placeholder="Ex: mão de obra"
                />
              </td>
              <td>
                <input
                  type="number"
                  style={{ width: 70 }}
                  value={it.quantidade}
                  onChange={(e) => atualizarItem(i, 'quantidade', e.target.value)}
                />
              </td>
              <td>
                <input
                  type="number"
                  style={{ width: 110 }}
                  value={it.preco_unitario}
                  onChange={(e) => atualizarItem(i, 'preco_unitario', e.target.value)}
                />
              </td>
              <td className="acoes-tabela">
                <button className="botao-icone perigo" title="Remover" onClick={() => removerLinha(i)} disabled={itens.length === 1}>
                  <IconTrash size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="botao-secundario botao-pequeno" style={{ marginTop: 8 }} onClick={adicionarLinha}>
        <IconPlus size={16} /> Adicionar item
      </button>

      <div style={{ marginTop: 16, marginLeft: 'auto', maxWidth: 320 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-600)' }}>
          <span>Subtotal</span>
          <span>{formatarMoeda(subtotal)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <label style={{ fontSize: 13, color: 'var(--ink-600)', margin: 0 }}>Desconto (R$)</label>
          <input type="number" value={desconto} onChange={(e) => setDesconto(e.target.value)} style={{ width: 120, textAlign: 'right' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
          <span>Total</span>
          <span>{formatarMoeda(total)}</span>
        </div>
      </div>

      <div className="campo-form" style={{ maxWidth: 420, marginTop: 16 }}>
        <label>Data em que foi aprovado (no sistema antigo)</label>
        <input type="date" value={dataAprovacao} onChange={(e) => setDataAprovacao(e.target.value)} />
      </div>
      <div className="campo-form" style={{ maxWidth: 420 }}>
        <label>Justificativa da aprovação manual</label>
        <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
      </div>

      {erro && <p className="erro-login">{erro}</p>}

      <div className="modal-acoes" style={{ justifyContent: 'flex-start' }}>
        <button className="botao-primario" onClick={lancar} disabled={salvando}>
          {salvando ? 'Lançando...' : 'Lançar orçamento aprovado'}
        </button>
      </div>
    </div>
  );
}

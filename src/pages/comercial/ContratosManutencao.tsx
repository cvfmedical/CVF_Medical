import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CrudPage } from '../../components/CrudPage';
import { Badge } from '../../components/Badge';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { IconTrash } from '@tabler/icons-react';

interface ContratoManutencao {
  id: number;
  numero_contrato: string;
  cliente_id: number;
  tipo_contrato: string | null;
  periodicidade_visitas: string | null;
  data_inicio: string;
  data_fim: string | null;
  valor_mensal: number | null;
  forma_pagamento: string | null;
  status: string;
  observacoes: string | null;
}

async function gerarNumeroContrato(): Promise<string> {
  const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const { count } = await supabase
    .from('contratos_manutencao')
    .select('id', { count: 'exact', head: true })
    .like('numero_contrato', `CONT-${hoje}-%`);
  return `CONT-${hoje}-${String((count ?? 0) + 1).padStart(3, '0')}`;
}

function statusExibicao(c: ContratoManutencao): { texto: string; tono: 'copper' | 'teal' | 'danger' | 'neutro' } {
  if (c.status === 'Encerrado') return { texto: 'Encerrado', tono: 'neutro' };
  if (c.status === 'Suspenso') return { texto: 'Suspenso', tono: 'danger' };
  if (c.data_fim && new Date(c.data_fim + 'T00:00:00') < new Date(new Date().toDateString())) {
    return { texto: 'Vencido', tono: 'danger' };
  }
  return { texto: 'Ativo', tono: 'teal' };
}

interface CatalogoOtica {
  id: number;
  fabricante: string;
  modelo: string;
  tipo: string | null;
}

interface PrecoFixo {
  id: number;
  catalogo_otica_id: number;
  valor_fixo: number;
}

export function ContratosManutencao() {
  const qc = useQueryClient();
  const [numeroGerado, setNumeroGerado] = useState('');
  const [contratoPrecos, setContratoPrecos] = useState<ContratoManutencao | null>(null);
  const [catalogoOticaId, setCatalogoOticaId] = useState('');
  const [valorFixoNovo, setValorFixoNovo] = useState('');
  const [erroPrecos, setErroPrecos] = useState<string | null>(null);

  useEffect(() => {
    gerarNumeroContrato().then(setNumeroGerado);
  }, []);

  const clientesQuery = useQuery({
    queryKey: ['clientes-opcoes-contratos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, razao_social').order('razao_social');
      if (error) throw error;
      return data as { id: number; razao_social: string }[];
    },
  });

  const catalogoOticasQuery = useQuery({
    queryKey: ['catalogo-oticas-opcoes-contratos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('catalogo_oticas').select('id, fabricante, modelo, tipo').order('fabricante');
      if (error) throw error;
      return data as CatalogoOtica[];
    },
  });

  const precosFixosQuery = useQuery({
    queryKey: ['contrato-precos-fixos', contratoPrecos?.id],
    enabled: !!contratoPrecos,
    queryFn: async (): Promise<PrecoFixo[]> => {
      const { data, error } = await supabase
        .from('contrato_precos_fixos')
        .select('id, catalogo_otica_id, valor_fixo')
        .eq('contrato_manutencao_id', contratoPrecos!.id);
      if (error) throw error;
      return data as PrecoFixo[];
    },
  });

  function nomeCliente(id: number) {
    return clientesQuery.data?.find((c) => c.id === id)?.razao_social ?? `#${id}`;
  }

  function nomeOtica(catalogoOticaId: number) {
    const o = catalogoOticasQuery.data?.find((c) => c.id === catalogoOticaId);
    return o ? `${o.fabricante} - ${o.modelo}${o.tipo ? ` (${o.tipo})` : ''}` : `#${catalogoOticaId}`;
  }

  function abrirPrecosFixos(c: ContratoManutencao) {
    setContratoPrecos(c);
    setCatalogoOticaId('');
    setValorFixoNovo('');
    setErroPrecos(null);
  }

  async function adicionarPrecoFixo() {
    if (!contratoPrecos) return;
    setErroPrecos(null);
    if (!catalogoOticaId || !valorFixoNovo) {
      setErroPrecos('Selecione o modelo de ótica e informe o valor.');
      return;
    }
    const { error } = await supabase.from('contrato_precos_fixos').insert({
      contrato_manutencao_id: contratoPrecos.id,
      catalogo_otica_id: Number(catalogoOticaId),
      valor_fixo: Number(valorFixoNovo),
    });
    if (error) {
      setErroPrecos(mensagemErro(error));
      return;
    }
    setCatalogoOticaId('');
    setValorFixoNovo('');
    qc.invalidateQueries({ queryKey: ['contrato-precos-fixos', contratoPrecos.id] });
  }

  async function excluirPrecoFixo(id: number) {
    const { error } = await supabase.from('contrato_precos_fixos').delete().eq('id', id);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['contrato-precos-fixos', contratoPrecos?.id] });
  }

  return (
    <>
    <CrudPage<ContratoManutencao>
      titulo="Contratos de manutenção"
      tabela="contratos_manutencao"
      ordenarPor="data_inicio"
      camposFiltro={['numero_contrato']}
      valorInicial={{ status: 'Ativo' }}
      colunas={[
        { chave: 'numero_contrato', label: 'Nº contrato', mono: true },
        { chave: 'cliente_id', label: 'Cliente', render: (r) => nomeCliente(r.cliente_id) },
        { chave: 'tipo_contrato', label: 'Tipo' },
        { chave: 'periodicidade_visitas', label: 'Periodicidade' },
        {
          chave: 'valor_mensal',
          label: 'Valor mensal',
          render: (r) => (r.valor_mensal != null ? `R$ ${Number(r.valor_mensal).toFixed(2)}` : '-'),
        },
        {
          chave: 'data_fim',
          label: 'Vigência até',
          render: (r) => (r.data_fim ? new Date(r.data_fim + 'T00:00:00').toLocaleDateString('pt-BR') : 'Indeterminado'),
        },
        {
          chave: 'status',
          label: 'Status',
          render: (r) => {
            const s = statusExibicao(r);
            return <Badge tono={s.tono}>{s.texto}</Badge>;
          },
        },
        {
          chave: 'precos_fixos',
          label: 'Preços fixos por modelo',
          render: (r) => (
            <button className="botao-secundario botao-pequeno" onClick={() => abrirPrecosFixos(r)}>
              Preços fixos
            </button>
          ),
        },
      ]}
      campos={[
        {
          name: 'cliente_id',
          label: 'Cliente',
          type: 'select',
          obrigatorio: true,
          opcoes: (clientesQuery.data ?? []).map((c) => ({ value: String(c.id), label: c.razao_social })),
        },
        {
          name: 'tipo_contrato',
          label: 'Tipo de contrato',
          type: 'select',
          opcoes: ['Manutenção Preventiva', 'Manutenção Corretiva', 'Preventiva + Corretiva', 'Cobertura Total'],
        },
        {
          name: 'periodicidade_visitas',
          label: 'Periodicidade das visitas',
          type: 'select',
          opcoes: ['Mensal', 'Bimestral', 'Trimestral', 'Semestral', 'Anual', 'Sob demanda'],
        },
        { name: 'data_inicio', label: 'Data de início', type: 'date', obrigatorio: true },
        { name: 'data_fim', label: 'Data de fim (deixe em branco se indeterminado)', type: 'date' },
        { name: 'valor_mensal', label: 'Valor mensal (R$)', type: 'number' },
        { name: 'forma_pagamento', label: 'Forma de pagamento', type: 'text' },
        { name: 'status', label: 'Status', type: 'select', opcoes: ['Ativo', 'Suspenso', 'Encerrado'], obrigatorio: true },
        { name: 'observacoes', label: 'Observações', type: 'textarea' },
      ]}
      validar={(d) => {
        if (!d.cliente_id) return 'Selecione o cliente.';
        if (!d.data_inicio) return 'Informe a data de início.';
        return null;
      }}
      antesDeEnviar={(d) => ({
        ...d,
        cliente_id: Number(d.cliente_id),
        valor_mensal: d.valor_mensal ? Number(d.valor_mensal) : null,
        data_fim: d.data_fim || null,
        numero_contrato: (d as { numero_contrato?: string }).numero_contrato || numeroGerado,
      })}
      aposSalvar={async () => {
        setNumeroGerado(await gerarNumeroContrato());
      }}
    />

    {contratoPrecos && (
      <div className="modal-fundo" onClick={() => setContratoPrecos(null)}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <h2>Preços fixos - {contratoPrecos.numero_contrato}</h2>
          <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>
            {nomeCliente(contratoPrecos.cliente_id)} - preço fechado por modelo de ótica (diferente da mensalidade).
            O financeiro seleciona o modelo na hora de precificar um orçamento desse cliente.
          </p>

          <table className="tabela-crud">
            <thead>
              <tr>
                <th>Modelo de ótica</th>
                <th>Valor fixo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(precosFixosQuery.data ?? []).map((p) => (
                <tr key={p.id}>
                  <td>{nomeOtica(p.catalogo_otica_id)}</td>
                  <td>R$ {Number(p.valor_fixo).toFixed(2)}</td>
                  <td className="acoes-tabela">
                    <button className="botao-icone perigo" title="Remover" onClick={() => excluirPrecoFixo(p.id)}>
                      <IconTrash size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {(precosFixosQuery.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={3}>Nenhum preço fixo cadastrado ainda.</td>
                </tr>
              )}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'flex-end' }}>
            <div className="campo-form" style={{ flex: 1, marginBottom: 0 }}>
              <label>Modelo de ótica</label>
              <select value={catalogoOticaId} onChange={(e) => setCatalogoOticaId(e.target.value)}>
                <option value="">Selecione...</option>
                {(catalogoOticasQuery.data ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.fabricante} - {o.modelo}
                    {o.tipo ? ` (${o.tipo})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo-form" style={{ width: 140, marginBottom: 0 }}>
              <label>Valor fixo (R$)</label>
              <input type="number" value={valorFixoNovo} onChange={(e) => setValorFixoNovo(e.target.value)} />
            </div>
            <button className="botao-secundario" onClick={adicionarPrecoFixo}>
              Adicionar
            </button>
          </div>

          {erroPrecos && <p className="erro-login">{erroPrecos}</p>}

          <div className="modal-acoes">
            <button className="botao-primario" onClick={() => setContratoPrecos(null)}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

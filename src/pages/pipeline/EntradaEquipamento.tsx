import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { enviarArquivoStorage } from '../../lib/storage';
import { useAuth } from '../../contexts/AuthContext';
import { mensagemErro } from '../../lib/erros';
import { Badge } from '../../components/Badge';
import { CarregandoTela } from '../../components/CarregandoTela';
import { IconPlus } from '@tabler/icons-react';

interface Entrada {
  id: number;
  codigo_entrada: string;
  cliente_id: number;
  equipamento_desc: string | null;
  equipamento_fab: string | null;
  equipamento_sn: string | null;
  defeito_relatado: string | null;
  condicao_chegada: string | null;
  status: string;
  ordem_servico_id: number | null;
  data_entrada: string;
}

async function gerarCodigoEntrada(): Promise<string> {
  const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const { count } = await supabase
    .from('entradas_equipamento')
    .select('id', { count: 'exact', head: true })
    .like('codigo_entrada', `ENT-${hoje}-%`);
  return `ENT-${hoje}-${String((count ?? 0) + 1).padStart(3, '0')}`;
}

export function EntradaEquipamento() {
  const { funcionario } = useAuth();
  const qc = useQueryClient();
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [form, setForm] = useState({
    cliente_id: '',
    equipamento_desc: '',
    equipamento_fab: '',
    equipamento_sn: '',
    defeito_relatado: '',
    condicao_chegada: '',
  });

  const clientesQuery = useQuery({
    queryKey: ['clientes-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, razao_social').order('razao_social');
      if (error) throw error;
      return data as { id: number; razao_social: string }[];
    },
  });

  const entradasQuery = useQuery({
    queryKey: ['entradas_equipamento'],
    queryFn: async (): Promise<Entrada[]> => {
      const { data, error } = await supabase
        .from('entradas_equipamento')
        .select('*')
        .order('data_entrada', { ascending: false });
      if (error) throw error;
      return data as Entrada[];
    },
  });

  function nomeCliente(id: number) {
    return clientesQuery.data?.find((c) => c.id === id)?.razao_social ?? `#${id}`;
  }

  async function salvar() {
    setErro(null);
    if (!form.cliente_id) {
      setErro('Selecione o cliente.');
      return;
    }
    setSalvando(true);
    try {
      const codigo = await gerarCodigoEntrada();
      const { data: inserida, error } = await supabase
        .from('entradas_equipamento')
        .insert({
          codigo_entrada: codigo,
          cliente_id: Number(form.cliente_id),
          equipamento_desc: form.equipamento_desc || null,
          equipamento_fab: form.equipamento_fab || null,
          equipamento_sn: form.equipamento_sn || null,
          defeito_relatado: form.defeito_relatado || null,
          condicao_chegada: form.condicao_chegada || null,
          recebido_por: funcionario?.id ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;

      if (foto && inserida) {
        const caminho = await enviarArquivoStorage(`entrada_${inserida.id}`, foto);
        await supabase.from('fotos_entrada').insert({ entrada_id: inserida.id, storage_path: caminho });
      }

      setModalAberto(false);
      setForm({
        cliente_id: '',
        equipamento_desc: '',
        equipamento_fab: '',
        equipamento_sn: '',
        defeito_relatado: '',
        condicao_chegada: '',
      });
      setFoto(null);
      qc.invalidateQueries({ queryKey: ['entradas_equipamento'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  if (entradasQuery.isLoading || clientesQuery.isLoading) return <CarregandoTela />;

  return (
    <div>
      <div className="crud-cabecalho">
        <h1>Entrada do equipamento</h1>
        <button className="botao-primario botao-pequeno" onClick={() => setModalAberto(true)}>
          <IconPlus size={16} /> Nova entrada
        </button>
      </div>

      <table className="tabela-crud">
        <thead>
          <tr>
            <th>Código</th>
            <th>Cliente</th>
            <th>Equipamento</th>
            <th>Nº de série</th>
            <th>Status</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody>
          {(entradasQuery.data ?? []).map((e) => (
            <tr key={e.id}>
              <td className="mono">{e.codigo_entrada}</td>
              <td>{nomeCliente(e.cliente_id)}</td>
              <td>{e.equipamento_desc}</td>
              <td className="mono">{e.equipamento_sn}</td>
              <td>
                <Badge tono={e.ordem_servico_id ? 'teal' : 'copper'}>
                  {e.ordem_servico_id ? 'Convertida em OS' : e.status}
                </Badge>
              </td>
              <td>{new Date(e.data_entrada).toLocaleDateString('pt-BR')}</td>
            </tr>
          ))}
          {(entradasQuery.data ?? []).length === 0 && (
            <tr>
              <td colSpan={6}>Nenhum registro encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>

      {modalAberto && (
        <div className="modal-fundo" onClick={() => setModalAberto(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Nova entrada</h2>

            <div className="campo-form">
              <label>Cliente *</label>
              <select value={form.cliente_id} onChange={(e) => setForm((f) => ({ ...f, cliente_id: e.target.value }))}>
                <option value="">Selecione...</option>
                {(clientesQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.razao_social}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo-form">
              <label>Descrição do equipamento</label>
              <input
                type="text"
                value={form.equipamento_desc}
                onChange={(e) => setForm((f) => ({ ...f, equipamento_desc: e.target.value }))}
              />
            </div>
            <div className="campo-form">
              <label>Fabricante</label>
              <input
                type="text"
                value={form.equipamento_fab}
                onChange={(e) => setForm((f) => ({ ...f, equipamento_fab: e.target.value }))}
              />
            </div>
            <div className="campo-form">
              <label>Número de série</label>
              <input
                type="text"
                value={form.equipamento_sn}
                onChange={(e) => setForm((f) => ({ ...f, equipamento_sn: e.target.value }))}
              />
            </div>
            <div className="campo-form">
              <label>Defeito relatado</label>
              <textarea
                value={form.defeito_relatado}
                onChange={(e) => setForm((f) => ({ ...f, defeito_relatado: e.target.value }))}
              />
            </div>
            <div className="campo-form">
              <label>Condição de chegada</label>
              <textarea
                value={form.condicao_chegada}
                onChange={(e) => setForm((f) => ({ ...f, condicao_chegada: e.target.value }))}
              />
            </div>
            <div className="campo-form">
              <label>Foto (opcional)</label>
              <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
            </div>

            {erro && <p className="erro-login">{erro}</p>}

            <div className="modal-acoes">
              <button className="botao-secundario" onClick={() => setModalAberto(false)} disabled={salvando}>
                Cancelar
              </button>
              <button className="botao-primario" onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

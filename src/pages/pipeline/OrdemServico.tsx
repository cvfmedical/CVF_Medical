import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { STATUS_OS_ORDENADOS } from '../../lib/statusOS';

const CHECKLIST_AVARIAS = [
  { key: 'tubo_amassado', label: 'Tubo de inox amassado / deformado' },
  { key: 'cristal_trincado', label: 'Lente distal / cristal trincado ou riscado' },
  { key: 'fibra_queimada', label: 'Guia de luz / fibras com queimaduras' },
  { key: 'ocular_solta', label: 'Ocular / acoplador com folga ou danificado' },
  { key: 'umidade_interna', label: 'Infiltração de umidade / fungos visíveis' },
] as const;

async function gerarNumeroOS(): Promise<string> {
  const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const { count } = await supabase
    .from('ordens_servico')
    .select('id', { count: 'exact', head: true })
    .like('numero_os', `OS-${hoje}-%`);
  return `OS-${hoje}-${String((count ?? 0) + 1).padStart(3, '0')}`;
}

export function OrdemServico() {
  const navigate = useNavigate();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [form, setForm] = useState({
    cliente_id: '',
    optica_desc: '',
    optica_fab: '',
    optica_sn: '',
    defeito_relatado: '',
    status_os: STATUS_OS_ORDENADOS[0] as string,
  });
  const [avarias, setAvarias] = useState<Record<string, boolean>>({});

  const clientesQuery = useQuery({
    queryKey: ['clientes-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, razao_social').order('razao_social');
      if (error) throw error;
      return data as { id: number; razao_social: string }[];
    },
  });

  async function salvar() {
    setErro(null);
    setSucesso(null);
    if (!form.cliente_id) {
      setErro('Selecione o cliente.');
      return;
    }
    const cliente = clientesQuery.data?.find((c) => c.id === Number(form.cliente_id));
    setSalvando(true);
    try {
      const numeroOS = await gerarNumeroOS();
      const { error } = await supabase.from('ordens_servico').insert({
        numero_os: numeroOS,
        cliente_id: Number(form.cliente_id),
        cliente_nome: cliente?.razao_social ?? '',
        optica_desc: form.optica_desc || null,
        optica_fab: form.optica_fab || null,
        optica_sn: form.optica_sn || null,
        defeito_relatado: form.defeito_relatado || null,
        status_os: form.status_os,
        triagem_avarias: avarias,
      });
      if (error) throw error;
      setSucesso(`OS ${numeroOS} criada com sucesso.`);
      setTimeout(() => navigate('/fila-triagem'), 1200);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h1>Abrir nova OS</h1>

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
          value={form.optica_desc}
          onChange={(e) => setForm((f) => ({ ...f, optica_desc: e.target.value }))}
        />
      </div>
      <div className="campo-form">
        <label>Fabricante</label>
        <input
          type="text"
          value={form.optica_fab}
          onChange={(e) => setForm((f) => ({ ...f, optica_fab: e.target.value }))}
        />
      </div>
      <div className="campo-form">
        <label>Número de série</label>
        <input
          type="text"
          value={form.optica_sn}
          onChange={(e) => setForm((f) => ({ ...f, optica_sn: e.target.value }))}
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
        <label>Checklist de avarias na triagem</label>
        {CHECKLIST_AVARIAS.map((item) => (
          <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input
              type="checkbox"
              checked={Boolean(avarias[item.key])}
              onChange={(e) => setAvarias((a) => ({ ...a, [item.key]: e.target.checked }))}
            />
            <span style={{ fontSize: 13 }}>{item.label}</span>
          </div>
        ))}
      </div>

      <div className="campo-form">
        <label>Status inicial no workflow</label>
        <select value={form.status_os} onChange={(e) => setForm((f) => ({ ...f, status_os: e.target.value }))}>
          {STATUS_OS_ORDENADOS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {erro && <p className="erro-login">{erro}</p>}
      {sucesso && <p style={{ color: 'var(--teal-800)', fontSize: 13 }}>{sucesso}</p>}

      <button className="botao-primario botao-pequeno" onClick={salvar} disabled={salvando}>
        {salvando ? 'Salvando...' : 'Abrir OS'}
      </button>
    </div>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { STATUS_OS_ORDENADOS } from '../../lib/statusOS';
import { gerarNumeroSequencial } from '../../lib/numeroSequencial';

async function gerarNumeroOS(): Promise<string> {
  return gerarNumeroSequencial('OS', 'ordens_servico', 'numero_os');
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
    prazo_entrega: '7 dias',
    status_os: STATUS_OS_ORDENADOS[0] as string,
  });

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
        prazo_entrega: form.prazo_entrega || null,
        status_os: form.status_os,
      });
      if (error) throw error;
      setSucesso(`OS ${numeroOS} criada com sucesso.`);
      setTimeout(() => navigate('/ordens-servico'), 1200);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h1>Abrir nova OS</h1>
      <p style={{ fontSize: 12, color: 'var(--ink-400)', marginBottom: 16 }}>
        Use esta tela só quando não existe uma Entrada do Equipamento prévia (ex: solicitação recebida por
        telefone). O caminho normal é: Entrada do equipamento → "Converter em OS" — o checklist de avarias é
        preenchido lá.
      </p>

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
        <label>Prazo de entrega</label>
        <input
          type="text"
          value={form.prazo_entrega}
          onChange={(e) => setForm((f) => ({ ...f, prazo_entrega: e.target.value }))}
        />
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

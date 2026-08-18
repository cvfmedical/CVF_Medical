import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { Badge } from '../../components/Badge';
import { CarregandoTela } from '../../components/CarregandoTela';
import { tonoDoStatusOS } from '../../lib/statusOS';

// Tela aberta ao escanear o QR Code da etiqueta de rastreio (impressa no
// Recebimento/Triagem) - mostra rapidamente, pra quem pegou o equipamento
// na bancada, a qual Entrada/OS/Orçamento ele pertence e o status atual.
// Só leitura, protegida pelo login normal do sistema (RequireAuth).
interface Dados {
  codigo_entrada: string;
  cliente_nome: string;
  equipamento_desc: string | null;
  equipamento_fab: string | null;
  equipamento_sn: string | null;
  data_entrada: string;
  ordem_servico_id: number | null;
  os: { numero_os: string; status_os: string } | null;
  orcamento: { numero_orcamento: string; status: string } | null;
}

export function RastreioEquipamento() {
  const { codigo } = useParams<{ codigo: string }>();

  const query = useQuery({
    queryKey: ['rastreio-equipamento', codigo],
    enabled: !!codigo,
    queryFn: async (): Promise<Dados | null> => {
      const { data: entrada, error } = await supabase
        .from('entradas_equipamento')
        .select(
          'codigo_entrada, equipamento_desc, equipamento_fab, equipamento_sn, data_entrada, ordem_servico_id, cliente_id',
        )
        .eq('codigo_entrada', codigo)
        .maybeSingle();
      if (error) throw error;
      if (!entrada) return null;

      const { data: cliente } = await supabase
        .from('clientes')
        .select('razao_social')
        .eq('id', entrada.cliente_id)
        .maybeSingle();

      let os: Dados['os'] = null;
      let orcamento: Dados['orcamento'] = null;
      if (entrada.ordem_servico_id) {
        const { data: osData } = await supabase
          .from('ordens_servico')
          .select('numero_os, status_os')
          .eq('id', entrada.ordem_servico_id)
          .maybeSingle();
        os = osData ?? null;

        const { data: orcData } = await supabase
          .from('orcamentos')
          .select('numero_orcamento, status')
          .eq('ordem_servico_id', entrada.ordem_servico_id)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle();
        orcamento = orcData ?? null;
      }

      return {
        codigo_entrada: entrada.codigo_entrada,
        cliente_nome: cliente?.razao_social ?? '-',
        equipamento_desc: entrada.equipamento_desc,
        equipamento_fab: entrada.equipamento_fab,
        equipamento_sn: entrada.equipamento_sn,
        data_entrada: entrada.data_entrada,
        ordem_servico_id: entrada.ordem_servico_id,
        os,
        orcamento,
      };
    },
  });

  if (query.isLoading) return <CarregandoTela />;

  if (!query.data) {
    return (
      <div>
        <h1>Rastreio do equipamento</h1>
        <p>Nenhuma entrada encontrada com o código "{codigo}".</p>
      </div>
    );
  }

  const d = query.data;

  return (
    <div>
      <h1>Rastreio do equipamento</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: -8, marginBottom: 16 }}>
        Aberto pela etiqueta de rastreio - mostra rapidamente a qual Entrada/OS/Orçamento este equipamento pertence.
      </p>

      <div
        style={{
          background: 'var(--paper-50)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 16,
          maxWidth: 480,
        }}
      >
        <div className="campo-form">
          <label>Entrada</label>
          <p className="mono">{d.codigo_entrada}</p>
        </div>
        <div className="campo-form">
          <label>Cliente</label>
          <p>{d.cliente_nome}</p>
        </div>
        <div className="campo-form">
          <label>Equipamento</label>
          <p>
            {d.equipamento_desc} {d.equipamento_fab ? `(${d.equipamento_fab})` : ''}
            {d.equipamento_sn ? <> - <span className="mono">{d.equipamento_sn}</span></> : ''}
          </p>
        </div>
        <div className="campo-form">
          <label>Data de entrada</label>
          <p>{new Date(d.data_entrada).toLocaleDateString('pt-BR')}</p>
        </div>
        <div className="campo-form">
          <label>Ordem de serviço</label>
          {d.os ? (
            <p className="mono">
              {d.os.numero_os} <Badge tono={tonoDoStatusOS(d.os.status_os)}>{d.os.status_os}</Badge>
            </p>
          ) : (
            <p style={{ color: 'var(--ink-400)' }}>Ainda não convertida em OS.</p>
          )}
        </div>
        {d.orcamento && (
          <div className="campo-form">
            <label>Orçamento</label>
            <p className="mono">
              {d.orcamento.numero_orcamento} <Badge tono="neutro">{d.orcamento.status}</Badge>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

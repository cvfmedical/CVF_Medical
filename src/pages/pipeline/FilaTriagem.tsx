import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { STATUS_OS_ORDENADOS } from '../../lib/statusOS';
import { CarregandoTela } from '../../components/CarregandoTela';

interface OrdemServico {
  id: number;
  numero_os: string;
  cliente_nome: string;
  optica_desc: string | null;
  optica_sn: string | null;
  status_os: string | null;
  data_abertura: string;
}

export function FilaTriagem() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['fila-triagem'],
    queryFn: async (): Promise<OrdemServico[]> => {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('id, numero_os, cliente_nome, optica_desc, optica_sn, status_os, data_abertura')
        .not('status_os', 'like', '11.%')
        .order('data_abertura', { ascending: true });
      if (error) throw error;
      return data as OrdemServico[];
    },
  });

  async function mudarStatus(id: number, novoStatus: string) {
    const { error } = await supabase.from('ordens_servico').update({ status_os: novoStatus }).eq('id', id);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['fila-triagem'] });
  }

  if (query.isLoading) return <CarregandoTela />;

  return (
    <div>
      <h1>Fila de triagem</h1>
      <table className="tabela-crud">
        <thead>
          <tr>
            <th>Nº OS</th>
            <th>Cliente</th>
            <th>Equipamento</th>
            <th>Nº de série</th>
            <th>Status</th>
            <th>Aberta em</th>
          </tr>
        </thead>
        <tbody>
          {(query.data ?? []).map((os) => (
            <tr key={os.id}>
              <td className="mono">{os.numero_os}</td>
              <td>{os.cliente_nome}</td>
              <td>{os.optica_desc}</td>
              <td className="mono">{os.optica_sn}</td>
              <td>
                <select value={os.status_os ?? ''} onChange={(e) => mudarStatus(os.id, e.target.value)}>
                  {STATUS_OS_ORDENADOS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </td>
              <td>{new Date(os.data_abertura).toLocaleDateString('pt-BR')}</td>
            </tr>
          ))}
          {(query.data ?? []).length === 0 && (
            <tr>
              <td colSpan={6}>Nenhuma OS pendente.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

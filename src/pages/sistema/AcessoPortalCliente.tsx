import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { Badge } from '../../components/Badge';
import { CarregandoTela } from '../../components/CarregandoTela';

interface Cliente {
  id: number;
  razao_social: string;
  email: string | null;
  auth_user_id: string | null;
}

export function AcessoPortalCliente() {
  const qc = useQueryClient();
  const [convidando, setConvidando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');

  const query = useQuery({
    queryKey: ['clientes-acesso-portal'],
    queryFn: async (): Promise<Cliente[]> => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, razao_social, email, auth_user_id')
        .order('razao_social');
      if (error) throw error;
      return data as Cliente[];
    },
  });

  const linhas = (query.data ?? []).filter((c) => !filtro.trim() || c.razao_social.toLowerCase().includes(filtro.trim().toLowerCase()));

  async function convidar(c: Cliente) {
    setErro(null);
    if (!c.email) {
      setErro(`${c.razao_social} não tem e-mail cadastrado - edite o cliente em "Clientes / hospitais" antes de convidar.`);
      return;
    }
    if (!confirm(`Enviar convite de acesso ao portal para ${c.razao_social} (${c.email})?`)) return;
    setConvidando(c.id);
    try {
      const { data, error } = await supabase.functions.invoke('convidar-cliente', {
        body: { cliente_id: c.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      qc.invalidateQueries({ queryKey: ['clientes-acesso-portal'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setConvidando(null);
    }
  }

  if (query.isLoading) return <CarregandoTela />;

  return (
    <div>
      <h1>Acesso portal do cliente</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: -8, marginBottom: 16 }}>
        O convite envia um e-mail com um link para o cliente definir a própria senha de acesso ao portal.
      </p>

      <input className="campo-filtro" placeholder="Buscar cliente..." value={filtro} onChange={(e) => setFiltro(e.target.value)} />

      {erro && <p className="erro-login">{erro}</p>}

      <table className="tabela-crud">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>E-mail</th>
            <th>Acesso ao portal</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((c) => (
            <tr key={c.id}>
              <td>{c.razao_social}</td>
              <td>{c.email || '-'}</td>
              <td>
                <Badge tono={c.auth_user_id ? 'teal' : 'copper'}>{c.auth_user_id ? 'Vinculado' : 'Sem acesso'}</Badge>
              </td>
              <td className="acoes-tabela">
                {!c.auth_user_id && (
                  <button className="botao-secundario" disabled={convidando === c.id} onClick={() => convidar(c)}>
                    {convidando === c.id ? 'Enviando...' : 'Convidar'}
                  </button>
                )}
              </td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={4}>Nenhum cliente encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

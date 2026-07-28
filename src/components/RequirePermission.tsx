import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { Categoria } from '../lib/permissions';

// Equivalente web de main_dashboard.py só renderizar o botao do menu
// quando tem_permissao(categoria) é true - mas aqui cobre tambem acesso
// direto por URL, que o Tkinter nunca precisou considerar.
//
// IMPORTANTE: isto é só UX (some com a tela, mostra aviso). A autorização
// de verdade é sempre a política RLS no Postgres (007/008 SQL) - ver
// nota no plano de migração.
export function RequirePermission({
  categoria,
  children,
}: {
  categoria: Categoria;
  children: ReactNode;
}) {
  const { temPermissao, funcionario } = useAuth();

  if (!funcionario) return <div className="tela-carregando">Carregando...</div>;

  if (!temPermissao(categoria)) {
    return (
      <div className="aviso-sem-permissao">
        <h2>Acesso não permitido</h2>
        <p>Seu cargo ({funcionario.nivel_acesso}) não tem acesso a esta área do sistema.</p>
      </div>
    );
  }

  return <>{children}</>;
}

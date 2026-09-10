import { useAuth } from '../contexts/AuthContext';
import type { Categoria } from '../lib/permissions';
import { CarregandoTela } from '../components/CarregandoTela';

interface DefinicaoAlerta {
  chave: string;
  label: string;
  // null = sem gate de permissão (chat interno, qualquer funcionário vê).
  categoria: Categoria | null;
}

// Espelha os 7 componentes de src/components/Alerta*.tsx - mesma chave
// (useRegistrarAlertaAtivo) e o mesmo texto de "descricao" de cada um.
const ALERTAS: DefinicaoAlerta[] = [
  { chave: 'orcamentos-pendentes', label: 'Orçamento(s) aguardando precificação', categoria: 'financeiro' },
  { chave: 'os-aguardando-orcamento', label: 'OS(s) aguardando orçamento', categoria: 'laboratorio_qualidade' },
  { chave: 'orcamentos-aprovados', label: 'Orçamento(s) aprovado(s) aguardando manutenção', categoria: 'laboratorio_qualidade' },
  { chave: 'faturamento-liberado', label: 'Orçamento(s) liberado(s) para faturamento', categoria: 'financeiro' },
  { chave: 'email-falhou', label: 'E-mail(s) de orçamento não entregue(s)', categoria: 'financeiro' },
  { chave: 'contas-pagar-hoje', label: 'Conta(s) a pagar vencendo hoje', categoria: 'financeiro' },
  { chave: 'chat-nova-mensagem', label: 'Nova(s) mensagem(ns) no chat', categoria: null },
];

// Permite que cada funcionário escolha quais dos alertas flutuantes
// (AlertasFlutuantes.tsx, canto da tela) quer ver. Só oferece os alertas
// que o papel do funcionário poderia ver de qualquer forma (mesmo gate de
// permissão que cada Alerta*.tsx já usa) - não faz sentido mostrar o
// toggle de um alerta que essa pessoa nunca veria de todo jeito.
export function PreferenciasAlertas() {
  const { temPermissao, alertaVisivel, alertasOcultosCarregado, definirVisibilidadeAlerta } = useAuth();

  if (!alertasOcultosCarregado) return <CarregandoTela />;

  const alertasDoUsuario = ALERTAS.filter((a) => a.categoria === null || temPermissao(a.categoria));

  return (
    <div>
      <div className="crud-cabecalho">
        <h1>Preferências de alertas</h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: -8, marginBottom: 16 }}>
        Escolha quais avisos flutuantes você quer ver no canto da tela enquanto usa o sistema. Desmarcar um alerta
        aqui não afeta os outros usuários, só a sua própria tela.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {alertasDoUsuario.map((a) => (
          <label key={a.chave} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
            <input
              type="checkbox"
              checked={alertaVisivel(a.chave)}
              onChange={(e) => definirVisibilidadeAlerta(a.chave, e.target.checked)}
            />
            {a.label}
          </label>
        ))}
        {alertasDoUsuario.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>Nenhum alerta disponível para o seu perfil.</p>
        )}
      </div>
    </div>
  );
}

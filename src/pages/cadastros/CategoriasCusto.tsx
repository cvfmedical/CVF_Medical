import { CrudPage } from '../../components/CrudPage';

interface CategoriaCusto {
  id: number;
  nome: string;
}

// Categorias usadas em Contas a Pagar (Financeiro) - lista aberta: além de
// cadastrar aqui, também dá pra digitar uma categoria nova direto no
// lançamento (ela entra automaticamente nessa lista).
export function CategoriasCusto() {
  return (
    <CrudPage<CategoriaCusto>
      titulo="Categorias de custo"
      tabela="categorias_custo"
      colunas={[{ chave: 'nome', label: 'Nome' }]}
      campos={[{ name: 'nome', label: 'Nome', type: 'text', obrigatorio: true }]}
      validar={(d) => (!d.nome ? 'Informe o nome da categoria.' : null)}
    />
  );
}

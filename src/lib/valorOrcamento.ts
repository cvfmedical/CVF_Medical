// Total "de verdade" de um orçamento aprovado, considerando desconto e
// bonificação - usado em toda tela que precisa mostrar/somar o valor de
// orçamentos que AINDA NÃO viraram conta a receber (depois de lançada a
// conta, o valor gravado nela já é o final, com desconto aplicado).
// Mesma fórmula usada em OrcamentoFinanceiro.tsx (onde desconto/bonificação
// são definidos) - sem isso, telas que só somam os itens mostram o valor
// CHEIO, sem descontar o que foi negociado com o cliente.
export interface OrcamentoParaTotal {
  valor_fixo_contrato: number | null;
  desconto?: number | null;
  bonificacao?: boolean | null;
  orcamento_itens: { preco_unitario: number | null; quantidade: number }[];
}

export function totalOrcamento(o: OrcamentoParaTotal): number {
  if (o.bonificacao) return 0;
  const subtotal =
    o.valor_fixo_contrato ?? o.orcamento_itens.reduce((s, i) => s + (i.preco_unitario ?? 0) * i.quantidade, 0);
  return Math.max(subtotal - (o.desconto ?? 0), 0);
}

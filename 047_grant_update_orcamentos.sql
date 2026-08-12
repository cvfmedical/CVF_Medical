-- Correção: o papel `authenticated` tinha SELECT/INSERT/DELETE mas NÃO tinha
-- UPDATE em orcamentos/orcamento_itens. As policies de UPDATE (precificação)
-- existiam, mas sem o GRANT de tabela o Postgres barrava com
-- "permission denied for table orcamentos" (42501) - o que aparecia no app
-- como "Seu cargo não tem permissão". A RLS continua governando QUAIS linhas
-- cada cargo pode alterar; o GRANT só libera o comando UPDATE no nível da tabela.

GRANT UPDATE ON public.orcamentos TO authenticated;
GRANT UPDATE ON public.orcamento_itens TO authenticated;

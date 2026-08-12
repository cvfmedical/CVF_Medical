-- Novos padrões das condições comerciais do orçamento.
-- Valem para orçamentos NOVOS (default da coluna). Os já enviados/aprovados
-- não são alterados, para não reescrever propostas que já foram ao cliente.

ALTER TABLE orcamentos ALTER COLUMN validade_proposta SET DEFAULT '10 dias';
ALTER TABLE orcamentos ALTER COLUMN condicoes_pagamento SET DEFAULT '28 DDL';
ALTER TABLE orcamentos ALTER COLUMN prazo_entrega SET DEFAULT '3 dias';

-- Atualiza apenas os orçamentos ainda em precificação (não enviados) que
-- continuam com o texto padrão antigo, para já refletirem o novo padrão.
UPDATE orcamentos
   SET validade_proposta = '10 dias'
 WHERE status = 'Aguardando Precificação'
   AND validade_proposta = '30 dias após a emissão da proposta.';

UPDATE orcamentos
   SET condicoes_pagamento = '28 DDL'
 WHERE status = 'Aguardando Precificação'
   AND condicoes_pagamento = '50% de sinal; 50% em 15 DDL no faturamento.';

UPDATE orcamentos
   SET prazo_entrega = '3 dias'
 WHERE status = 'Aguardando Precificação'
   AND prazo_entrega = '45 dias após a confirmação do recebimento do sinal.';

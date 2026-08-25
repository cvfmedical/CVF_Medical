import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabaseClient';

// Garantia padrão da CVF Medical: 90 dias a partir da devolução do
// equipamento (mesmo texto impresso no orçamento - GARANTIA_CVF.resumo em
// formato.ts). Só conta reparo de verdade (orçamento aprovado) - uma
// devolução sem reparo (orçamento recusado) não gera garantia.
export const DIAS_GARANTIA = 90;

export interface GarantiaAtiva {
  ordemServicoId: number;
  numeroOS: string;
  dataEntrega: string;
  garantiaAte: string;
  diasRestantes: number;
}

function calcularGarantiaAte(dataEntrega: string): Date {
  const ate = new Date(dataEntrega);
  ate.setDate(ate.getDate() + DIAS_GARANTIA);
  return ate;
}

interface LinhaBrutaGarantia {
  data_entrega: string;
  ordens_servico: { id: number; numero_os: string } | null;
}

// Busca a garantia ativa (se houver) de um equipamento pra um cliente,
// olhando o histórico de entregas já feitas - usada tanto pro alerta
// espalhado pelo fluxo (Entrada/Orçamento/Precificação) quanto pela tela
// "Garantias ativas". `ordemServicoIdAtual` exclui a própria OS em edição
// (não faz sentido uma OS "estar em garantia dela mesma").
export function useGarantiaEquipamento(
  clienteId: number | null | undefined,
  numeroSerie: string | null | undefined,
  ordemServicoIdAtual?: number | null,
) {
  return useQuery({
    queryKey: ['garantia-equipamento', clienteId, numeroSerie, ordemServicoIdAtual],
    enabled: !!clienteId && !!numeroSerie,
    queryFn: async (): Promise<GarantiaAtiva | null> => {
      const { data, error } = await supabase
        .from('entregas')
        .select('data_entrega, ordens_servico!inner(id, numero_os, optica_sn, cliente_id, orcamentos!inner(status))')
        .eq('ordens_servico.optica_sn', numeroSerie!)
        .eq('ordens_servico.cliente_id', clienteId!)
        .eq('ordens_servico.orcamentos.status', 'Aprovado')
        .not('data_entrega', 'is', null)
        .order('data_entrega', { ascending: false })
        .limit(10);
      if (error) throw error;
      const hoje = new Date();
      for (const linha of (data ?? []) as unknown as LinhaBrutaGarantia[]) {
        const os = linha.ordens_servico;
        if (!os || os.id === ordemServicoIdAtual) continue;
        const garantiaAte = calcularGarantiaAte(linha.data_entrega);
        if (garantiaAte < hoje) break; // ordenado do mais recente - os próximos são mais antigos ainda
        const diasRestantes = Math.ceil((garantiaAte.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
        return {
          ordemServicoId: os.id,
          numeroOS: os.numero_os,
          dataEntrega: linha.data_entrega,
          garantiaAte: garantiaAte.toISOString().slice(0, 10),
          diasRestantes,
        };
      }
      return null;
    },
  });
}

export interface LinhaGarantiaAtiva extends GarantiaAtiva {
  clienteId: number;
  clienteNome: string;
  equipamentoDesc: string | null;
  equipamentoFab: string | null;
  numeroSerie: string | null;
}

interface LinhaBrutaGarantiaLista {
  data_entrega: string;
  ordens_servico: {
    id: number;
    numero_os: string;
    cliente_id: number;
    cliente_nome: string;
    optica_desc: string | null;
    optica_fab: string | null;
    optica_sn: string | null;
  } | null;
}

// Lista completa de garantias ativas agora (tela "Garantias ativas") -
// mesma regra do alerta individual, só que sem filtrar por um cliente/
// equipamento específico. Só busca entregas dos últimos 90 dias (fora
// disso a garantia já venceu de qualquer jeito), ordenado de quem vence
// primeiro pra quem vence por último.
export function useGarantiasAtivas() {
  return useQuery({
    queryKey: ['garantias-ativas'],
    queryFn: async (): Promise<LinhaGarantiaAtiva[]> => {
      const cortes = new Date();
      cortes.setDate(cortes.getDate() - DIAS_GARANTIA);
      const { data, error } = await supabase
        .from('entregas')
        .select(
          'data_entrega, ordens_servico!inner(id, numero_os, cliente_id, cliente_nome, optica_desc, optica_fab, optica_sn, orcamentos!inner(status))',
        )
        .eq('ordens_servico.orcamentos.status', 'Aprovado')
        .gte('data_entrega', cortes.toISOString().slice(0, 10))
        .order('data_entrega', { ascending: false });
      if (error) throw error;
      const hoje = new Date();
      const linhas: LinhaGarantiaAtiva[] = [];
      for (const linha of (data ?? []) as unknown as LinhaBrutaGarantiaLista[]) {
        const os = linha.ordens_servico;
        if (!os) continue;
        const garantiaAte = calcularGarantiaAte(linha.data_entrega);
        if (garantiaAte < hoje) continue;
        const diasRestantes = Math.ceil((garantiaAte.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
        linhas.push({
          ordemServicoId: os.id,
          numeroOS: os.numero_os,
          dataEntrega: linha.data_entrega,
          garantiaAte: garantiaAte.toISOString().slice(0, 10),
          diasRestantes,
          clienteId: os.cliente_id,
          clienteNome: os.cliente_nome,
          equipamentoDesc: os.optica_desc,
          equipamentoFab: os.optica_fab,
          numeroSerie: os.optica_sn,
        });
      }
      linhas.sort((a, b) => a.diasRestantes - b.diasRestantes);
      return linhas;
    },
  });
}

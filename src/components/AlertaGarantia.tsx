import { useGarantiaEquipamento } from '../lib/garantia';

// Banner de alerta espalhado pelo fluxo (Entrada, Orçamento técnico,
// Precificação) - avisa quando o equipamento (mesmo cliente + nº de
// série) já teve um reparo aprovado cuja garantia de 90 dias ainda não
// venceu, pra ninguém na cadeia cobrar de novo por algo coberto.
export function AlertaGarantia({
  clienteId,
  numeroSerie,
  ordemServicoIdAtual,
}: {
  clienteId: number | null | undefined;
  numeroSerie: string | null | undefined;
  ordemServicoIdAtual?: number | null;
}) {
  const { data: garantia } = useGarantiaEquipamento(clienteId, numeroSerie, ordemServicoIdAtual);
  if (!garantia) return null;

  return (
    <div
      style={{
        background: 'var(--ambar-500-12)',
        border: '1px solid var(--ambar-500)',
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 12,
        fontSize: 13,
        color: 'var(--ambar-800)',
        fontWeight: 600,
      }}
    >
      ⚠ EQUIPAMENTO DENTRO DO PRAZO DE GARANTIA
      <div style={{ fontWeight: 400, marginTop: 2 }}>
        Reparo anterior na OS {garantia.numeroOS}, entregue em {new Date(garantia.dataEntrega).toLocaleDateString('pt-BR')} -
        garantia válida até {new Date(garantia.garantiaAte).toLocaleDateString('pt-BR')} ({garantia.diasRestantes}{' '}
        {garantia.diasRestantes === 1 ? 'dia restante' : 'dias restantes'}).
      </div>
    </div>
  );
}

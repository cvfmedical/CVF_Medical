import { CrudPage } from '../../components/CrudPage';
import { Badge, type TonoBadge } from '../../components/Badge';

interface PadraoCalibracao {
  id: number;
  identificacao: string;
  tipo: string | null;
  fabricante: string | null;
  numero_serie: string | null;
  certificado_calibracao: string | null;
  laboratorio_calibrador: string | null;
  data_calibracao: string | null;
  data_validade: string;
  status_ativo: boolean;
  observacoes: string | null;
}

const DIAS_ALERTA_VENCIMENTO = 30;

// Mesma regra de tela_padroes_calibracao.py (linhas ~20-30): vencido,
// vencendo em <=30 dias, ou válido. Cor codifica significado: teal =
// em dia, copper = atenção (vencendo), danger = vencido/sem validade.
function statusValidade(dataValidade: string | null): { texto: string; tono: TonoBadge } {
  if (!dataValidade) return { texto: 'Sem validade', tono: 'danger' };
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const validade = new Date(dataValidade + 'T00:00:00');
  const diasRestantes = Math.floor((validade.getTime() - hoje.getTime()) / 86400000);
  if (diasRestantes < 0) return { texto: 'Vencido', tono: 'danger' };
  if (diasRestantes <= DIAS_ALERTA_VENCIMENTO) return { texto: `Vence em ${diasRestantes} dia(s)`, tono: 'copper' };
  return { texto: 'Válido', tono: 'teal' };
}

export function PadroesCalibracao() {
  return (
    <CrudPage<PadraoCalibracao>
      titulo="Calibração de padrões (ISO/IEC 17025)"
      tabela="padroes_calibracao"
      ordenarPor="data_validade"
      camposFiltro={['identificacao', 'tipo', 'fabricante', 'numero_serie']}
      valorInicial={{ status_ativo: true }}
      colunas={[
        { chave: 'identificacao', label: 'Identificação' },
        { chave: 'tipo', label: 'Tipo' },
        { chave: 'numero_serie', label: 'Nº de série', mono: true },
        { chave: 'data_validade', label: 'Validade' },
        {
          chave: 'status_validade',
          label: 'Status',
          render: (r) => {
            const s = statusValidade(r.data_validade);
            return <Badge tono={s.tono}>{s.texto}</Badge>;
          },
        },
      ]}
      campos={[
        { name: 'identificacao', label: 'Identificação', type: 'text', obrigatorio: true },
        { name: 'tipo', label: 'Tipo', type: 'text' },
        { name: 'fabricante', label: 'Fabricante', type: 'text' },
        { name: 'numero_serie', label: 'Número de série', type: 'text' },
        { name: 'certificado_calibracao', label: 'Certificado de calibração', type: 'text' },
        { name: 'laboratorio_calibrador', label: 'Laboratório calibrador', type: 'text' },
        { name: 'data_calibracao', label: 'Data da calibração', type: 'date' },
        { name: 'data_validade', label: 'Data de validade', type: 'date', obrigatorio: true },
        { name: 'observacoes', label: 'Observações', type: 'textarea' },
        { name: 'status_ativo', label: 'Ativo', type: 'checkbox' },
      ]}
      validar={(d) => {
        if (!d.identificacao) return 'Informe a identificação.';
        if (!d.data_validade) return 'Informe a data de validade.';
        return null;
      }}
    />
  );
}

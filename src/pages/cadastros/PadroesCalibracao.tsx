import { CrudPage } from '../../components/CrudPage';

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
// vencendo em <=30 dias, ou válido.
function statusValidade(dataValidade: string | null): { texto: string; cor: string } {
  if (!dataValidade) return { texto: 'Sem Validade', cor: '#fee2e2' };
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const validade = new Date(dataValidade + 'T00:00:00');
  const diasRestantes = Math.floor((validade.getTime() - hoje.getTime()) / 86400000);
  if (diasRestantes < 0) return { texto: 'Vencido', cor: '#fee2e2' };
  if (diasRestantes <= DIAS_ALERTA_VENCIMENTO) return { texto: `Vence em ${diasRestantes} dia(s)`, cor: '#fef9c3' };
  return { texto: 'Válido', cor: '#dcfce7' };
}

export function PadroesCalibracao() {
  return (
    <CrudPage<PadraoCalibracao>
      titulo="Calibração de Padrões (ISO/IEC 17025)"
      tabela="padroes_calibracao"
      ordenarPor="data_validade"
      camposFiltro={['identificacao', 'tipo', 'fabricante', 'numero_serie']}
      valorInicial={{ status_ativo: true }}
      colunas={[
        { chave: 'identificacao', label: 'Identificação' },
        { chave: 'tipo', label: 'Tipo' },
        { chave: 'numero_serie', label: 'Nº Série' },
        { chave: 'data_validade', label: 'Validade' },
        {
          chave: 'status_validade',
          label: 'Status',
          render: (r) => {
            const s = statusValidade(r.data_validade);
            return <span style={{ background: s.cor, padding: '2px 8px', borderRadius: 4 }}>{s.texto}</span>;
          },
        },
      ]}
      campos={[
        { name: 'identificacao', label: 'Identificação', type: 'text', obrigatorio: true },
        { name: 'tipo', label: 'Tipo', type: 'text' },
        { name: 'fabricante', label: 'Fabricante', type: 'text' },
        { name: 'numero_serie', label: 'Número de Série', type: 'text' },
        { name: 'certificado_calibracao', label: 'Certificado de Calibração', type: 'text' },
        { name: 'laboratorio_calibrador', label: 'Laboratório Calibrador', type: 'text' },
        { name: 'data_calibracao', label: 'Data da Calibração', type: 'date' },
        { name: 'data_validade', label: 'Data de Validade', type: 'date', obrigatorio: true },
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

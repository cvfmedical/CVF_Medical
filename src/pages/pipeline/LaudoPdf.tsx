import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import cvfLogoCompleto from '../../assets/cvf-logo-completo.png';

// Mesma identidade visual dos demais laudos (BancadaVisaoPdf.tsx,
// LaudoEquipamentoPdf.tsx) - cabeçalho com logo, faixas de seção azuis,
// caixas com borda.
const corAzul = '#08336a';
const corBorda = '#1e40af';
const corZebra = '#f8fafc';
const corVerde = '#15803d';
const corVermelho = '#dc2626';

const styles = StyleSheet.create({
  page: { padding: 25, fontSize: 8, fontFamily: 'Helvetica', color: '#111' },
  cabecalho: { flexDirection: 'row', border: 1, borderColor: corBorda, padding: 8, marginBottom: 4, alignItems: 'center' },
  logo: { width: 130, height: 48, objectFit: 'contain', marginRight: 10 },
  tituloMain: { fontSize: 11, color: corAzul, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  subMain: { fontSize: 7.5 },
  faixa: { backgroundColor: corAzul, color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 8, padding: 4, marginTop: 6, marginBottom: 2 },
  caixa: { border: 1, borderColor: corBorda, padding: 4, marginBottom: 4 },
  linhaDupla: { flexDirection: 'row' },
  colEsq: { flex: 1, padding: 4, borderRightWidth: 0.5, borderRightColor: '#d1d5db' },
  colDir: { flex: 1, padding: 4 },
  linhaZebra: { backgroundColor: corZebra },
  linhaBorda: { borderTopWidth: 0.5, borderTopColor: '#d1d5db' },
  bold: { fontFamily: 'Helvetica-Bold' },
  rodapeTexto: { position: 'absolute', bottom: 15, left: 25, right: 25, fontSize: 6.5, color: '#64748b', borderTopWidth: 0.5, borderTopColor: corBorda, paddingTop: 4, flexDirection: 'row', justifyContent: 'space-between' },
});

function StatusTexto({ conforme }: { conforme: boolean }) {
  return (
    <Text style={{ color: conforme ? corVerde : corVermelho, fontFamily: 'Helvetica-Bold' }}>
      {conforme ? 'APROVADO' : 'REPROVADO'}
    </Text>
  );
}

export interface DadosLaudoPdf {
  numeroLaudo: string;
  numeroOS: string;
  clienteNome: string;
  clienteFinalNome?: string | null;
  equipamentoDesc: string;
  tecnicoResponsavel: string;
  resultado: string;
  observacoesTecnicas: string;
  dataEmissao: string;
}

export function LaudoPdf({ dados: d }: { dados: DadosLaudoPdf }) {
  const conforme = d.resultado === 'Aprovado';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.cabecalho}>
          <Image src={cvfLogoCompleto} style={styles.logo} />
          <View>
            <Text style={styles.tituloMain}>NOTA TÉCNICA INTERNA</Text>
            <Text style={styles.subMain}>Manutenção em Equipamentos Cirúrgicos — Sistema Q-CVF</Text>
          </View>
        </View>
        <Text style={{ fontSize: 7, color: corVermelho, marginBottom: 4 }}>
          Documento interno simplificado - NÃO substitui o laudo de conformidade ISO 8600 (Bancada de Visão / Teste
          de resolução) nem o Laudo de equipamento (checklist), que contêm as medições e critérios normativos.
        </Text>

        <View style={styles.caixa}>
          <View style={styles.linhaDupla}>
            <Text style={[styles.colEsq, { borderRightWidth: 0 }]}>
              <Text style={styles.bold}>Nº do laudo: </Text>
              {d.numeroLaudo}
            </Text>
            <Text style={styles.colDir}>
              <Text style={styles.bold}>Data de emissão: </Text>
              {d.dataEmissao}
            </Text>
          </View>
          <View style={[styles.linhaDupla, styles.linhaBorda]}>
            <Text style={[styles.colEsq, { borderRightWidth: 0 }]}>
              <Text style={styles.bold}>Ordem de serviço: </Text>
              {d.numeroOS}
            </Text>
            <Text style={styles.colDir}>
              <Text style={styles.bold}>Cliente: </Text>
              {d.clienteNome}
            </Text>
          </View>
          <View style={[styles.linhaDupla, styles.linhaBorda]}>
            <Text style={{ padding: 4 }}>
              <Text style={styles.bold}>Equipamento: </Text>
              {d.equipamentoDesc || '-'}
            </Text>
          </View>
          {d.clienteFinalNome && (
            <View style={[styles.linhaDupla, styles.linhaBorda]}>
              <Text style={{ padding: 4 }}>
                <Text style={styles.bold}>Unidade atendida: </Text>
                {d.clienteFinalNome}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.faixa}>OBSERVAÇÕES TÉCNICAS</Text>
        <View style={styles.caixa}>
          <Text>{d.observacoesTecnicas || '-'}</Text>
        </View>

        <Text style={styles.faixa}>CONCLUSÃO</Text>
        <View style={[styles.caixa, styles.linhaZebra]}>
          <Text>
            <Text style={styles.bold}>Resultado: </Text>
            <StatusTexto conforme={conforme} />
          </Text>
        </View>

        <View style={{ flexDirection: 'row', marginTop: 24 }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text>________________________________________</Text>
            <Text style={{ marginTop: 2 }}>Executado por: {d.tecnicoResponsavel || 'Sistema Q-CVF'}</Text>
          </View>
        </View>

        <View style={styles.rodapeTexto} fixed>
          <Text>Documento confidencial - Emitido eletronicamente pelo Sistema Q-CVF Medical</Text>
          <Text render={({ pageNumber }) => `Página ${pageNumber}`} />
        </View>
      </Page>
    </Document>
  );
}

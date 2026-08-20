import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import cvfLogoCompleto from '../../assets/cvf-logo-completo.png';

// Mesma identidade visual do laudo ISO 8600 (BancadaVisaoPdf.tsx) - cabeçalho
// com logo, faixas de seção azuis, caixas com borda, tabela com cabeçalho
// zebrado - pra todo laudo do sistema ter a mesma cara da CVF, não só o
// laudo óptico.
const corAzul = '#08336a';
const corBorda = '#1e40af';
const corLinha = '#d1d5db';
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
  colEsq: { flex: 1, padding: 4, borderRightWidth: 0.5, borderRightColor: corLinha },
  colDir: { flex: 1, padding: 4 },
  linhaZebra: { backgroundColor: corZebra },
  linhaBorda: { borderTopWidth: 0.5, borderTopColor: corLinha },
  bold: { fontFamily: 'Helvetica-Bold' },
  tabelaCabecalho: { flexDirection: 'row', backgroundColor: corZebra, borderWidth: 1, borderColor: corBorda, fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
  tabelaLinha: { flexDirection: 'row', borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: corBorda, fontSize: 7.5 },
  celula: { padding: 3, borderRightWidth: 0.5, borderRightColor: corLinha },
  celulaCentro: { padding: 3, textAlign: 'center', borderRightWidth: 0.5, borderRightColor: corLinha },
  rodapeTexto: { position: 'absolute', bottom: 15, left: 25, right: 25, fontSize: 6.5, color: '#64748b', borderTopWidth: 0.5, borderTopColor: corBorda, paddingTop: 4, flexDirection: 'row', justifyContent: 'space-between' },
});

function StatusTexto({ conforme }: { conforme: boolean }) {
  return (
    <Text style={{ color: conforme ? corVerde : corVermelho, fontFamily: 'Helvetica-Bold' }}>
      {conforme ? 'APROVADO' : 'REPROVADO'}
    </Text>
  );
}

export interface ItemChecklistPdf {
  descricao: string;
  conforme: boolean | null;
}

export interface DadosLaudoEquipamentoPdf {
  numeroLaudo: string;
  numeroOS: string;
  clienteNome: string;
  clienteFinalNome?: string | null;
  tipoEquipamento: string;
  equipamentoDesc: string;
  numeroSerie: string;
  itens: ItemChecklistPdf[];
  observacoes: string;
  resultado: string;
  tecnicoResponsavel: string;
  dataAbertura: string;
  dataEmissao: string;
}

export function LaudoEquipamentoPdf({ dados: d }: { dados: DadosLaudoEquipamentoPdf }) {
  const conforme = d.resultado === 'Aprovado';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.cabecalho}>
          <Image src={cvfLogoCompleto} style={styles.logo} />
          <View>
            <Text style={styles.tituloMain}>LAUDO TÉCNICO DE EQUIPAMENTO</Text>
            <Text style={styles.subMain}>Manutenção em Equipamentos Cirúrgicos — Sistema Q-CVF</Text>
          </View>
        </View>

        <View style={styles.caixa}>
          <View style={styles.linhaDupla}>
            <Text style={[styles.colEsq, { borderRightWidth: 0 }]}>
              <Text style={styles.bold}>Nº de controle do laudo: </Text>
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
              <Text style={styles.bold}>Data da abertura: </Text>
              {d.dataAbertura || '-'}
            </Text>
          </View>
        </View>

        <Text style={styles.faixa}>1. IDENTIFICAÇÃO DO CLIENTE</Text>
        <View style={styles.caixa}>
          <Text>
            <Text style={styles.bold}>Razão social: </Text>
            {d.clienteNome || '-'}
          </Text>
          {d.clienteFinalNome && (
            <Text style={{ marginTop: 3 }}>
              <Text style={styles.bold}>Unidade atendida: </Text>
              {d.clienteFinalNome}
            </Text>
          )}
        </View>

        <Text style={styles.faixa}>2. IDENTIFICAÇÃO DO EQUIPAMENTO</Text>
        <View style={styles.caixa}>
          <View style={styles.linhaDupla}>
            <Text style={[styles.colEsq, { borderRightWidth: 0 }]}>
              <Text style={styles.bold}>Tipo de equipamento: </Text>
              {d.tipoEquipamento || '-'}
            </Text>
            <Text style={styles.colDir}>
              <Text style={styles.bold}>Nº de série: </Text>
              {d.numeroSerie || '-'}
            </Text>
          </View>
          <View style={[styles.linhaDupla, styles.linhaBorda]}>
            <Text style={{ padding: 4 }}>
              <Text style={styles.bold}>Descrição: </Text>
              {d.equipamentoDesc || '-'}
            </Text>
          </View>
        </View>

        <Text style={styles.faixa}>3. CHECKLIST DE MANUTENÇÃO (C = CONFORME, NC = NÃO CONFORME)</Text>
        {d.itens.length === 0 ? (
          <View style={styles.caixa}>
            <Text>Nenhum item de checklist cadastrado para este tipo de equipamento.</Text>
          </View>
        ) : (
          <>
            <View style={styles.tabelaCabecalho}>
              <Text style={[styles.celula, { flex: 4 }]}>Item verificado</Text>
              <Text style={[styles.celulaCentro, { width: 30 }]}>C</Text>
              <Text style={[styles.celulaCentro, { width: 30, borderRightWidth: 0 }]}>NC</Text>
            </View>
            {d.itens.map((it, i) => (
              <View style={[styles.tabelaLinha, i % 2 === 1 ? styles.linhaZebra : {}]} key={i}>
                <Text style={[styles.celula, { flex: 4 }]}>{it.descricao}</Text>
                <Text style={[styles.celulaCentro, { width: 30, color: corVerde, fontFamily: 'Helvetica-Bold' }]}>
                  {it.conforme === true ? 'X' : ''}
                </Text>
                <Text style={[styles.celulaCentro, { width: 30, borderRightWidth: 0, color: corVermelho, fontFamily: 'Helvetica-Bold' }]}>
                  {it.conforme === false ? 'X' : ''}
                </Text>
              </View>
            ))}
          </>
        )}

        <Text style={styles.faixa}>4. OBSERVAÇÕES TÉCNICAS</Text>
        <View style={styles.caixa}>
          <Text>{d.observacoes || 'Nenhuma observação registrada.'}</Text>
        </View>

        <Text style={styles.faixa}>5. CONCLUSÃO TÉCNICA</Text>
        <View style={[styles.caixa, styles.linhaZebra]}>
          <Text>
            <Text style={styles.bold}>Equipamento conforme parâmetros de funcionamento: </Text>
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

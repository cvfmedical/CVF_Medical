import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica' },
  titulo: { fontSize: 16, marginBottom: 4, color: '#344d95' },
  subtitulo: { fontSize: 10, marginBottom: 20, color: '#5c5a54' },
  linha: { flexDirection: 'row', marginBottom: 8 },
  rotulo: { width: 140, fontWeight: 700 },
  valor: { flex: 1 },
  resultado: { marginTop: 16, padding: 8, fontSize: 13, fontWeight: 700 },
  aprovado: { backgroundColor: '#dcfce7', color: '#166534' },
  reprovado: { backgroundColor: '#fee2e2', color: '#991b1b' },
  assinatura: { marginTop: 60, borderTop: 1, borderColor: '#999', paddingTop: 4, width: 250 },
});

export interface DadosLaudoPdf {
  numeroLaudo: string;
  numeroOS: string;
  clienteNome: string;
  equipamentoDesc: string;
  tecnicoResponsavel: string;
  resultado: string;
  observacoesTecnicas: string;
  dataEmissao: string;
}

export function LaudoPdf({ dados }: { dados: DadosLaudoPdf }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.titulo}>Q-CVF Medical - Laudo Técnico</Text>
        <Text style={styles.subtitulo}>Manutenção em Equipamentos Cirúrgicos</Text>

        <View style={styles.linha}>
          <Text style={styles.rotulo}>Nº do laudo</Text>
          <Text style={styles.valor}>{dados.numeroLaudo}</Text>
        </View>
        <View style={styles.linha}>
          <Text style={styles.rotulo}>Ordem de serviço</Text>
          <Text style={styles.valor}>{dados.numeroOS}</Text>
        </View>
        <View style={styles.linha}>
          <Text style={styles.rotulo}>Cliente</Text>
          <Text style={styles.valor}>{dados.clienteNome}</Text>
        </View>
        <View style={styles.linha}>
          <Text style={styles.rotulo}>Equipamento</Text>
          <Text style={styles.valor}>{dados.equipamentoDesc}</Text>
        </View>
        <View style={styles.linha}>
          <Text style={styles.rotulo}>Técnico responsável</Text>
          <Text style={styles.valor}>{dados.tecnicoResponsavel}</Text>
        </View>
        <View style={styles.linha}>
          <Text style={styles.rotulo}>Data de emissão</Text>
          <Text style={styles.valor}>{dados.dataEmissao}</Text>
        </View>

        <View style={styles.linha}>
          <Text style={styles.rotulo}>Observações técnicas</Text>
          <Text style={styles.valor}>{dados.observacoesTecnicas || '-'}</Text>
        </View>

        <Text style={[styles.resultado, dados.resultado === 'Aprovado' ? styles.aprovado : styles.reprovado]}>
          Resultado: {dados.resultado}
        </Text>

        <View style={styles.assinatura}>
          <Text>Assinatura do técnico responsável</Text>
        </View>
      </Page>
    </Document>
  );
}

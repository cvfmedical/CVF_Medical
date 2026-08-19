import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica' },
  titulo: { fontSize: 16, marginBottom: 4, color: '#344d95' },
  subtitulo: { fontSize: 10, marginBottom: 20, color: '#5c5a54' },
  linha: { flexDirection: 'row', marginBottom: 8 },
  rotulo: { width: 140, fontWeight: 700 },
  valor: { flex: 1 },
  secao: { fontSize: 12, fontWeight: 700, color: '#344d95', marginTop: 16, marginBottom: 8 },
  th: { flexDirection: 'row', backgroundColor: '#f4f3ef', paddingVertical: 4, paddingHorizontal: 6, fontWeight: 700, fontSize: 10 },
  td: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e4e1d8', paddingVertical: 4, paddingHorizontal: 6 },
  cItem: { flex: 1 },
  cMarca: { width: 40, textAlign: 'center' },
  resultado: { marginTop: 16, padding: 8, fontSize: 13, fontWeight: 700 },
  aprovado: { backgroundColor: '#dcfce7', color: '#166534' },
  reprovado: { backgroundColor: '#fee2e2', color: '#991b1b' },
  assinatura: { marginTop: 40, borderTop: 1, borderColor: '#999', paddingTop: 4, width: 250 },
});

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
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.titulo}>Q-CVF Medical - Laudo Técnico de Equipamento</Text>
        <Text style={styles.subtitulo}>Manutenção em Equipamentos Cirúrgicos</Text>

        <Text style={styles.secao}>1 - Dados do solicitante</Text>
        <View style={styles.linha}>
          <Text style={styles.rotulo}>Nº do laudo</Text>
          <Text style={styles.valor}>{d.numeroLaudo}</Text>
        </View>
        <View style={styles.linha}>
          <Text style={styles.rotulo}>Ordem de serviço</Text>
          <Text style={styles.valor}>{d.numeroOS}</Text>
        </View>
        <View style={styles.linha}>
          <Text style={styles.rotulo}>Cliente</Text>
          <Text style={styles.valor}>{d.clienteNome}</Text>
        </View>
        {d.clienteFinalNome && (
          <View style={styles.linha}>
            <Text style={styles.rotulo}>Unidade atendida</Text>
            <Text style={styles.valor}>{d.clienteFinalNome}</Text>
          </View>
        )}
        <View style={styles.linha}>
          <Text style={styles.rotulo}>Tipo de equipamento</Text>
          <Text style={styles.valor}>{d.tipoEquipamento}</Text>
        </View>
        <View style={styles.linha}>
          <Text style={styles.rotulo}>Equipamento</Text>
          <Text style={styles.valor}>{d.equipamentoDesc || '-'}</Text>
        </View>
        <View style={styles.linha}>
          <Text style={styles.rotulo}>Nº de série</Text>
          <Text style={styles.valor}>{d.numeroSerie || '-'}</Text>
        </View>
        <View style={styles.linha}>
          <Text style={styles.rotulo}>Data da abertura</Text>
          <Text style={styles.valor}>{d.dataAbertura || '-'}</Text>
        </View>
        <View style={styles.linha}>
          <Text style={styles.rotulo}>Data de emissão</Text>
          <Text style={styles.valor}>{d.dataEmissao}</Text>
        </View>

        <Text style={styles.secao}>2 - Checklist (C = conforme, NC = não conforme)</Text>
        {d.itens.length === 0 ? (
          <Text style={{ color: '#8c8a83' }}>Nenhum item de checklist cadastrado para este tipo de equipamento.</Text>
        ) : (
          <>
            <View style={styles.th}>
              <Text style={styles.cItem}>Item</Text>
              <Text style={styles.cMarca}>C</Text>
              <Text style={styles.cMarca}>NC</Text>
            </View>
            {d.itens.map((it, i) => (
              <View style={styles.td} key={i}>
                <Text style={styles.cItem}>{it.descricao}</Text>
                <Text style={styles.cMarca}>{it.conforme === true ? 'X' : ''}</Text>
                <Text style={styles.cMarca}>{it.conforme === false ? 'X' : ''}</Text>
              </View>
            ))}
          </>
        )}

        {d.observacoes && (
          <>
            <Text style={styles.secao}>Observações</Text>
            <Text>{d.observacoes}</Text>
          </>
        )}

        <Text style={[styles.resultado, d.resultado === 'Aprovado' ? styles.aprovado : styles.reprovado]}>
          Equipamento conforme parâmetros de funcionamento: {d.resultado}
        </Text>

        <View style={styles.assinatura}>
          <Text>Assinatura do técnico responsável</Text>
        </View>
      </Page>
    </Document>
  );
}

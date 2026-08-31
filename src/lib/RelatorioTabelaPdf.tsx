import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import cvfLogoCompleto from '../assets/cvf-logo-completo.png';

// Mesma identidade visual dos laudos do sistema (BancadaVisaoPdf.tsx,
// LaudoEquipamentoPdf.tsx) - cabeçalho com logo, faixa azul, tabela
// zebrada - só que genérico pra qualquer lista de linhas/colunas
// (Contas a pagar/receber, relatórios do Comercial etc.), em vez de um
// documento com layout fixo.
const corAzul = '#08336a';
const corBorda = '#1e40af';
const corZebra = '#f8fafc';
const corLinha = '#d1d5db';

const styles = StyleSheet.create({
  page: { padding: 22, fontSize: 8, fontFamily: 'Helvetica', color: '#111' },
  cabecalho: { flexDirection: 'row', border: 1, borderColor: corBorda, padding: 8, marginBottom: 8, alignItems: 'center' },
  logo: { width: 120, height: 44, objectFit: 'contain', marginRight: 10 },
  tituloMain: { fontSize: 12, color: corAzul, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  subMain: { fontSize: 8 },
  tabelaCabecalho: { flexDirection: 'row', backgroundColor: corZebra, borderWidth: 1, borderColor: corBorda, fontFamily: 'Helvetica-Bold' },
  linhaTabela: { flexDirection: 'row', borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: corBorda },
  linhaZebra: { backgroundColor: corZebra },
  celula: { padding: 4, borderRightWidth: 0.5, borderRightColor: corLinha },
  linhaTotal: { flexDirection: 'row', borderWidth: 1, borderColor: corBorda, borderTopWidth: 0, fontFamily: 'Helvetica-Bold' },
  rodapePagina: { position: 'absolute', bottom: 12, right: 22, fontSize: 7, color: '#64748b' },
});

export interface ColunaRelatorioPdf {
  label: string;
  flex?: number;
  alinhamento?: 'left' | 'right' | 'center';
}

export interface RelatorioTabelaPdfProps {
  titulo: string;
  subtitulo?: string;
  colunas: ColunaRelatorioPdf[];
  linhas: string[][];
  totalLabel?: string;
  totalValor?: string;
}

export function RelatorioTabelaPdf({ titulo, subtitulo, colunas, linhas, totalLabel, totalValor }: RelatorioTabelaPdfProps) {
  const paisagem = colunas.length > 6;
  return (
    <Document>
      <Page size="A4" orientation={paisagem ? 'landscape' : 'portrait'} style={styles.page}>
        <View style={styles.cabecalho}>
          <Image src={cvfLogoCompleto} style={styles.logo} />
          <View>
            <Text style={styles.tituloMain}>{titulo}</Text>
            {subtitulo && <Text style={styles.subMain}>{subtitulo}</Text>}
          </View>
        </View>

        <View style={styles.tabelaCabecalho}>
          {colunas.map((c, i) => (
            <Text key={i} style={[styles.celula, { flex: c.flex ?? 1, textAlign: c.alinhamento ?? 'left' }]}>
              {c.label}
            </Text>
          ))}
        </View>
        {linhas.map((linha, i) => (
          <View key={i} style={[styles.linhaTabela, i % 2 === 1 ? styles.linhaZebra : {}]} wrap={false}>
            {linha.map((valor, j) => (
              <Text
                key={j}
                style={[styles.celula, { flex: colunas[j]?.flex ?? 1, textAlign: colunas[j]?.alinhamento ?? 'left' }]}
              >
                {valor}
              </Text>
            ))}
          </View>
        ))}
        {linhas.length === 0 && (
          <View style={styles.linhaTabela}>
            <Text style={styles.celula}>Nenhum registro encontrado.</Text>
          </View>
        )}
        {totalLabel && (
          <View style={styles.linhaTotal}>
            <Text style={[styles.celula, { flex: colunas.length - 1 }]}>{totalLabel}</Text>
            <Text style={[styles.celula, { flex: 1, textAlign: 'right', borderRightWidth: 0 }]}>{totalValor}</Text>
          </View>
        )}

        <Text
          style={styles.rodapePagina}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

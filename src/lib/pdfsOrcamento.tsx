import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import { EMPRESA, formatarMoeda } from './formato';

// PDFs REAIS (arquivos) dos 3 relatórios enviados ao cliente - usados no envio
// automático por e-mail (anexos). São documentos limpos, em texto/tabela; as
// fotos ficam no portal do cliente (evita o custo/latência de embutir imagens).

const azul = '#344d95';
const azulEscuro = '#26386c';
const tinta = '#21201c';
const cinza = '#5c5a54';
const borda = '#e4e1d8';

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 64, paddingHorizontal: 40, fontSize: 10, fontFamily: 'Helvetica', color: tinta },
  cab: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 3, borderBottomColor: azul, paddingBottom: 8, marginBottom: 16 },
  marca: { fontSize: 18, fontWeight: 700, color: azul },
  slogan: { fontSize: 9, fontStyle: 'italic', color: azul },
  titulo: { fontSize: 15, color: azulEscuro, marginBottom: 2 },
  subtitulo: { fontSize: 9, color: cinza, marginBottom: 14 },
  secao: { fontSize: 10, fontWeight: 700, color: azulEscuro, textTransform: 'uppercase', borderBottomWidth: 1, borderBottomColor: borda, paddingBottom: 3, marginTop: 14, marginBottom: 6 },
  linha: { flexDirection: 'row', marginBottom: 4 },
  rotulo: { width: 130, color: cinza },
  valor: { flex: 1 },
  th: { flexDirection: 'row', backgroundColor: '#1b1d20', color: '#fff', paddingVertical: 4, paddingHorizontal: 6 },
  td: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: borda, paddingVertical: 4, paddingHorizontal: 6 },
  cItem: { flex: 1 },
  cQtd: { width: 40, textAlign: 'center' },
  cNum: { width: 80, textAlign: 'right' },
  total: { textAlign: 'right', fontSize: 12, fontWeight: 700, marginTop: 8 },
  legal: { fontSize: 8.5, color: cinza, lineHeight: 1.4, marginBottom: 3 },
  rodape: { position: 'absolute', bottom: 24, left: 40, right: 40, borderTopWidth: 1, borderTopColor: borda, paddingTop: 6, fontSize: 7.5, color: azulEscuro, textAlign: 'center' },
});

function Cabecalho({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <>
      <View style={s.cab}>
        <Text style={s.marca}>CVF MEDICAL</Text>
        <Text style={s.slogan}>Sua imagem, nossa visão.</Text>
      </View>
      <Text style={s.titulo}>{titulo}</Text>
      {subtitulo ? <Text style={s.subtitulo}>{subtitulo}</Text> : null}
    </>
  );
}

function Rodape() {
  return (
    <View style={s.rodape} fixed>
      <Text>{EMPRESA.razaoSocial} • CNPJ: {EMPRESA.cnpj}</Text>
      <Text>{EMPRESA.endereco}</Text>
      <Text>Tel. / WhatsApp: {EMPRESA.telefone} • E-mail: {EMPRESA.email}</Text>
    </View>
  );
}

export interface ItemOrcamentoPdf {
  nome: string;
  quantidade: number;
  precoUnit: number;
}

export interface DadosOrcamentoPdf {
  numeroOrcamento: string;
  numeroOS: string;
  clienteNome: string;
  equipamento: string;
  numeroSerie: string;
  itens: ItemOrcamentoPdf[];
  total: number;
  validade: string;
  pagamento: string;
  prazo: string;
  observacoes: string;
  garantiaResumo: string;
  garantiaIntro: string;
  garantiaItens: string[];
  clausulas: { titulo: string; texto: string }[];
}

function DocOrcamento({ d }: { d: DadosOrcamentoPdf }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Cabecalho titulo="Orçamento de Manutenção" subtitulo={`Nº ${d.numeroOrcamento} · OS ${d.numeroOS} · ${d.clienteNome}`} />
        <Text style={{ fontSize: 9, color: cinza, marginBottom: 10 }}>
          {d.equipamento}{d.numeroSerie ? ` · Nº série ${d.numeroSerie}` : ''}
        </Text>

        <View style={s.th}>
          <Text style={s.cItem}>Item</Text>
          <Text style={s.cQtd}>Qtd.</Text>
          <Text style={s.cNum}>Preço unit.</Text>
          <Text style={s.cNum}>Subtotal</Text>
        </View>
        {d.itens.map((it, i) => (
          <View style={s.td} key={i}>
            <Text style={s.cItem}>{it.nome}</Text>
            <Text style={s.cQtd}>{it.quantidade}</Text>
            <Text style={s.cNum}>{formatarMoeda(it.precoUnit)}</Text>
            <Text style={s.cNum}>{formatarMoeda(it.precoUnit * it.quantidade)}</Text>
          </View>
        ))}
        <Text style={s.total}>Total: {formatarMoeda(d.total)}</Text>

        <Text style={s.secao}>Condições comerciais</Text>
        <View style={s.linha}><Text style={s.rotulo}>Validade da proposta</Text><Text style={s.valor}>{d.validade || '-'}</Text></View>
        <View style={s.linha}><Text style={s.rotulo}>Condições de pagamento</Text><Text style={s.valor}>{d.pagamento || '-'}</Text></View>
        <View style={s.linha}><Text style={s.rotulo}>Prazo de entrega</Text><Text style={s.valor}>{d.prazo || '-'}</Text></View>

        <View wrap={false}>
          <Text style={s.secao}>Garantia</Text>
          <Text style={{ marginBottom: 3 }}>{d.garantiaResumo}</Text>
          <Text style={s.legal}>{d.garantiaIntro}</Text>
          {d.garantiaItens.map((g, i) => (
            <Text style={s.legal} key={i}>{i + 1}. {g}</Text>
          ))}
          <Text style={s.secao}>Condições gerais</Text>
          {d.clausulas.map((c, i) => (
            <Text style={s.legal} key={i}><Text style={{ fontWeight: 700 }}>{c.titulo}.</Text> {c.texto}</Text>
          ))}
          {d.observacoes ? (
            <>
              <Text style={s.secao}>Observações</Text>
              <Text style={s.legal}>{d.observacoes}</Text>
            </>
          ) : null}
        </View>
        <Rodape />
      </Page>
    </Document>
  );
}

export interface DadosEntradaPdf {
  codigo: string;
  clienteNome: string;
  equipamento: string;
  fabricante: string;
  numeroSerie: string;
  condicaoChegada: string;
  data: string;
  nfNumero: string;
  nfSerie: string;
  avarias: string[];
}

function DocEntrada({ d }: { d: DadosEntradaPdf }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Cabecalho titulo="Registro de Entrada" subtitulo={`${d.codigo} · ${d.clienteNome}`} />
        <View style={s.linha}><Text style={s.rotulo}>Equipamento</Text><Text style={s.valor}>{d.equipamento || '-'}</Text></View>
        <View style={s.linha}><Text style={s.rotulo}>Fabricante</Text><Text style={s.valor}>{d.fabricante || '-'}</Text></View>
        <View style={s.linha}><Text style={s.rotulo}>Nº de série</Text><Text style={s.valor}>{d.numeroSerie || '-'}</Text></View>
        <View style={s.linha}><Text style={s.rotulo}>Condição de chegada</Text><Text style={s.valor}>{d.condicaoChegada || '-'}</Text></View>
        <View style={s.linha}><Text style={s.rotulo}>Data de entrada</Text><Text style={s.valor}>{d.data || '-'}</Text></View>
        <Text style={s.secao}>Nota fiscal de remessa</Text>
        <View style={s.linha}><Text style={s.rotulo}>Número / Série</Text><Text style={s.valor}>{d.nfNumero || '-'} / {d.nfSerie || '-'}</Text></View>
        <Text style={s.secao}>Avarias identificadas na triagem</Text>
        {d.avarias.length === 0 ? (
          <Text style={{ color: cinza }}>Nenhuma avaria marcada.</Text>
        ) : (
          d.avarias.map((a, i) => <Text key={i}>• {a}</Text>)
        )}
        <Rodape />
      </Page>
    </Document>
  );
}

export interface ItemOSPdf {
  nome: string;
  quantidade: number;
  observacao: string;
}

export interface DadosOSPdf {
  numeroOS: string;
  clienteNome: string;
  equipamento: string;
  itens: ItemOSPdf[];
}

function DocOS({ d }: { d: DadosOSPdf }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Cabecalho titulo="Ordem de Serviço" subtitulo={`${d.numeroOS} · ${d.clienteNome}`} />
        <Text style={{ fontSize: 9, color: cinza, marginBottom: 10 }}>{d.equipamento}</Text>
        <View style={s.th}>
          <Text style={s.cItem}>Item / peça</Text>
          <Text style={s.cQtd}>Qtd.</Text>
          <Text style={{ flex: 1.4 }}>Observação / avaria</Text>
        </View>
        {d.itens.map((it, i) => (
          <View style={s.td} key={i}>
            <Text style={s.cItem}>{it.nome}</Text>
            <Text style={s.cQtd}>{it.quantidade}</Text>
            <Text style={{ flex: 1.4 }}>{it.observacao || '-'}</Text>
          </View>
        ))}
        <Rodape />
      </Page>
    </Document>
  );
}

async function blobParaBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export interface AnexoBase64 {
  filename: string;
  content: string;
}

// Gera os 3 PDFs e devolve prontos para anexar (filename + base64).
export async function gerarAnexosOrcamento(
  orcamento: DadosOrcamentoPdf,
  entrada: DadosEntradaPdf | null,
  os: DadosOSPdf,
): Promise<AnexoBase64[]> {
  const anexos: AnexoBase64[] = [];
  if (entrada) {
    const blob = await pdf(<DocEntrada d={entrada} />).toBlob();
    anexos.push({ filename: `Registro-de-Entrada-${entrada.codigo}.pdf`, content: await blobParaBase64(blob) });
  }
  const blobOS = await pdf(<DocOS d={os} />).toBlob();
  anexos.push({ filename: `Ordem-de-Servico-${os.numeroOS}.pdf`, content: await blobParaBase64(blobOS) });
  const blobOrc = await pdf(<DocOrcamento d={orcamento} />).toBlob();
  anexos.push({ filename: `Orcamento-${orcamento.numeroOrcamento}.pdf`, content: await blobParaBase64(blobOrc) });
  return anexos;
}

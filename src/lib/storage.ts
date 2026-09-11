import { supabase } from './supabaseClient';

// Upload autenticado (staff) para o bucket fotos-equipamentos, respeitando
// a policy staff_rw_fotos_equipamentos (009_storage_staff_policies.sql) -
// substitui o upload via service_role key que o desktop usa
// (cadastros.py::enviar_arquivo_storage). Mesma convenção de pasta:
// entrada_{id}/... ou orcamento_{id}/....
export async function enviarArquivoStorage(pasta: string, arquivo: File): Promise<string> {
  const caminho = `${pasta}/${crypto.randomUUID()}_${arquivo.name}`;
  const { error } = await supabase.storage.from('fotos-equipamentos').upload(caminho, arquivo);
  if (error) throw error;
  return caminho;
}

export async function urlAssinadaFoto(caminho: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('fotos-equipamentos')
    .createSignedUrl(caminho, 3600);
  if (error) return null;
  return data.signedUrl;
}

export async function excluirArquivoStorage(caminho: string): Promise<void> {
  await supabase.storage.from('fotos-equipamentos').remove([caminho]);
}

// Documentos financeiros (ex.: PDF de boleto emitido via Sicoob) - bucket
// separado de fotos-equipamentos porque é outra categoria de arquivo
// (documento, não foto), com sua própria policy staff
// (staff_rw_documentos_financeiro). Upload é feito só no lado do servidor
// (edge function, com a service role key) - aqui só a leitura assinada.
export async function urlAssinadaDocumentoFinanceiro(caminho: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('documentos-financeiro')
    .createSignedUrl(caminho, 3600);
  if (error) return null;
  return data.signedUrl;
}

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

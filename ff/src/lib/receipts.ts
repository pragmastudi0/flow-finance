import { supabase } from './supabase.ts';
import type { DocumentExtraction } from '../domain/document.ts';

export interface AnalyzedDocument extends DocumentExtraction {
  receiptId: string;
}

export class DocumentError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'
      | 'daily_limit_reached'
      | 'analysis_failed'
      | 'upload_failed'
      | 'unknown',
    message: string,
    readonly limit?: number,
  ) {
    super(message);
  }
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

export async function analyzeDocument(file: File): Promise<AnalyzedDocument> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) throw new DocumentError('unauthorized', 'No hay sesión activa');

  const extension = EXTENSIONS[file.type] ?? 'jpg';
  const storagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('receipts')
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) throw new DocumentError('upload_failed', uploadError.message);

  const { data: receipt, error: insertError } = await supabase
    .from('flowfinance_receipts')
    .insert({ user_id: user.id, storage_path: storagePath, status: 'pending' })
    .select('id')
    .single();

  if (insertError || !receipt) {
    throw new DocumentError('upload_failed', insertError?.message ?? 'No se pudo registrar el comprobante');
  }

  const { data, error } = await supabase.functions.invoke<AnalyzedDocument | { error: string; limit?: number }>(
    'analyze-receipt',
    { body: { receiptId: receipt.id } },
  );

  if (error) throw new DocumentError('analysis_failed', error.message);
  if (data && 'error' in data) {
    const code = data.error === 'daily_limit_reached' ? 'daily_limit_reached' : 'analysis_failed';
    throw new DocumentError(code, data.error, 'limit' in data ? data.limit : undefined);
  }
  if (!data) throw new DocumentError('unknown', 'Respuesta vacía del analizador');

  return data;
}

export async function confirmTransaction(
  receiptId: string,
  transactionData: {
    amount: number;
    currency: 'ARS' | 'USD';
    fxRate: number;
    type: 'expense' | 'income';
    category: string;
    description: string;
    occurredOn: string;
  },
): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) throw new Error('No hay sesión activa');

  const { data: tx, error } = await supabase
    .from('flowfinance_transactions')
    .insert({
      user_id: user.id,
      type: transactionData.type,
      amount: transactionData.amount,
      currency: transactionData.currency,
      fx_rate: transactionData.fxRate,
      category: transactionData.category,
      description: transactionData.description,
      occurred_on: transactionData.occurredOn,
      raw_input: `[${transactionData.type === 'expense' ? 'Comprobante' : 'Ingreso'} por IA] ${transactionData.description}`,
    })
    .select('id')
    .single();

  if (error || !tx) throw new Error(error?.message ?? 'No se pudo crear la transacción');

  await supabase
    .from('flowfinance_receipts')
    .update({ transaction_id: tx.id })
    .eq('id', receiptId);

  return tx.id;
}

export async function receiptImageUrl(storagePath: string, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage
    .from('receipts')
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error) throw new DocumentError('unknown', error.message);
  return data.signedUrl;
}

'use server'

import { createClient } from '@supabase/supabase-js'
import { BankTransaction } from '@/types/database'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function fetchBankTransactions(): Promise<BankTransaction[]> {
  const { data, error } = await supabase
    .from('bank_transactions')
    .select('*')
    .order('transaction_date', { ascending: false })
    .order('transaction_time', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as BankTransaction[]
}

export async function fetchExistingTransactions(startDate: string, endDate: string) {
  const { data } = await supabase
    .from('bank_transactions')
    .select('transaction_date, transaction_time, balance, bank_id')
    .gte('transaction_date', startDate)
    .lte('transaction_date', endDate)
  return data ?? []
}

export async function insertBankTransactions(rows: Record<string, unknown>[]) {
  const { error } = await supabase.from('bank_transactions').insert(rows)
  if (error) throw new Error(error.message)
}

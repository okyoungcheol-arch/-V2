'use server'

import { createClient } from '@supabase/supabase-js'
import { BankTransaction } from '@/types/database'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function fetchBankTransactions(month?: string): Promise<BankTransaction[]> {
  let query = supabase
    .from('bank_transactions')
    .select('*')
    .order('transaction_date', { ascending: false })
    .order('transaction_time', { ascending: false })

  if (month) {
    const [year, mon] = month.split('-').map(Number)
    const start = `${year}-${String(mon).padStart(2, '0')}-01`
    const lastDay = new Date(year, mon, 0).getDate()
    const end = `${year}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    query = query.gte('transaction_date', start).lte('transaction_date', end)
  }

  const { data, error } = await query
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

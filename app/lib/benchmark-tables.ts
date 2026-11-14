import 'server-only';
import overallCsv from '@/data/insights/benchmarks_overall.csv?raw';
import byIncomeCsv from '@/data/insights/benchmarks_by_income_quintile.csv?raw';
import byAgeCsv from '@/data/insights/benchmarks_by_age.csv?raw';
import statfin from '@/data/benchmarks/statfin-household-budget-2022.json';
import { parseCsv } from './csv';
import type { BenchmarkTables } from './benchmarks';

export const benchmarkTables:BenchmarkTables={overall:parseCsv(overallCsv),byIncome:parseCsv(byIncomeCsv),byAge:parseCsv(byAgeCsv),statfin:statfin as BenchmarkTables['statfin']};

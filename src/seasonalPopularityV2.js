/** ГРОТ 2.0 — коэффициенты сезонной популярности отпусков (КСН).
 * Значения рассчитываются по данным выбранного года и графика.
 * Один сотрудник в месяце учитывается один раз, независимо от числа периодов.
 * Сумма коэффициентов после округления до 0,1 всегда равна 12,0
 * (метод наибольших остатков), если есть хоть один отпуск.
 */
import {buildUnifiedYearView,calculateYearTotals} from './unifiedYearTableV2.js';
export const MONTH_NAMES=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

export function normalizeMonthlyPopularity(counts){
 if(!Array.isArray(counts)||counts.length!==12||counts.some(n=>!Number.isInteger(n)||n<0))
  throw new Error('Ожидаются 12 неотрицательных целых чисел сотрудников');
 const sum=counts.reduce((a,b)=>a+b,0);
 if(!sum)return null; // Не подставляем выдуманные КСН для пустого графика
 const fractional=counts.map(n=>n*120/sum);
 const tenths=fractional.map(n=>Math.floor(n+1e-10));
 const rest=120-tenths.reduce((a,b)=>a+b,0);
 const order=fractional.map((n,i)=>({i,part:n-Math.floor(n+1e-10)}))
  .sort((a,b)=>b.part-a.part||a.i-b.i);
 for(let i=0;i<rest;i++)tenths[order[i].i]++;
 return tenths.map(n=>n/10);
}
export function calculateSeasonalPopularity(year,records,staff){
 const view=buildUnifiedYearView(year,records.filter(r=>!r.deleted),staff);
 const counts=calculateYearTotals(view).months;
 const coefficients=normalizeMonthlyPopularity(counts);
 return {
  year:Number(year),
  counts,
  coefficients,
  totalOccurrences:counts.reduce((a,b)=>a+b,0),
  months:MONTH_NAMES.map((name,i)=>({month:i+1,name,count:counts[i],coefficient:coefficients?.[i]??null}))
 };
}

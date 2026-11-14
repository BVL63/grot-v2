/**
 * ГРОТ 2.0: единая таблица для любого года.
 * Чистая функция для предварительного просмотра: не обращается к localStorage,
 * не меняет исходные данные и не предполагает «Факт».
 */
import {vacationDays} from './periodCalendarV2.js';
const MONTHS=['Январь','Февраль','Март','Апрель','Май','Июнь',
 'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const dateText=s=>s?String(s).slice(8,10)+'.'+String(s).slice(5,7)+'.'+String(s).slice(2,4):'';
/** Только представление ФИО в годовой таблице; исходные поля не изменяем. */
export function shortStaffName(person){
 const name=String(person?.name||'').trim();
 const surname=String(person?.lastName||'').trim();
 const first=String(person?.firstName||'').trim();
 const middle=String(person?.middleName||'').trim();
 if(surname){
  const initial=x=>x?x[0].toLocaleUpperCase('ru')+'.':'';
  if(first||middle)return surname+' '+initial(first)+initial(middle);
  if(name.startsWith(surname+' '))return shortStaffName({name:name.slice(surname.length).trim(),lastName:surname});
 }
 if(!name)return surname;
 const chunks=name.split(/\s+/);
 if(chunks.length<2)return name;
 const initial=x=>x.length===2&&x.endsWith('.')?x[0]+'.':x[0].toLocaleUpperCase('ru')+'.';
 if(chunks.length===2&&/^[А-ЯЁ]\.[А-ЯЁ]\.$/i.test(chunks[1]))return name;
 return chunks[0]+' '+chunks.slice(1,3).map(initial).join('');
}

function monthIntersections(record,year){
 const a=record.period?.start,b=record.period?.end;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(a||'')||!/^\d{4}-\d{2}-\d{2}$/.test(b||'')||b<a)return [];
 const first=new Date(a+'T12:00:00Z');
 const last=new Date(b+'T12:00:00Z');
 const items=[];
 for(let m=0;m<12;m++){
  const start=new Date(Date.UTC(year,m,1,12)),end=new Date(Date.UTC(year,m+1,0,12));
  if(first>end||last<start)continue;
  const from=new Date(Math.max(first,start)),to=new Date(Math.min(last,end));
  const days=Math.round((to-from)/86400000)+1;
  items.push({month:m,from:from.toISOString().slice(0,10),to:to.toISOString().slice(0,10),days});
 }
 return items;
}
export function buildUnifiedYearView(year,records=[],staff=[]){
 const y=Number(year);
 if(!Number.isInteger(y)||y<2000||y>2200)throw new RangeError('Некорректный год');
 const people=new Map();
 for(const employee of staff){
  const id=String(employee.id);
  if(!people.has(id))people.set(id,{id,name:employee.name||[employee.lastName,employee.firstName,employee.middleName].filter(Boolean).join(' '),shortName:shortStaffName(employee),periods:[],months:Array.from({length:12},()=>[])});
 }
 for(const r of records){
  if(Number(r.year)!==y)continue;
  const id=r.staffId==null?'unmatched:'+String(r.staffName||r.id):String(r.staffId);
  if(!people.has(id))people.set(id,{id,name:r.staffName||'Не установлен',periods:[],months:Array.from({length:12},()=>[])});
  const person=people.get(id);
  person.periods.push(r);
  for(const segment of monthIntersections(r,y))person.months[segment.month].push({...segment,id:r.id});
 }
 return {year:y,months:MONTHS,rows:[...people.values()].sort((a,b)=>a.name.localeCompare(b.name,'ru'))};
}
/**
 * На одном месяце даты располагаются вертикально.
 * Период через несколько месяцев показываем одной объединённой ячейкой,
 * только когда объединение не скрывает другой отпуск в тех же месяцах.
 */
const duration=vacationDays;
/** Раскладываем периоды по горизонтальным дорожкам.
 * Пересечение одних и тех же месяцев допустимо, но на разных дорожках.
 * Благодаря этому каждый отпуск рисуется ОДИН раз, в colspan-ячейке.
 */
function monthLanes(row){
 const entries=row.periods.map(rec=>{
  const all=monthIntersections(rec,Number(rec.year));
  if(!all.length)return null;
  return {rec,first:all[0].month,last:all[all.length-1].month};
 }).filter(Boolean).sort((a,b)=>a.first-b.first||a.last-b.last);
 const lanes=[];
 for(const entry of entries){
  let lane=lanes.find(items=>items.every(p=>p.last<entry.first||p.first>entry.last));
  if(!lane){lane=[];lanes.push(lane);}
  lane.push(entry);
 }
 return lanes.length?lanes:[[]];
}
/** Отступы в долях ширины объединённых месячных ячеек.
 * У каждого месяца одинаковая ширина, независимо от числа дней.
 */
export function proportionalMonthOffsets(start,end,span){
 const firstDay=Number(start.slice(8,10)),lastDay=Number(end.slice(8,10));
 const firstLength=new Date(Date.UTC(Number(start.slice(0,4)),Number(start.slice(5,7)),0)).getUTCDate();
 const lastLength=new Date(Date.UTC(Number(end.slice(0,4)),Number(end.slice(5,7)),0)).getUTCDate();
 const total=Math.max(1,Number(span));
 return {left:Number((((firstDay-1)/firstLength)/total*100).toFixed(4)),
  right:Number((((lastLength-lastDay)/lastLength)/total*100).toFixed(4))};
}
function renderLane(lane){
 const starts=new Map(lane.map(entry=>[entry.first,entry]));
 const cells=[];
 for(let month=0;month<12;){
  const entry=starts.get(month);
  if(!entry){cells.push('<td class="empty-month"></td>');month++;continue;}
  const rec=entry.rec;
  const span=entry.last-entry.first+1;
  const dates=span>1
   ?'<span>'+dateText(rec.period.start)+' – '+dateText(rec.period.end)+'</span>'
   :'<span>'+dateText(rec.period.start)+'</span><span>'+dateText(rec.period.end)+'</span>';
  const offsets=span>1?proportionalMonthOffsets(rec.period.start,rec.period.end,span):null;
  const content=offsets
   ?'<span class="proportional-fill" aria-hidden="true" style="left:'+offsets.left+'%;right:'+offsets.right+'%"></span>'+
    '<span class="proportional-period-label">'+dates+'</span>'
   :dates;
  cells.push('<td'+(span>1?' colspan="'+span+'" class="period-span"':'')+'>'+
   '<button type="button" class="vacation-period '+(span>1?'multi-month proportional-period':'single-month')+
   '" data-period-id="'+esc(rec.id)+'" title="'+esc(dateText(rec.period.start)+' – '+dateText(rec.period.end))+'">'+
   content+'<strong>'+duration(rec.period.start,rec.period.end)+' дн.</strong></button></td>');
  month+=span;
 }
 return cells.join('');
}
export function renderUnifiedYearTable(view){
 const header=view.months.map(m=>'<th>'+esc(m)+'</th>').join('');
 const body=view.rows.map(row=>{
  const lanes=monthLanes(row);
  return lanes.map((lane,i)=>'<tr class="vacation-lane '+(lanes.length===1?'lane-single':i===0?'lane-first':i===lanes.length-1?'lane-last':'lane-middle')+'">'+
   (i===0?'<th scope="row" rowspan="'+lanes.length+'" title="'+esc(row.name)+'">'+esc(row.shortName||shortStaffName(row))+'</th>':'')+
   renderLane(lane)+'</tr>').join('');
 }).join('');
 return '<table class="annual-table grot-unified-year"><thead><tr><th scope="col">Сотрудник</th>'+header+
 '</tr></thead><tbody>'+body+'</tbody></table>';
}

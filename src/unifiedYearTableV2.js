/**
 * ГРОТ 2.0: единая таблица для любого года.
 * Чистая функция для предварительного просмотра: не обращается к localStorage,
 * не меняет исходные данные и не предполагает «Факт».
 */
const MONTHS=['Январь','Февраль','Март','Апрель','Май','Июнь',
 'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const dateText=s=>s?String(s).slice(8,10)+'.'+String(s).slice(5,7)+'.'+String(s).slice(2,4):'';
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
  if(!people.has(id))people.set(id,{id,name:employee.name||[employee.lastName,employee.firstName,employee.middleName].filter(Boolean).join(' '),periods:[],months:Array.from({length:12},()=>[])});
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
const duration=(start,end)=>{
 const a=Date.parse(start+'T12:00:00Z'),b=Date.parse(end+'T12:00:00Z');
 return Number.isFinite(a)&&Number.isFinite(b)?Math.round((b-a)/86400000)+1:0;
};
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
  cells.push('<td'+(span>1?' colspan="'+span+'" class="period-span"':'')+'>'+
   '<button type="button" class="vacation-period '+(span>1?'multi-month':'single-month')+
   '" data-period-id="'+esc(rec.id)+'" title="'+esc(dateText(rec.period.start)+' – '+dateText(rec.period.end))+'">'+
   dates+'<strong>'+duration(rec.period.start,rec.period.end)+' дн.</strong></button></td>');
  month+=span;
 }
 return cells.join('');
}
export function renderUnifiedYearTable(view){
 const header=view.months.map(m=>'<th>'+esc(m)+'</th>').join('');
 const body=view.rows.map(row=>{
  const lanes=monthLanes(row);
  return lanes.map((lane,i)=>'<tr class="vacation-lane">'+
   (i===0?'<th scope="row" rowspan="'+lanes.length+'">'+esc(row.name)+'</th>':'')+
   renderLane(lane)+'</tr>').join('');
 }).join('');
 return '<table class="annual-table grot-unified-year"><thead><tr><th scope="col">Сотрудник</th>'+header+
 '</tr></thead><tbody>'+body+'</tbody></table>';
}

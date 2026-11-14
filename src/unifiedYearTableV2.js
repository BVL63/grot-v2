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
/** 
 * Периоды могут находиться в одной строке, даже если попадают в один месяц.
 * При этом учитываем минимальную ширину подписи ~94px (около 0.94 месяца):
 * календарное непересечение само по себе не гарантирует отсутствие наложения.
 */
function monthPosition(iso,year,isEnd=false){
 const value=isEnd?(iso>year+'-12-31'?year+'-12-31':iso):(iso<year+'-01-01'?year+'-01-01':iso);
 const m=Number(value.slice(5,7))-1;
 const days=new Date(Date.UTC(year,m+1,0)).getUTCDate();
 return m+(Number(value.slice(8,10))-1+(isEnd?1:0))/days;
}
function monthLanes(row){
 const entries=row.periods.map(rec=>{
  const y=Number(rec.year),all=monthIntersections(rec,y);
  if(!all.length)return null;
  const startAt=monthPosition(rec.period.start,y);
  const endAt=monthPosition(rec.period.end,y,true);
  return {rec,first:all[0].month,last:all[all.length-1].month,
   startAt,endAt,visualEnd:Math.max(endAt,startAt+0.94)};
 }).filter(Boolean).sort((a,b)=>a.startAt-b.startAt||a.endAt-b.endAt);
 const lanes=[];
 for(const entry of entries){
  const lane=lanes.find(items=>items.every(p=>p.visualEnd+0.035<=entry.startAt||
   entry.visualEnd+0.035<=p.startAt));
  if(lane)lane.push(entry);
  else lanes.push([entry]);
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
/** Общая ячейка для нескольких независимых отпусков, попавших в одни месяцы. */
function renderSharedGroup(entries,first,last){
 const span=last-first+1,year=Number(entries[0].rec.year);
 const boundaries=Array.from({length:span-1},(_,i)=>
  '<span class="shared-month-boundary" style="left:'+((i+1)/span*100).toFixed(4)+'%"></span>').join('');
 const buttons=entries.map(entry=>{
  const rec=entry.rec;
  const left=Number(((entry.startAt-first)/span*100).toFixed(4));
  const right=Number(((last+1-entry.endAt)/span*100).toFixed(4));
  const text=entry.first===entry.last
   ?'<span>'+dateText(rec.period.start)+'</span><span>'+dateText(rec.period.end)+'</span>'
   :'<span>'+dateText(rec.period.start)+' – '+dateText(rec.period.end)+'</span>';
  return '<button type="button" class="vacation-period shared-period" data-period-id="'+esc(rec.id)+
   '" title="'+esc(dateText(rec.period.start)+' – '+dateText(rec.period.end))+
   '" style="--shared-left:'+left+'%;--shared-right:'+right+'%">'+
   '<span class="shared-period-dates">'+text+'</span><strong>'+duration(rec.period.start,rec.period.end)+' дн.</strong></button>';
 }).join('');
 return '<td colspan="'+span+'" class="shared-months-cell">'+boundaries+buttons+'</td>';
}
function renderLane(lane){
 // Объединяем только пересекающиеся месячные диапазоны одной дорожки:
 // так общий март Королёвой не приводит к дополнительной строке.
 const groups=[];
 for(const entry of [...lane].sort((a,b)=>a.first-b.first||a.startAt-b.startAt)){
  const lastGroup=groups[groups.length-1];
  if(lastGroup&&entry.first<=lastGroup.last){
   lastGroup.items.push(entry);lastGroup.last=Math.max(lastGroup.last,entry.last);
  }else groups.push({first:entry.first,last:entry.last,items:[entry]});
 }
 const starts=new Map(groups.map(group=>[group.first,group]));
 const cells=[];
 for(let month=0;month<12;){
  const group=starts.get(month);
  if(!group){cells.push('<td class="empty-month"></td>');month++;continue;}
  if(group.items.length>1){
   cells.push(renderSharedGroup(group.items,group.first,group.last));
   month=group.last+1;continue;
  }
  const entry=group.items[0],rec=entry.rec;
  const span=entry.last-entry.first+1;
  const dates=span>1
   ?'<span>'+dateText(rec.period.start)+' – '+dateText(rec.period.end)+'</span>'
   :'<span>'+dateText(rec.period.start)+'</span><span>'+dateText(rec.period.end)+'</span>';
  const offsets=span>1?proportionalMonthOffsets(rec.period.start,rec.period.end,span):null;
  const content=offsets
   ?'<span class="proportional-fill" style="--bar-left:'+offsets.left+'%;--bar-right:'+offsets.right+'%">'+
    '<span class="proportional-period-label">'+dates+'</span>'+
    '<strong>'+duration(rec.period.start,rec.period.end)+' дн.</strong></span>'
   :dates+'<strong>'+duration(rec.period.start,rec.period.end)+' дн.</strong>';
  cells.push('<td'+(span>1?' colspan="'+span+'" class="period-span"':'')+'>'+
   '<button type="button" class="vacation-period '+(span>1?'multi-month proportional-period':'single-month')+
   '" data-period-id="'+esc(rec.id)+'" title="'+esc(dateText(rec.period.start)+' – '+dateText(rec.period.end))+'">'+
   content+'</button></td>');
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

/** Формат UI: дд.мм.гг. В хранилище: ISO YYYY-MM-DD. */
export function displayDate(value){
 if(!value)return '';
 const m=String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
 return m?m[3]+'.'+m[2]+'.'+m[1].slice(2):String(value);
}
export function parseDisplayDate(value){
 const v=String(value||'').trim();
 if(!v)return '';
 const m=v.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
 if(!m)throw new Error('Введите дату в формате дд.мм.гг');
 const year=2000+Number(m[3]),month=Number(m[2]),day=Number(m[1]);
 const date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)
  throw new Error('Некорректная календарная дата');
 return String(year)+'-'+m[2]+'-'+m[1];
}
export function displayTimestamp(value){
 if(!value)return '—';
 const iso=String(value).slice(0,10);
 const date=displayDate(iso);
 return date+(String(value).includes('T')?' '+String(value).slice(11,16):'');
}

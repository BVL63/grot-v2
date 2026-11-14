import {buildUnifiedYearView,renderUnifiedYearTable} from './unifiedYearTableV2.js';
import {addVacationPeriod,editVacationPeriod,removeVacationPeriod} from './vacationEditorV2.js';
import {inspectPreviewImport} from './previewImportV2.js';
import {stageBundledHistory} from './stageHistoryV2.js';
import {queryVacationAudit} from './v2AuditJournal.js';
import {renderRangeCalendar,shiftMonth,vacationDays,endDateForDays} from './periodCalendarV2.js';
import './v2Preview.css';

const root=document.querySelector('#v2-root');
const buildInfo=typeof __GROT_BUILD__!=='undefined'
 ?__GROT_BUILD__
 :{version:'2.0.0-dev',build:'local',commit:'local',builtAt:null};
const buildDate=buildInfo.builtAt
 ?new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Vladivostok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(buildInfo.builtAt))
 :'локальная сборка';

const baseYears=[2025,2026,2027,2028];
const sampleStaff=[
 {id:'1',name:'Иванов Иван Иванович'},
 {id:'2',name:'Петров Пётр Петрович'},
 {id:'3',name:'Сидоров Сергей Сергеевич'}
];
let staff=sampleStaff.map(x=>({...x}));
let records=[
 {id:'demo-1',year:2026,chartId:null,staffId:'1',staffName:staff[0].name,period:{start:'2026-06-15',end:'2026-06-28'},audit:[]},
 {id:'demo-2',year:2027,chartId:null,staffId:'1',staffName:staff[0].name,period:{start:'2027-07-15',end:'2027-07-28'},audit:[]},
 {id:'demo-3',year:2027,chartId:null,staffId:'2',staffName:staff[1].name,period:{start:'2027-08-10',end:'2027-08-23'},audit:[]}
];
let year=2027,selected=null,dirty=false,loadedSource='Демонстрационные данные';
let originalImport=null,importReport='',historyReview=null;
const q=selector=>root.querySelector(selector);
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const editPolicy=()=>({year,readOnly:false,canEditPlan:true,canCorrect:true});
function dateFmt(s){return s?s.slice(8)+'.'+s.slice(5,7)+'.'+s.slice(0,4):'—';}
function draw(){
 const years=[...new Set([...baseYears,...records.map(r=>Number(r.year)).filter(Number.isInteger)])].sort((a,b)=>a-b);
 const active=records.filter(r=>!r.deleted);
 root.innerHTML=`
  <header class="v2-header">
   <div class="v2-heading"><strong>ГРАФИК ОТПУСКОВ</strong><small>ГРОТ 2.0 · тестовая версия</small></div>
   <div class="v2-header-controls">
    <div class="v2-version" title="Версия, номер сборки и код изменения">
     <strong>Версия ${escapeHtml(buildInfo.version)}</strong>
     <span>Сборка №${escapeHtml(buildInfo.build)} · ${escapeHtml(buildDate)}</span>
     <span>Изменение ${escapeHtml(buildInfo.commit)}</span>
    </div>
    <label>Год <select id="v2-year">${years.map(y=>`<option value="${y}" ${y===year?'selected':''}>${y}</option>`).join('')}</select></label>
   </div>
  </header>
  <main>
   <p class="warning"><strong>Только тестирование:</strong> изменения действуют в памяти этой страницы,
   исходный ГРОТ и его хранилище не изменяются. Для сохранения результата используйте «Сохранить данные».</p>
   <div class="toolbar">
    <button id="v2-add">Добавить период</button>
    <button id="v2-import">Загрузить JSON для просмотра</button>
    <button id="v2-export">Сохранить данные</button>
    <button id="v2-audit-open" type="button">Журнал изменений</button>
    <button id="v2-source" ${originalImport?'':'disabled'}>Исходный JSON</button>
    <span class="muted">${escapeHtml(loadedSource)} · ${dirty?'есть несохранённые изменения':'нет изменений'}</span>
   </div>
   <input id="v2-file" type="file" accept=".json,application/json" hidden>
   <p id="v2-import-report" role="status">${escapeHtml(importReport)}</p>
   ${historyReview?`<div class="warning"><p>Встроенная история 2026: ${historyReview.total} периодов, сопоставлено по фамилии: ${historyReview.matched}, не сопоставлено: ${historyReview.unresolved}. Даты требуют проверки; это не подтверждённый факт отпуска.</p><button type="button" id="v2-stage-history">Добавить историю 2026 в тестовую копию</button></div>`:''}
   <div class="table-wrap">${renderUnifiedYearTable(buildUnifiedYearView(year,active,staff))}</div>
  </main>
  <div id="v2-period-menu" class="period-context-menu" role="menu" aria-label="Действия с периодом" hidden>
   <button type="button" role="menuitem" id="v2-menu-edit">Изменить</button>
   <button type="button" role="menuitem" id="v2-menu-delete">Удалить</button>
  </div>
  <dialog id="v2-audit-dialog">
   <div class="audit-header"><h2>Журнал изменений</h2><button type="button" id="v2-audit-close">Закрыть</button></div>
   <p class="muted">Просмотр по запросу. Не влияет на ввод отпусков.</p>
   <div class="audit-filters"><label>Год <select id="v2-audit-year"><option value="all">Все годы</option>${years.map(y=>`<option value="${y}" ${y===year?'selected':''}>${y}</option>`).join('')}</select></label>
   <label>Сотрудник <input type="search" id="v2-audit-search" placeholder="Поиск по ФИО"></label></div>
   <p id="v2-audit-count" class="muted"></p>
   <div class="audit-results" id="v2-audit-results"></div>
  </dialog>
  <dialog id="v2-dialog">
   <form method="dialog" id="v2-editor">
    <h2 id="v2-dialog-title">Отпуск</h2>
    <label>Сотрудник <select name="staffId" required>${staff.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}</select></label>
    <div class="calendar-panel">
     <div class="calendar-bar">
      <button type="button" id="v2-calendar-prev" aria-label="Предыдущий месяц">‹</button>
      <strong id="v2-calendar-hint">Выберите начало отпуска</strong>
      <button type="button" id="v2-calendar-next" aria-label="Следующий месяц">›</button>
     </div>
     <div id="v2-calendar-months" class="calendar-months" aria-label="Даты отпуска"></div>
     <p id="v2-calendar-summary" class="calendar-summary" aria-live="polite"></p>
    </div>
    <div class="calendar-date-fields">
     <label>Начало <input name="start" type="date" required></label>
     <label>Конец <input name="end" type="date" required></label>
     <label>Дней <input name="days" type="number" min="1" max="3660" step="1" inputmode="numeric" required></label>
    </div>
    <p class="calendar-help">Выберите начало и конец в календаре — дни рассчитаются сами. Или введите начало и количество дней — конец рассчитается автоматически. Праздничные дни не учитываются.</p>
    <label>Причина изменения
     <select name="reasonPreset" required>
      <option value="">Выберите причину</option>
      <option value="По заявлению сотрудника">По заявлению сотрудника</option>
      <option value="Производственная необходимость">Производственная необходимость</option>
      <option value="По согласованию сторон">По согласованию сторон</option>
      <option value="Исправление ошибки в графике">Исправление ошибки в графике</option>
      <option value="Корректировка исторических данных">Корректировка исторических данных</option>
      <option value="Отмена отпуска">Отмена отпуска</option>
      <option value="other">Другая причина…</option>
     </select>
    </label>
    <label id="v2-reason-other-wrap" hidden>Уточните причину
     <input name="reasonOther" placeholder="Укажите свою причину">
    </label>
    <p id="v2-error" role="alert"></p>
    <div class="actions"><button type="button" id="v2-save">Сохранить</button>
    <button type="button" id="v2-delete">Удалить</button>
    <button type="button" id="v2-close">Закрыть</button></div>
   </form>
  </dialog>
  <footer>ГРОТ 2.0 — демонстрация · основной график не затронут</footer>`;
 q('#v2-year').onchange=e=>{year=Number(e.target.value);selected=null;draw();};
 q('#v2-add').onclick=()=>openEditor(null);
 q('#v2-import').onclick=()=>q('#v2-file').click();
 q('#v2-file').onchange=importJson;
 q('#v2-export').onclick=exportJson;
 q('#v2-audit-open').onclick=()=>{q('#v2-audit-year').value=String(year);q('#v2-audit-search').value='';renderAudit();q('#v2-audit-dialog').showModal();};
 q('#v2-audit-close').onclick=()=>q('#v2-audit-dialog').close();
 q('#v2-audit-year').onchange=renderAudit;
 q('#v2-audit-search').oninput=renderAudit;
 q('#v2-source').onclick=()=>{if(originalImport)downloadJson(originalImport,'grot-v2-original-import.json');};
 const stageButton=q('#v2-stage-history');
 if(stageButton)stageButton.onclick=()=>{
  if(!confirm('Добавить встроенную историю 2026 только в тестовую копию? Даты останутся помеченными как непроверенные.'))return;
  try{const staged=stageBundledHistory(records,historyReview);
   records=staged.records;year=2026;dirty=true;
   importReport='История 2026: добавлено '+staged.counts.added+', повторов '+staged.counts.duplicates+', без сопоставления '+staged.counts.unresolved+'.';
   draw();
  }catch(err){alert('История не добавлена: '+err.message);}
 };
 const table=q('.table-wrap');
 const menu=q('#v2-period-menu');
 const chosen=node=>records.find(r=>!r.deleted&&String(r.id)===node?.dataset.periodId)||null;
 let touchTimer=null, touchStart=null, ignoreClick=false;
 const hideMenu=()=>{menu.hidden=true;};
 const showMenu=(node,x,y)=>{
  const rec=chosen(node);if(!rec)return;
  selected=rec;
  menu.hidden=false;
  menu.style.left=Math.max(8,Math.min(x,window.innerWidth-menu.offsetWidth-8))+'px';
  menu.style.top=Math.max(8,Math.min(y,window.innerHeight-menu.offsetHeight-8))+'px';
  menu.querySelector('#v2-menu-edit').focus({preventScroll:true});
 };
 table.addEventListener('contextmenu',e=>{
  const node=e.target.closest('[data-period-id]');
  if(!node)return;
  e.preventDefault();
  clearTimeout(touchTimer);
  showMenu(node,e.clientX,e.clientY);
 });
 table.addEventListener('click',e=>{
  const node=e.target.closest('[data-period-id]');
  if(ignoreClick){ignoreClick=false;return;}
  if(!menu.hidden){hideMenu();return;}
  if(!node)return;
  const rec=chosen(node);
  if(rec)openEditor(rec);
 });
 table.addEventListener('pointerdown',e=>{
  if(e.pointerType!=='touch')return;
  const node=e.target.closest('[data-period-id]');
  if(!node)return;
  touchStart={x:e.clientX,y:e.clientY};
  clearTimeout(touchTimer);
  touchTimer=setTimeout(()=>{
   ignoreClick=true;showMenu(node,touchStart.x,touchStart.y);
  },600);
 });
 table.addEventListener('pointermove',e=>{
  if(!touchStart)return;
  if(Math.abs(e.clientX-touchStart.x)>12||Math.abs(e.clientY-touchStart.y)>12){
   clearTimeout(touchTimer);touchStart=null;
  }
 });
 const endTouch=()=>{clearTimeout(touchTimer);touchStart=null;if(ignoreClick)setTimeout(()=>{ignoreClick=false;},350);};
 table.addEventListener('pointerup',endTouch);
 table.addEventListener('pointercancel',endTouch);
 table.addEventListener('scroll',hideMenu,{passive:true});
 q('#v2-menu-edit').onclick=()=>{const rec=selected;hideMenu();if(rec)openEditor(rec);};
 q('#v2-menu-delete').onclick=()=>{const rec=selected;hideMenu();if(rec)openEditor(rec,{deleting:true});};
 root.onclick=e=>{if(!e.target.closest('#v2-period-menu')&&!e.target.closest('[data-period-id]'))hideMenu();};
 menu.addEventListener('keydown',e=>{if(e.key==='Escape'){hideMenu();e.preventDefault();}});
 
}
const auditDates=x=>x&&typeof x==='object'?
 escapeHtml([x.start,x.end].filter(Boolean).join(' — ')||JSON.stringify(x)):
 escapeHtml(x===null?'—':String(x));
function renderAudit(){
 const dialog=q('#v2-audit-dialog');if(!dialog)return;
 const current=dialog.querySelector('#v2-audit-year').value;
 const search=dialog.querySelector('#v2-audit-search').value;
 const found=queryVacationAudit(records,{year:current==='all'?null:Number(current),search});
 dialog.querySelector('#v2-audit-count').textContent='Записей: '+found.length;
 dialog.querySelector('#v2-audit-results').innerHTML=found.length?
  found.map(a=>'<article class="audit-entry"><div><strong>'+escapeHtml(a.employee)+
  '</strong> · '+escapeHtml(a.year)+' · '+escapeHtml(a.date)+'</div>'+
  '<div>Кто: '+escapeHtml(a.actor)+' · Причина: '+escapeHtml(a.reason)+'</div>'+
  '<div>Было: '+auditDates(a.previous)+'</div>'+
  '<div>Стало: '+auditDates(a.next)+'</div></article>').join(''):
  '<p>По выбранным условиям изменений не найдено.</p>';
}
function openEditor(rec,{deleting=false}={}){
 selected=rec;
 const form=q('#v2-editor');
 q('#v2-dialog-title').textContent=deleting?'Удалить период':rec?'Изменить период':'Добавить период';
 q('#v2-save').hidden=deleting;
 form.elements.staffId.value=rec?.staffId||staff[0]?.id||'';
 form.elements.staffId.disabled=!!rec;
 form.elements.start.value=rec?.period.start||'';
 form.elements.end.value=rec?.period.end||'';
 form.elements.days.value=form.elements.start.value&&form.elements.end.value
  ?vacationDays(form.elements.start.value,form.elements.end.value):'';
 let calendarAnchor=(form.elements.start.value||year+'-01-01').slice(0,7);
 let calendarNext='start';
 const updateCalendar=()=>{
  const start=form.elements.start.value,end=form.elements.end.value;
  q('#v2-calendar-months').innerHTML=renderRangeCalendar(start,end,calendarAnchor);
  q('#v2-calendar-hint').textContent=calendarNext==='start'?'Нажмите начало отпуска':'Нажмите конец отпуска';
  q('#v2-calendar-summary').textContent=start&&end
   ?'Отпуск: '+dateFmt(start)+' — '+dateFmt(end)+' · '+vacationDays(start,end)+' дней отпуска'
   :start?'Начало: '+dateFmt(start)+' · выберите последний день отпуска'
   :'Нажмите на день начала отпуска';
 };
 q('#v2-calendar-prev').onclick=()=>{calendarAnchor=shiftMonth(calendarAnchor,-1);updateCalendar();};
 q('#v2-calendar-next').onclick=()=>{calendarAnchor=shiftMonth(calendarAnchor,1);updateCalendar();};
 q('#v2-calendar-months').onclick=e=>{
  const day=e.target.closest('[data-calendar-day]');
  if(!day)return;
  const date=day.dataset.calendarDay;
  if(calendarNext==='start'){
   form.elements.start.value=date;
   form.elements.end.value='';
   calendarNext='end';
  }else{
   const start=form.elements.start.value;
   if(date<start){form.elements.start.value=date;form.elements.end.value=start;}
   else form.elements.end.value=date;
   calendarNext='start';
  }
  form.elements.days.value=form.elements.start.value&&form.elements.end.value
   ?vacationDays(form.elements.start.value,form.elements.end.value):'';
  updateCalendar();
 };
 form.elements.start.onchange=()=>{
  const start=form.elements.start.value;
  // После смены начала сохраняем указанную продолжительность.
  if(start&&form.elements.days.value){
   try{form.elements.end.value=endDateForDays(start,form.elements.days.value);q('#v2-error').textContent='';}
   catch(err){q('#v2-error').textContent=err.message;}
  }else if(start&&form.elements.end.value){
   form.elements.days.value=vacationDays(start,form.elements.end.value);
  }
  if(start)calendarAnchor=start.slice(0,7);
  calendarNext=start&&!form.elements.end.value?'end':'start';
  updateCalendar();
 };
 form.elements.end.onchange=()=>{
  const start=form.elements.start.value,end=form.elements.end.value;
  if(start&&end&&end<start)q('#v2-error').textContent='Конец отпуска должен быть не раньше начала';
  else q('#v2-error').textContent='';
  form.elements.days.value=start&&end?vacationDays(start,end):'';
  if(start)calendarAnchor=start.slice(0,7);
  calendarNext=start&&!end?'end':'start';
  updateCalendar();
 };
 form.elements.days.onchange=()=>{
  try{
   form.elements.end.value=endDateForDays(form.elements.start.value,form.elements.days.value);
   q('#v2-error').textContent='';
   calendarNext='start';
  }catch(err){q('#v2-error').textContent=err.message;}
  updateCalendar();
 };
 updateCalendar();
 form.elements.reasonPreset.value='';
 form.elements.reasonOther.value='';
 q('#v2-reason-other-wrap').hidden=true;
 form.elements.reasonOther.required=false;
 form.elements.reasonPreset.onchange=()=>{
  const other=form.elements.reasonPreset.value==='other';
  q('#v2-reason-other-wrap').hidden=!other;
  form.elements.reasonOther.required=other;
  if(other)form.elements.reasonOther.focus();
 };
 const selectedReason=()=>{
  const preset=form.elements.reasonPreset.value;
  const reason=(preset==='other'?form.elements.reasonOther.value:preset).trim();
  if(!reason)throw new Error('Выберите причину или укажите свою');
  return reason;
 };
 q('#v2-error').textContent=rec?.verificationStatus==='unverified-source'?'Даты перенесены из встроенной истории, не проверены. Для корректировки укажите причину.':'';
 q('#v2-delete').hidden=!rec;
 if(deleting)q('#v2-error').textContent='Укажите причину и подтвердите удаление периода.';
 q('#v2-save').onclick=()=>{
  try{
   const meta={actor:'Пользователь тестового экрана',reason:selectedReason(),at:new Date().toISOString()};
   if(rec)records=editVacationPeriod(records,rec.id,{
    start:form.elements.start.value,end:form.elements.end.value},editPolicy(),meta);
   else{
    const person=staff.find(x=>x.id===form.elements.staffId.value);
    if(!person)throw new Error('Выберите сотрудника');
    const id='preview-'+(globalThis.crypto?.randomUUID?.()||String(Date.now())+'-'+records.length);
    records=addVacationPeriod(records,{
     id,year,staffId:person.id,staffName:person.name,chartId:null,
     start:form.elements.start.value,end:form.elements.end.value},editPolicy(),meta);
   }
   dirty=true;q('#v2-dialog').close();draw();
  }catch(err){q('#v2-error').textContent=err.message;}
 };
 q('#v2-delete').onclick=()=>{
  try{
   const reason=selectedReason();
   if(!reason)throw new Error('Укажите причину удаления');
   if(!confirm('Удалить отпуск '+(rec.staffName||'сотрудника')+' с '+dateFmt(rec.period.start)+' по '+dateFmt(rec.period.end)+'?'))return;
   records=removeVacationPeriod(records,rec.id,editPolicy(),{
    actor:'Пользователь тестового экрана',reason,at:new Date().toISOString()});
   dirty=true;q('#v2-dialog').close();draw();
  }catch(err){q('#v2-error').textContent=err.message;}
 };
 q('#v2-close').onclick=()=>q('#v2-dialog').close();
 q('#v2-dialog').showModal();
}
async function importJson(e){
 const file=e.target.files?.[0];if(!file)return;
 try{
  const data=JSON.parse(await file.text());
  const inspected=inspectPreviewImport(data);
  importReport='Исходных периодов: '+inspected.counts.original+
   ', преобразовано: '+inspected.counts.converted+'. '+
   [...(inspected.problems||[]),...(inspected.warnings||[])].join('; ');
  if(!inspected.ok){alert('Импорт не выполнен: '+inspected.problems.join('; '));draw();return;}
  const newRecords=inspected.records,newStaff=inspected.staff;
  records=newRecords;staff=newStaff;originalImport=inspected.sourceSnapshot;
  historyReview=inspected.bundledHistoryReview||null;
  loadedSource='Проверен файл: '+file.name;
  if(!records.some(r=>Number(r.year)===year))year=records[0]?.year||2027;
  dirty=false;selected=null;draw();
 }catch(err){alert('Импорт не выполнен: '+err.message);}
}
function downloadJson(data,name){
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportJson(){
 downloadJson({schemaVersion:2,staff,records},'grot-v2-preview-'+year+'.json');
 dirty=false;draw();
}
draw();

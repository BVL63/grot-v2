import {buildUnifiedYearView,renderUnifiedYearTable} from './unifiedYearTableV2.js';
import {addVacationPeriod,editVacationPeriod,removeVacationPeriod} from './vacationEditorV2.js';
import {inspectPreviewImport} from './previewImportV2.js';
import {stageBundledHistory} from './stageHistoryV2.js';
import {queryVacationAudit} from './v2AuditJournal.js';
import {renderRangeCalendar,shiftMonth,vacationDays,endDateForDays} from './periodCalendarV2.js';
import {DRAFT_KEY,parseLocalDraft,makeLocalDraft} from './localDraftV2.js';
import {validateStructure,fillMissingStructureCodes,structureRows,structurePath,staffForStructure,upsertStructure,upsertStaff,unassignedStaff,assignStaffToStructure,selectDepartmentGraph} from './organizationDirectoryV2.js';
import {displayDate,parseDisplayDate,displayTimestamp} from './dateDisplayV2.js';
import {validateCharts,saveChart,staffInChart,chartMemberIdsByStructure,resolveChartStaffIds} from './chartRosterV2.js';
import './v2Preview.css';

const root=document.querySelector('#v2-root');
const buildInfo=typeof __GROT_BUILD__!=='undefined'
 ?__GROT_BUILD__
 :{version:'2.0.0-dev',build:'local',commit:'local',builtAt:null};
const buildDate=buildInfo.builtAt
 ?new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Vladivostok',day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(buildInfo.builtAt))
 :'локальная сборка';

const baseYears=[2025,2026,2027,2028];
const sampleStaff=[
 {id:'1',name:'Иванов Иван Иванович'},
 {id:'2',name:'Петров Пётр Петрович'},
 {id:'3',name:'Сидоров Сергей Сергеевич'}
];
let staff=sampleStaff.map(x=>({...x}));
let structure=[];
let records=[
 {id:'demo-1',year:2026,chartId:null,staffId:'1',staffName:staff[0].name,period:{start:'2026-06-15',end:'2026-06-28'},audit:[]},
 {id:'demo-2',year:2027,chartId:null,staffId:'1',staffName:staff[0].name,period:{start:'2027-07-15',end:'2027-07-28'},audit:[]},
 {id:'demo-3',year:2027,chartId:null,staffId:'2',staffName:staff[1].name,period:{start:'2027-08-10',end:'2027-08-23'},audit:[]}
];
let year=2027,selected=null,dirty=false,loadedSource='Демонстрационные данные';
let selectedGraphId='';
let charts=[];
let originalImport=null,importReport='',historyReview=null;
let localSaveStatus='Локальное сохранение не проверено';
function persistDraft(){
 try{
  localStorage.setItem(DRAFT_KEY,makeLocalDraft({staff,records,structure,charts,year,source:loadedSource,dirty}));
  localSaveStatus='Автосохранение на этом устройстве';
 }catch(err){
  localSaveStatus='Автосохранение недоступно — сохраните файл';
 }
}
function restoreDraftAtStartup(){
 try{
  const draft=parseLocalDraft(localStorage.getItem(DRAFT_KEY));
  if(!draft){localSaveStatus='Локальная копия отсутствует';return;}
  staff=draft.staff;records=draft.records;structure=draft.structure||[];charts=draft.charts||[];year=draft.year;
  loadedSource=draft.source;dirty=draft.dirty;
  localSaveStatus='Восстановлено с этого устройства'+(draft.savedAt?' · '+new Date(draft.savedAt).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}):'');
  importReport='Автоматически восстановлена локальная копия. Рекомендуется также сохранять резервный файл.';
 }catch{localSaveStatus='Локальное сохранение недоступно';}
}
restoreDraftAtStartup();
const q=selector=>root.querySelector(selector);
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const editPolicy=()=>({year,readOnly:false,canEditPlan:true,canCorrect:true});
function dateFmt(s){return displayDate(s)||'—';}
function draw(){
 const years=[...new Set([...baseYears,...records.map(r=>Number(r.year)).filter(Number.isInteger)])].sort((a,b)=>a-b);
 const active=records.filter(r=>!r.deleted);
 if(selectedGraphId&&!charts.some(n=>String(n.id)===String(selectedGraphId)&&Number(n.year)===year))selectedGraphId='';
 const graph=staffInChart(staff,active,charts,selectedGraphId,year,structure);
 const chartOptions=charts.filter(c=>Number(c.year)===year).map(c=>
  '<option value="'+escapeHtml(c.id)+'"'+(String(c.id)===selectedGraphId?' selected':'')+'>'+escapeHtml(c.name)+'</option>').join('');
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
   <p class="warning"><strong>ГРОТ 2.0 — тестовый режим.</strong> Данные автоматически сохраняются на этом устройстве в браузере. Для резервной копии используйте «Сохранить данные». Основной ГРОТ не затрагивается.</p>
   <div class="chart-selector"><label>График <select id="v2-chart"><option value="">Общий график</option>${chartOptions}</select></label>
    <button type="button" id="v2-chart-new">Новый график</button>
    <button type="button" id="v2-chart-edit" ${selectedGraphId?'':'disabled'}>Состав графика</button>
    <button type="button" id="v2-chart-delete" ${selectedGraphId?'':'disabled'}>Удалить график</button>
    <span class="muted">Сотрудников: ${graph.staff.length} · Периодов за ${year} год: ${graph.records.filter(r=>Number(r.year)===year).length}</span>
    <span class="muted">Изменения отображаются в общем графике автоматически</span></div>
   <div class="toolbar">
    <button id="v2-structure">Структура</button>
    <button id="v2-staff">Сотрудники</button>
    <button id="v2-add">Добавить период</button>
    <button id="v2-import">Восстановить данные</button>
    <button id="v2-export">Сохранить данные</button>
    <button id="v2-audit-open" type="button">Журнал изменений</button>
    <button id="v2-source" ${originalImport?'':'disabled'}>Исходный JSON</button>
    <span class="muted">${escapeHtml(loadedSource)} · ${dirty?'нет свежей файловой копии':'файловая копия актуальна'} · ${escapeHtml(localSaveStatus)}</span>
   </div>
   <input id="v2-file" type="file" accept=".json,application/json" hidden>
   <p id="v2-import-report" role="status">${escapeHtml(importReport)}</p>
   ${historyReview?`<div class="warning"><p>Встроенная история 2026: ${historyReview.total} периодов, сопоставлено по фамилии: ${historyReview.matched}, не сопоставлено: ${historyReview.unresolved}. Даты требуют проверки; это не подтверждённый факт отпуска.</p><button type="button" id="v2-stage-history">Добавить историю 2026 в тестовую копию</button></div>`:''}
   <div class="table-wrap">${renderUnifiedYearTable(buildUnifiedYearView(year,graph.records,graph.staff))}</div>
  </main>
  <div id="v2-period-menu" class="period-context-menu" role="menu" aria-label="Действия с периодом" hidden>
   <button type="button" role="menuitem" id="v2-menu-edit">Изменить</button>
   <button type="button" role="menuitem" id="v2-menu-delete">Удалить</button>
  </div>
  <dialog id="v2-chart-dialog">
   <div class="directory-heading"><h2 id="v2-chart-title">Состав графика</h2><button type="button" id="v2-chart-close">Закрыть</button></div>
   <label class="chart-name-label">Наименование графика <input id="v2-chart-name" type="text" maxlength="110" placeholder="Например, Водители — группы" required></label>
   <p class="muted">Отметьте нужные структурные звенья: сотрудники входят автоматически, в том числе добавленные позднее. Раскройте ветвь, чтобы увидеть сотрудников.</p>
   <div class="chart-tree-toolbar"><input id="v2-chart-search" type="search" placeholder="Поиск по структуре или ФИО"></div>
   <div id="v2-chart-roster" class="chart-roster-tree"></div>
   <div id="v2-chart-summary" class="chart-summary"></div>
   <details id="v2-chart-exceptions"><summary>Исключения и отдельные сотрудники</summary>
    <div class="chart-roster-controls">
     <input id="v2-chart-exception-search" type="search" placeholder="Поиск сотрудника по ФИО">
    </div>
    <div id="v2-chart-exception-list" class="directory-pick-list"></div>
    <p class="muted">Галочка включает сотрудника в график, снятие — исключает. Выбор звена не отменяется.</p>
   </details>
   <div class="directory-pick-footer"><button type="button" id="v2-chart-save">Сохранить график</button><span id="v2-chart-selected-count" class="muted"></span></div>
   <p id="v2-chart-error" role="alert"></p>
  </dialog>
  <dialog id="v2-directory-dialog">
   <div class="directory-heading"><h2 id="v2-directory-title">Справочник</h2><button type="button" id="v2-directory-close">Закрыть</button></div>
   <div class="directory-toolbar">
    <input id="v2-directory-search" type="search" placeholder="Поиск по названию или ФИО" aria-label="Поиск">
    <button type="button" id="v2-directory-add">Добавить</button>
    <button type="button" id="v2-structure-edit" hidden>Изменить</button>
    <button type="button" id="v2-structure-delete" hidden>Удалить</button>
    <button type="button" id="v2-structure-pick" hidden>Выбрать сотрудников</button>
    <button type="button" id="v2-structure-newstaff" hidden>Новый сотрудник</button>
    <button type="button" id="v2-structure-chart" hidden>Открыть график</button>
    <button type="button" id="v2-directory-load">Загрузить структуру</button>
    <button type="button" id="v2-directory-unassigned">Без подразделения</button>
    <button type="button" id="v2-directory-assign" hidden>Назначить выбранных</button>
    <input id="v2-directory-file" type="file" accept=".json,application/json" hidden>
    <span id="v2-directory-count" class="muted"></span>
   </div>
   <div id="v2-directory-content" class="directory-content"></div>
   <p id="v2-directory-attached" class="directory-attached" aria-live="polite"></p>
  </dialog>
  <dialog id="v2-structure-pick-dialog">
   <div class="directory-heading"><h2>Выбрать сотрудников</h2><button type="button" id="v2-structure-pick-close">Закрыть</button></div>
   <p id="v2-structure-pick-description"></p>
   <input id="v2-structure-pick-search" type="search" placeholder="Поиск по ФИО" aria-label="Поиск сотрудников">
   <div id="v2-structure-pick-list" class="directory-pick-list"></div>
   <div class="directory-pick-footer"><button type="button" id="v2-structure-pick-save">Сохранить состав</button><span id="v2-structure-pick-count" class="muted"></span></div>
  </dialog>
  <dialog id="v2-directory-editor">
   <form method="dialog" id="v2-directory-form">
    <h2 id="v2-directory-editor-title"></h2>
    <div id="v2-directory-fields"></div>
    <p id="v2-directory-error" role="alert"></p>
    <div class="actions"><button type="button" id="v2-directory-save">Сохранить</button><button type="button" id="v2-directory-cancel">Закрыть</button></div>
   </form>
  </dialog>
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
    <label>Сотрудник <select name="staffId" required>${graph.staff.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}</select></label>
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
     <label>Начало <input name="startDisplay" type="text" inputmode="numeric" placeholder="дд.мм.гг" maxlength="8" required><input name="start" type="hidden"></label>
     <label>Конец <input name="endDisplay" type="text" inputmode="numeric" placeholder="дд.мм.гг" maxlength="8" required><input name="end" type="hidden"></label>
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
      <option value="Корректировка">Корректировка</option>
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
 q('#v2-year').onchange=e=>{year=Number(e.target.value);selected=null;persistDraft();draw();};
 q('#v2-chart').onchange=e=>{selectedGraphId=e.target.value;selected=null;draw();};
 q('#v2-chart-new').onclick=()=>openChartEditor(null);
 q('#v2-chart-edit').onclick=()=>openChartEditor(charts.find(c=>String(c.id)===selectedGraphId)||null);
 q('#v2-chart-delete').onclick=()=>{
  const chart=charts.find(c=>String(c.id)===selectedGraphId);
  if(!chart||!confirm('Удалить график «'+chart.name+'»? Записи отпусков сотрудников сохранятся в общем графике.'))return;
  charts=charts.filter(c=>String(c.id)!==selectedGraphId);
  selectedGraphId='';dirty=true;persistDraft();draw();
 };
 q('#v2-chart-close').onclick=()=>q('#v2-chart-dialog').close();
 q('#v2-add').onclick=()=>openEditor(null);
 q('#v2-structure').onclick=()=>openDirectory('structure');
 q('#v2-staff').onclick=()=>openDirectory('staff');
 q('#v2-directory-close').onclick=()=>q('#v2-directory-dialog').close();
 q('#v2-directory-search').oninput=renderDirectory;
 q('#v2-directory-add').onclick=()=>editDirectoryItem(null);
 q('#v2-structure-edit').onclick=()=>{if(selectedStructureId)editDirectoryItem(selectedStructureId);};
 q('#v2-structure-delete').onclick=removeSelectedStructure;
 q('#v2-structure-chart').onclick=()=>{if(!selectedStructureId)return;q('#v2-directory-dialog').close();openChartEditor(null,selectedStructureId);};
 q('#v2-structure-pick').onclick=openStructurePicker;
 q('#v2-structure-newstaff').onclick=()=>{
  if(!selectedStructureId)return;
  newStaffStructureId=selectedStructureId;
  directoryMode='staff';editDirectoryItem(null);directoryMode='structure';
 };
 q('#v2-structure-pick-close').onclick=()=>q('#v2-structure-pick-dialog').close();
 q('#v2-directory-unassigned').onclick=()=>{directoryUnassignedOnly=!directoryUnassignedOnly;renderDirectory();};
 q('#v2-directory-assign').onclick=bulkAssignDirectory;
 q('#v2-directory-load').onclick=()=>q('#v2-directory-file').click();
 q('#v2-directory-file').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
   const data=JSON.parse(await file.text());
   const incoming=validateStructure(data.structure);
   if(!incoming.length)throw new Error('В файле нет структуры');
   if(!confirm('Загрузить '+incoming.length+' элементов структуры? Сотрудники и отпуска останутся без изменений. Текущий справочник структуры будет заменён.'))return;
   structure=fillMissingStructureCodes(incoming);
   dirty=true;persistDraft();renderDirectory();
  }catch(err){alert('Не удалось загрузить структуру: '+err.message);}
  finally{e.target.value='';}
 };
 q('#v2-directory-cancel').onclick=()=>q('#v2-directory-editor').close();
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
   records=staged.records;year=2026;dirty=true;persistDraft();
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
function openChartEditor(chart,initialStructureId=''){
 const dialog=q('#v2-chart-dialog');
 // Старые графики с ручным перечнем сотрудников остаются совместимыми.
 const selectedNodes=new Set((chart?.structureIds||[]).map(String));
 if(initialStructureId)selectedNodes.add(String(initialStructureId));
 const explicit=new Set((chart?.includeIds||(!chart?.structureIds?.length?chart?.staffIds:[])||[]).map(String));
 const excluded=new Set((chart?.excludeIds||[]).map(String));
 const expanded=new Set();
 if(initialStructureId)expanded.add(String(initialStructureId));
 const rows=structureRows(structure),children=new Set(structure.map(n=>String(n.parentId)));
 for(const node of rows)if(node.depth<2)expanded.add(String(node.id));
 if(initialStructureId){let node=structure.find(n=>String(n.id)===String(initialStructureId));while(node){expanded.add(String(node.id));node=structure.find(n=>String(n.id)===String(node.parentId));}}
 q('#v2-chart-title').textContent='Состав графика · '+year;
 q('#v2-chart-name').value=chart?.name||'';
 q('#v2-chart-search').value='';
 q('#v2-chart-exception-search').value='';
 q('#v2-chart-error').textContent='';
 const automatic=()=>{
  const ids=new Set();
  for(const id of selectedNodes)for(const member of chartMemberIdsByStructure(staff,structure,id))ids.add(member);
  return ids;
 };
 const chosen=()=>{
  const ids=automatic();
  for(const id of explicit)ids.add(id);
  for(const id of excluded)ids.delete(id);
  return ids;
 };
 const membersOf=id=>new Set(chartMemberIdsByStructure(staff,structure,id));
 const renderSummary=()=>{
  const ids=chosen();
  const labels=rows.filter(n=>selectedNodes.has(String(n.id)))
   .map(n=>structurePath(structure,n.id));
  q('#v2-chart-selected-count').textContent='Сотрудников: '+ids.size;
  q('#v2-chart-summary').textContent='Выбрано звеньев: '+selectedNodes.size+
   ' · Сотрудников: '+ids.size+(labels.length?' · '+labels.join('; '):'');
 };
 const renderTree=()=>{
  const previousScroll=q('#v2-chart-roster')?.scrollTop||0;
  const search=q('#v2-chart-search').value.trim().toLocaleLowerCase('ru').replace(/ё/g,'е');
  const norm=v=>String(v||'').toLocaleLowerCase('ru').replace(/ё/g,'е');
  // При поиске оставляем предков найденных звеньев, чтобы не терять иерархию.
  const visibleIds=new Set();
  if(search)for(const node of rows){
   if(norm(node.name).includes(search)||norm(node.code).includes(search)||
      staff.some(p=>membersOf(node.id).has(String(p.id))&&norm(p.name).includes(search))){
    let n=node;while(n){visibleIds.add(String(n.id));n=structure.find(x=>String(x.id)===String(n.parentId));}
   }
  }
  const visible=rows.filter(n=>{
   if(search)return visibleIds.has(String(n.id));
   let parent=n.parentId;
   while(parent!=null){
    if(!expanded.has(String(parent)))return false;
    parent=structure.find(x=>String(x.id)===String(parent))?.parentId??null;
   }
   return true;
  });
  const selected=chosen();
  let html='';
  for(const node of visible){
   const members=membersOf(node.id);
   const included=[...members].filter(id=>selected.has(id)).length;
   const isChecked=selectedNodes.has(String(node.id));
   const hasChild=children.has(String(node.id));
   html+='<div class="chart-tree-node" style="--depth:'+node.depth+'">'+
    (hasChild?'<button type="button" data-chart-expand="'+escapeHtml(node.id)+'" aria-label="Раскрыть или свернуть">'+(expanded.has(String(node.id))?'▾':'▸')+'</button>':'<span class="chart-tree-gap"></span>')+
    '<input type="checkbox" data-chart-node="'+escapeHtml(node.id)+'"'+(isChecked?' checked':'')+'>'+
    '<span class="chart-tree-node-name" data-chart-expand="'+escapeHtml(node.id)+'">'+escapeHtml(node.name)+'</span>'+
    '<span class="chart-tree-code">'+escapeHtml(node.code||'')+'</span>'+
    '<span class="chart-tree-count">'+included+' / '+members.size+' чел.</span></div>';
   // Показываем сотрудников непосредственно за звеном, не повторяя
   // всех работников дочерних отделов в каждой родительской строке.
   // Листовые звенья раскрываются автоматически вместе с деревом.
   if(!hasChild||expanded.has(String(node.id))||search){
    const direct=staff.filter(p=>String(p.structureId)===String(node.id)||
     String(node.leaderId||'')===String(p.id))
     .filter(p=>!search||norm(node.name).includes(search)||norm(p.name).includes(search))
     .sort((a,b)=>String(a.name).localeCompare(String(b.name),'ru'));
    for(const person of direct){
     html+='<div class="chart-tree-person" style="--depth:'+(node.depth+1)+'">'+
      '<input type="checkbox" data-chart-person="'+escapeHtml(person.id)+'"'+(selected.has(String(person.id))?' checked':'')+'>'+
      '<span>'+escapeHtml(person.name||'')+(String(node.leaderId||'')===String(person.id)?' (руководитель)':'')+'</span></div>';
    }
   }
  }
  q('#v2-chart-roster').innerHTML=html||'<p class="muted">Нет элементов структуры. Добавьте их в справочнике «Структура».</p>';
  q('#v2-chart-roster').scrollTop=previousScroll;
  q('#v2-chart-roster').querySelectorAll('[data-chart-node]').forEach(input=>{
   const members=membersOf(input.dataset.chartNode);
   const included=[...members].filter(id=>selected.has(id)).length;
   input.indeterminate=!input.checked&&included>0;
  });
  renderSummary();
 };
 const renderExceptions=()=>{
  const search=q('#v2-chart-exception-search').value.trim().toLocaleLowerCase('ru').replace(/ё/g,'е');
  const selected=chosen();
  q('#v2-chart-exception-list').innerHTML=[...staff].filter(p=>String(p.name||'').toLocaleLowerCase('ru').replace(/ё/g,'е').includes(search))
   .sort((a,b)=>String(a.name).localeCompare(String(b.name),'ru')).map(p=>
   '<label><input type="checkbox" data-chart-person="'+escapeHtml(p.id)+'"'+(selected.has(String(p.id))?' checked':'')+'>'+
   '<span>'+escapeHtml(p.name||'')+'<small>'+escapeHtml(structurePath(structure,p.structureId)||'Без подразделения')+'</small></span></label>').join('');
 };
 const togglePerson=(id,on)=>{
  const base=automatic().has(id);
  if(on){excluded.delete(id);if(!base)explicit.add(id);}
  else {explicit.delete(id);if(base)excluded.add(id);}
 };
 q('#v2-chart-roster').onclick=e=>{
  const expand=e.target.closest('[data-chart-expand]');
  if(expand){
   const id=expand.dataset.chartExpand;
   if(expanded.has(id))expanded.delete(id);else expanded.add(id);
   renderTree();
  }
 };
 q('#v2-chart-roster').onchange=e=>{
  const node=e.target.closest('[data-chart-node]');
  if(node){
   const id=node.dataset.chartNode;
   const memberIds=membersOf(id);
   if(node.checked){
    selectedNodes.add(id);
    // Ранее исключённые сотрудники остаются исключёнными.
   }else{
    selectedNodes.delete(id);
    for(const member of memberIds)if(![...selectedNodes].some(k=>membersOf(k).has(member)))explicit.delete(member);
   }
  }
  const person=e.target.closest('[data-chart-person]');
  if(person)togglePerson(person.dataset.chartPerson,person.checked);
  renderTree();renderExceptions();
 };
 q('#v2-chart-exception-list').onchange=e=>{
  const person=e.target.closest('[data-chart-person]');
  if(!person)return;
  togglePerson(person.dataset.chartPerson,person.checked);
  renderTree();renderExceptions();
 };
 q('#v2-chart-search').oninput=renderTree;
 q('#v2-chart-exception-search').oninput=renderExceptions;
 q('#v2-chart-save').onclick=()=>{
  try{
   const id=chart?.id||'chart-v2-'+(crypto.randomUUID?.()||String(Date.now()));
   charts=saveChart(charts,{id,year,name:q('#v2-chart-name').value,
    staffIds:[...chosen()],structureIds:[...selectedNodes],includeIds:[...explicit],excludeIds:[...excluded]},staff,structure);
   selectedGraphId=String(id);
   dirty=true;persistDraft();dialog.close();draw();
  }catch(err){q('#v2-chart-error').textContent=err.message;}
 };
 renderTree();renderExceptions();dialog.showModal();
}
let directoryMode='structure';
let selectedStructureId=null;
let newStaffStructureId=null;
const collapsedStructure=new Set();
let pendingStructureMembers=new Set();
let directoryUnassignedOnly=false;
function openDirectory(mode){
 if(mode==='structure'&&structure.some(n=>!String(n.code||'').trim())){
  try{structure=fillMissingStructureCodes(structure);dirty=true;persistDraft();}
  catch(err){alert('Не удалось присвоить коды структуры: '+err.message);}
 }
 directoryMode=mode;
 directoryUnassignedOnly=false;
 q('#v2-directory-title').textContent=mode==='structure'?'Структура организации':'Сотрудники';
 q('#v2-directory-load').hidden=mode!=='structure';
 for(const key of ['edit','delete','pick','newstaff','chart'])q('#v2-structure-'+key).hidden=mode!=='structure';
 q('#v2-directory-unassigned').hidden=mode!=='staff';
 q('#v2-directory-assign').hidden=mode!=='staff';
 q('#v2-directory-search').value='';
 if(mode==='structure'&&!structure.some(n=>String(n.id)===String(selectedStructureId)))selectedStructureId=null;
 renderDirectory();
 q('#v2-directory-dialog').showModal();
}
function renderDirectory(){
 const previousScroll=q('#v2-directory-content')?.scrollTop||0;
 const term=q('#v2-directory-search').value.toLocaleLowerCase('ru').replace(/ё/g,'е');
 const unassigned=unassignedStaff(staff,structure);
 q('#v2-directory-unassigned').textContent='Без подразделения: '+unassigned.length+(directoryUnassignedOnly?' ✓':'');
 q('#v2-directory-unassigned').setAttribute('aria-pressed',String(directoryUnassignedOnly));
 const normalized=value=>String(value||'').toLocaleLowerCase('ru').replace(/ё/g,'е');
 let rows=[];
 if(directoryMode==='structure'){
  const allRows=structureRows(structure);
  const matching=new Set(allRows.filter(n=>normalized([n.name,n.code,n.type].join(' ')).includes(term)).map(n=>String(n.id)));
  rows=term?allRows.filter(n=>matching.has(String(n.id))):
    allRows.filter(n=>{
     let parent=n.parentId;
     while(parent!=null){
      if(collapsedStructure.has(String(parent)))return false;
      parent=structure.find(x=>String(x.id)===String(parent))?.parentId??null;
     }
     return true;
    });
  const children=new Set(structure.map(n=>String(n.parentId)));
  const leader=n=>staff.find(p=>String(p.id)===String(n.leaderId))?.name||'';
  q('#v2-directory-content').innerHTML=structure.length
   ?'<table class="directory-table directory-tree"><thead><tr><th>Наименование</th><th>Код</th><th>Руководитель</th><th>Сотрудников</th></tr></thead><tbody>'+
    rows.map(n=>'<tr data-structure-row="'+escapeHtml(n.id)+'" class="'+(String(n.id)===String(selectedStructureId)?'selected-structure':'')+'">'+
     '<td style="padding-left:'+(10+n.depth*21)+'px">'+(children.has(String(n.id))?'<button class="tree-toggle" type="button" data-toggle-structure="'+escapeHtml(n.id)+'" aria-label="'+(collapsedStructure.has(String(n.id))?'Развернуть':'Свернуть')+'">'+(collapsedStructure.has(String(n.id))?'+':'−')+'</button>':'<span class="tree-placeholder"></span>')+escapeHtml(n.name)+'</td>'+
     '<td>'+escapeHtml(n.code||'')+'</td><td>'+escapeHtml(leader(n))+'</td><td>'+staffForStructure(staff,structure,n.id).length+'</td></tr>').join('')+'</tbody></table>'
   :'<p>Структура пока не загружена. Загрузите резервную копию основного ГРОТ или добавьте первый элемент.</p>';
  const current=structure.find(n=>String(n.id)===String(selectedStructureId));
  const attached=current?staffForStructure(staff,structure,current.id):[];
  q('#v2-directory-attached').textContent=current?'Закреплены ('+attached.length+'): '+(attached.map(p=>p.name).join(', ')||'нет сотрудников'):'Выберите элемент структуры';
  for(const key of ['edit','delete','pick','newstaff'])q('#v2-structure-'+key).disabled=!current;
 }else{
  const without=new Set(unassigned.map(x=>String(x.id)));
  rows=[...staff].sort((a,b)=>String(a.lastName||a.name).localeCompare(String(b.lastName||b.name),'ru'))
   .filter(n=>(!directoryUnassignedOnly||without.has(String(n.id)))&&
    normalized([n.name,n.position,n.department,structurePath(structure,n.structureId)].join(' ')).includes(term));
  q('#v2-directory-content').innerHTML='<table class="directory-table"><thead><tr><th><input type="checkbox" id="v2-directory-select-all" aria-label="Выбрать всех видимых"></th><th>ФИО</th><th>Должность</th><th>Подразделение</th><th>Дней</th><th></th></tr></thead><tbody>'+
   rows.map(n=>'<tr><td><input type="checkbox" class="v2-directory-pick" value="'+escapeHtml(n.id)+'" aria-label="Выбрать '+escapeHtml(n.name)+'"></td><td>'+escapeHtml(n.name||[n.lastName,n.firstName,n.middleName].filter(Boolean).join(' '))+(n.dismissed?' · уволен':'')+'</td><td>'+escapeHtml(n.position||'—')+'</td>'+
   '<td>'+escapeHtml(structurePath(structure,n.structureId)||structure.filter(x=>String(x.leaderId)===String(n.id)).map(x=>structurePath(structure,x.id)+' (руководитель)').join('; ')||'Без подразделения'+(n.department?' (указано: '+n.department+')':''))+'</td><td>'+escapeHtml(n.allowance??'—')+'</td>'+
   '<td><button type="button" data-edit-staff="'+escapeHtml(n.id)+'">Изменить</button></td></tr>').join('')+'</tbody></table>';
 }
 q('#v2-directory-content').scrollTop=previousScroll;
 q('#v2-directory-count').textContent='Записей: '+rows.length;
 const allPick=q('#v2-directory-select-all');
 if(allPick)allPick.onchange=()=>{for(const item of root.querySelectorAll('.v2-directory-pick'))item.checked=allPick.checked;};

 q('#v2-directory-content').onclick=e=>{
  const toggle=e.target.closest('[data-toggle-structure]');
  if(toggle){
   const id=toggle.dataset.toggleStructure;
   if(collapsedStructure.has(id))collapsedStructure.delete(id);else collapsedStructure.add(id);
   renderDirectory();return;
  }
  const row=e.target.closest('[data-structure-row]');
  if(row){selectedStructureId=row.dataset.structureRow;renderDirectory();return;}
  const node=e.target.closest('[data-edit-staff]');
  if(node)editDirectoryItem(node.dataset.editStaff);
 };
}
function removeSelectedStructure(){
 const node=structure.find(n=>String(n.id)===String(selectedStructureId));if(!node)return;
 if(structure.some(n=>String(n.parentId)===String(node.id))){alert('Сначала удалите вложенные элементы структуры');return;}
 if(staffForStructure(staff,structure,node.id).length){alert('Сначала переназначьте сотрудников этого элемента');return;}
 if(!confirm('Удалить «'+node.name+'»?'))return;
 structure=structure.filter(n=>String(n.id)!==String(node.id));selectedStructureId=null;
 dirty=true;persistDraft();renderDirectory();
}
function openStructurePicker(){
 const node=structure.find(n=>String(n.id)===String(selectedStructureId));if(!node)return;
 const leaderId=node.leaderId==null?'':String(node.leaderId);
 pendingStructureMembers=new Set(staff.filter(p=>String(p.structureId)===String(node.id)||String(p.id)===leaderId).map(p=>String(p.id)));
 q('#v2-structure-pick-description').textContent='Состав: '+structurePath(structure,node.id)+' (непосредственно в этом элементе)';
 q('#v2-structure-pick-search').value='';
 const render=()=>{
  const search=q('#v2-structure-pick-search').value.toLocaleLowerCase('ru').replace(/ё/g,'е');
  const visible=[...staff].sort((a,b)=>String(a.name).localeCompare(String(b.name),'ru'))
   .filter(p=>String(p.name||'').toLocaleLowerCase('ru').replace(/ё/g,'е').includes(search));
  q('#v2-structure-pick-list').innerHTML=visible.map(p=>
   '<label><input type="checkbox" data-structure-member="'+escapeHtml(p.id)+'"'+(pendingStructureMembers.has(String(p.id))?' checked':'')+(String(p.id)===leaderId?' disabled':'')+'>'+
   '<span>'+escapeHtml(p.name||'')+(String(p.id)===leaderId?' (руководитель)':'')+(p.dismissed?' (уволен)':'')+
   '<small>'+escapeHtml(structurePath(structure,p.structureId)||'Без подразделения')+'</small></span></label>').join('');
  q('#v2-structure-pick-count').textContent='Выбрано: '+pendingStructureMembers.size;
  q('#v2-structure-pick-list').onchange=e=>{
   const cb=e.target.closest('[data-structure-member]');if(!cb)return;
   if(cb.checked)pendingStructureMembers.add(cb.dataset.structureMember);else pendingStructureMembers.delete(cb.dataset.structureMember);
   q('#v2-structure-pick-count').textContent='Выбрано: '+pendingStructureMembers.size;
  };
 };
 q('#v2-structure-pick-search').oninput=render;
 q('#v2-structure-pick-save').onclick=()=>{
  const before=new Set(staff.filter(p=>String(p.structureId)===String(node.id)).map(p=>String(p.id)));
  const additions=[...pendingStructureMembers].filter(id=>id!==leaderId&&!before.has(id));
  const removals=[...before].filter(id=>id!==leaderId&&!pendingStructureMembers.has(id));
  if(!additions.length&&!removals.length){q('#v2-structure-pick-dialog').close();return;}
  if(!confirm('Изменить состав «'+node.name+'»? Добавить: '+additions.length+', открепить: '+removals.length+'.'))return;
  const adding=new Set(additions),removing=new Set(removals);
  staff=staff.map(p=>{
   const id=String(p.id);
   if(adding.has(id))return {...p,structureId:node.id,department:structurePath(structure,node.id)};
   if(removing.has(id))return {...p,structureId:'',department:''};
   return p;
  });
  dirty=true;persistDraft();q('#v2-structure-pick-dialog').close();renderDirectory();
 };
 render();q('#v2-structure-pick-dialog').showModal();
}
function bulkAssignDirectory(){
 const selected=[...q('#v2-directory-content').querySelectorAll('.v2-directory-pick:checked')].map(n=>n.value);
 if(!selected.length){alert('Отметьте сотрудников галочками');return;}
 if(!structure.length){alert('Сначала загрузите структуру предприятия');return;}
 const options=structureRows(structure).map(n=>'<option value="'+escapeHtml(n.id)+'">'+escapeHtml('— '.repeat(n.depth)+n.name)+'</option>').join('');
 q('#v2-directory-editor-title').textContent='Назначить подразделение · '+selected.length+' сотрудников';
 q('#v2-directory-error').textContent='';
 q('#v2-directory-fields').innerHTML='<label>Подразделение<select id="v2-bulk-target">'+options+'</select></label>'+
  '<p class="muted">Изменится только привязка сотрудников к структуре. Отпуска, группы, нормы и история сохранятся.</p>';
 q('#v2-directory-save').onclick=()=>{
  try{
   const target=q('#v2-bulk-target').value;
   const name=structurePath(structure,target);
   if(!confirm('Назначить '+selected.length+' сотрудников в «'+name+'»?'))return;
   staff=assignStaffToStructure(staff,structure,selected,target);
   dirty=true;persistDraft();
   q('#v2-directory-editor').close();renderDirectory();
  }catch(err){q('#v2-directory-error').textContent=err.message;}
 };
 q('#v2-directory-editor').showModal();
}
function editDirectoryItem(id){
 const isStructure=directoryMode==='structure';
 const row=isStructure?structure.find(n=>String(n.id)===String(id)):staff.find(n=>String(n.id)===String(id));
 const form=q('#v2-directory-form'),fields=q('#v2-directory-fields');
 q('#v2-directory-editor-title').textContent=(row?'Изменить ':'Добавить ')+(isStructure?'элемент структуры':'сотрудника');
 q('#v2-directory-error').textContent='';
 if(isStructure){
  const parentOptions='<option value="">— Корневой элемент —</option>'+structureRows(structure)
   .filter(n=>!row||String(n.id)!==String(row.id))
   .map(n=>'<option value="'+escapeHtml(n.id)+'"'+(String(row?.parentId||'')===String(n.id)?' selected':'')+'>'+
    escapeHtml('  '.repeat(n.depth)+n.name)+'</option>').join('');
  fields.innerHTML='<label>Наименование<input name="name" required value="'+escapeHtml(row?.name||'')+'"></label>'+
   '<label>Код (автоматически)<input name="code" value="'+escapeHtml(row?.code||'')+'" readonly placeholder="При сохранении"></label>'+
   '<label>Тип<select name="type">'+['organization','division','department','brigade'].map(x=>'<option value="'+x+'"'+(x===(row?.type||'department')?' selected':'')+'>'+({organization:'Организация',division:'Подразделение',department:'Отдел',brigade:'Группа'}[x])+'</option>').join('')+'</select></label>'+
   '<label>Родитель<select name="parentId">'+parentOptions+'</select></label>'+
   '<label>Руководитель<select name="leaderId"><option value="">— Не назначен —</option>'+[...staff].sort((a,b)=>String(a.name).localeCompare(String(b.name),'ru')).map(p=>'<option value="'+escapeHtml(p.id)+'"'+(String(row?.leaderId||'')===String(p.id)?' selected':'')+'>'+escapeHtml(p.name)+'</option>').join('')+'</select></label>'+
   '<label>Должность руководителя<input name="leaderTitle" value="'+escapeHtml(row?.leaderTitle||'')+'"></label>';
 }else{
  const options='<option value="">— Не назначено —</option>'+structureRows(structure)
   .map(n=>'<option value="'+escapeHtml(n.id)+'"'+(String(row?.structureId||newStaffStructureId||'')===String(n.id)?' selected':'')+'>'+escapeHtml('  '.repeat(n.depth)+n.name)+'</option>').join('');
  const inp=(key,label)=>'<label>'+label+'<input name="'+key+'" value="'+escapeHtml(['hireDate','dismissalDate'].includes(key)?displayDate(row?.[key]):row?.[key]||'')+'"'+(['hireDate','dismissalDate'].includes(key)?' placeholder="дд.мм.гг" maxlength="8" inputmode="numeric"':'')+'></label>';
  fields.innerHTML='<div class="directory-name-fields">'+inp('lastName','Фамилия')+inp('firstName','Имя')+inp('middleName','Отчество')+'</div>'+
    inp('position','Должность')+
    '<label>Место работы<select name="structureId">'+options+'</select></label>'+
    '<label>Дней отпуска<input name="allowance" type="number" min="0" max="365" value="'+escapeHtml(row?.allowance??36)+'"></label>'+
    '<div class="directory-name-fields">'+inp('hireDate','Принят (дд.мм.гг)')+inp('dismissalDate','Уволен (дд.мм.гг)')+'</div>'+
    '<label class="directory-checkbox"><input type="checkbox" name="dismissed" '+(row?.dismissed?'checked':'')+'> Уволен(а)</label>';
 }
 q('#v2-directory-save').onclick=()=>{
  try{
   const get=k=>form.elements.namedItem(k)?.value?.trim()||'';
   if(isStructure){
    const entry={...(row||{}),id:row?.id||'st-v2-'+crypto.randomUUID(),name:get('name'),code:row?.code||'',type:get('type'),parentId:get('parentId')||null,leaderId:get('leaderId'),leaderTitle:get('leaderTitle')};
    structure=upsertStructure(structure,entry);
   }else{
    const entry={...(row||{}),id:row?.id||'staff-v2-'+crypto.randomUUID(),lastName:get('lastName'),firstName:get('firstName'),middleName:get('middleName'),
     position:get('position'),structureId:get('structureId'),allowance:Number(get('allowance')),hireDate:parseDisplayDate(get('hireDate')),dismissalDate:parseDisplayDate(get('dismissalDate')),
     dismissed:form.elements.namedItem('dismissed').checked};
    entry.department=entry.structureId?structurePath(structure,entry.structureId):entry.department||'';
    staff=upsertStaff(staff,entry);newStaffStructureId=null;
   }
   dirty=true;persistDraft();q('#v2-directory-editor').close();renderDirectory();
  }catch(err){q('#v2-directory-error').textContent=err.message;}
 };
 q('#v2-directory-editor').showModal();
}
const auditDates=x=>x&&typeof x==='object'?
 escapeHtml([x.start,x.end].filter(Boolean).map(displayDate).join(' — ')||JSON.stringify(x)):
 escapeHtml(x===null?'—':String(x));
function renderAudit(){
 const dialog=q('#v2-audit-dialog');if(!dialog)return;
 const current=dialog.querySelector('#v2-audit-year').value;
 const search=dialog.querySelector('#v2-audit-search').value;
 const found=queryVacationAudit(records,{year:current==='all'?null:Number(current),search});
 dialog.querySelector('#v2-audit-count').textContent='Записей: '+found.length;
 dialog.querySelector('#v2-audit-results').innerHTML=found.length?
  found.map(a=>'<article class="audit-entry"><div><strong>'+escapeHtml(a.employee)+
  '</strong> · '+escapeHtml(a.year)+' · '+escapeHtml(displayTimestamp(a.date))+'</div>'+
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
 form.elements.staffId.value=rec?.staffId||form.elements.staffId.options[0]?.value||'';
 form.elements.staffId.disabled=!!rec;
 form.elements.start.value=rec?.period.start||'';
 form.elements.end.value=rec?.period.end||'';
 const syncShownDates=()=>{
  form.elements.startDisplay.value=displayDate(form.elements.start.value);
  form.elements.endDisplay.value=displayDate(form.elements.end.value);
 };
 const readShownDate=(name)=>{
  const result=parseDisplayDate(form.elements[name+'Display'].value);
  form.elements[name].value=result;
  form.elements[name+'Display'].value=displayDate(result);
 };
 syncShownDates();
 form.elements.days.value=form.elements.start.value&&form.elements.end.value
  ?vacationDays(form.elements.start.value,form.elements.end.value):'';
 let calendarAnchor=(form.elements.start.value||year+'-01-01').slice(0,7);
 let calendarNext='start';
 const updateCalendar=()=>{
  syncShownDates();
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
 form.elements.startDisplay.onchange=()=>{
  try{readShownDate('start');q('#v2-error').textContent='';}
  catch(err){q('#v2-error').textContent=err.message;return;}
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
 form.elements.endDisplay.onchange=()=>{
  try{readShownDate('end');q('#v2-error').textContent='';}
  catch(err){q('#v2-error').textContent=err.message;return;}
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
   readShownDate('start');readShownDate('end');
   if(!form.elements.start.value||!form.elements.end.value)throw new Error('Заполните начало и конец отпуска');
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
   dirty=true;persistDraft();q('#v2-dialog').close();draw();
  }catch(err){q('#v2-error').textContent=err.message;}
 };
 q('#v2-delete').onclick=()=>{
  try{
   const reason=selectedReason();
   if(!reason)throw new Error('Укажите причину удаления');
   if(!confirm('Удалить отпуск '+(rec.staffName||'сотрудника')+' с '+dateFmt(rec.period.start)+' по '+dateFmt(rec.period.end)+'?'))return;
   records=removeVacationPeriod(records,rec.id,editPolicy(),{
    actor:'Пользователь тестового экрана',reason,at:new Date().toISOString()});
   dirty=true;persistDraft();q('#v2-dialog').close();draw();
  }catch(err){q('#v2-error').textContent=err.message;}
 };
 q('#v2-close').onclick=()=>q('#v2-dialog').close();
 q('#v2-dialog').showModal();
}
async function importJson(e){
 const file=e.target.files?.[0];if(!file)return;
 try{
  const data=JSON.parse(await file.text());
  if(dirty&&!confirm('Текущие изменения ещё не сохранены в отдельный файл. Заменить их загружаемыми данными?'))return;
  const inspected=inspectPreviewImport(data);
  importReport='Исходных периодов: '+inspected.counts.original+
   ', преобразовано: '+inspected.counts.converted+'. '+
   [...(inspected.problems||[]),...(inspected.warnings||[])].join('; ');
  if(!inspected.ok){alert('Импорт не выполнен: '+inspected.problems.join('; '));draw();return;}
  const newRecords=inspected.records,newStaff=inspected.staff;
  records=newRecords;staff=newStaff;structure=inspected.structure||[];charts=inspected.charts||[];originalImport=inspected.sourceSnapshot;
  historyReview=inspected.bundledHistoryReview||null;
  loadedSource='Проверен файл: '+file.name;
  if(!records.some(r=>Number(r.year)===year))year=records[0]?.year||2027;
  dirty=false;selected=null;selectedGraphId='';persistDraft();draw();
 }catch(err){alert('Импорт не выполнен: '+err.message);}
}
function downloadJson(data,name){
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportJson(){
 downloadJson({schemaVersion:2,staff,records,structure,charts},'grot-v2-preview-'+year+'.json');
 dirty=false;persistDraft();draw();
}
draw();

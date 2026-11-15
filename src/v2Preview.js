import {buildUnifiedYearView,renderUnifiedYearTable} from './unifiedYearTableV2.js';
import {addVacationPeriod,editVacationPeriod,removeVacationPeriod} from './vacationEditorV2.js';
import {inspectPreviewImport} from './previewImportV2.js';
import {stageBundledHistory} from './stageHistoryV2.js';
import {queryVacationAudit} from './v2AuditJournal.js';
import {renderRangeCalendar,renderYearVacationCalendar,shiftMonth,vacationDays,endDateForDays,setProductionCalendars} from './periodCalendarV2.js';
import {parseProductionCalendarFile,productionCalendarExample,parseIsDayOffYear,ISDAYOFF_YEAR_URL} from './productionCalendarV2.js';
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
let expandedMonth=null;
let charts=[];
let productionCalendars={};
let originalImport=null,importReport='',historyReview=null;
let localSaveStatus='Локальное сохранение не проверено';
function persistDraft(){
 try{
  localStorage.setItem(DRAFT_KEY,makeLocalDraft({staff,records,structure,charts,productionCalendars,year,source:loadedSource,dirty}));
  localSaveStatus='Автосохранение на этом устройстве';
 }catch(err){
  localSaveStatus='Автосохранение недоступно — сохраните файл';
 }
}
function restoreDraftAtStartup(){
 try{
  const draft=parseLocalDraft(localStorage.getItem(DRAFT_KEY));
  if(!draft){localSaveStatus='Локальная копия отсутствует';return;}
  staff=draft.staff;records=draft.records;structure=draft.structure||[];charts=draft.charts||[];productionCalendars=draft.productionCalendars||{};year=draft.year;
  loadedSource=draft.source;dirty=draft.dirty;
  localSaveStatus='Восстановлено с этого устройства'+(draft.savedAt?' · '+new Date(draft.savedAt).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}):'');
  importReport='Автоматически восстановлена локальная копия. Рекомендуется также сохранять резервный файл.';
 }catch{localSaveStatus='Локальное сохранение недоступно';}
}
restoreDraftAtStartup();
setProductionCalendars(productionCalendars);
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
   <nav class="v2-main-menu" aria-label="Меню программы">
    <details class="v2-nav-item"><summary>Справочники</summary><div class="v2-nav-panel">
      <button type="button" id="v2-structure">Структура предприятия</button>
      <button type="button" id="v2-staff">Сотрудники</button>
    </div></details>
    <details class="v2-nav-item"><summary>Печать</summary><div class="v2-nav-panel">
      <button type="button" id="v2-print-graph">Печать текущего графика</button>
    </div></details>
    <details class="v2-nav-item"><summary>Сервис</summary><div class="v2-nav-panel">
      <button type="button" id="v2-import">Восстановить данные</button>
      <button type="button" id="v2-export">Сохранить данные</button>
      <button type="button" id="v2-calendar-import-open">Производственный календарь</button>
      <button type="button" id="v2-audit-open">Журнал изменений</button>
      <button type="button" id="v2-source" ${originalImport?'':'disabled'}>Исходный JSON</button>
      <button type="button" id="v2-reload">Обновить</button>
    </div></details>
   </nav>
   <details class="v2-test-notice"><summary><strong>ГРОТ 2.0 · тестовый режим</strong><span> · данные сохраняются на этом устройстве</span></summary><p>Данные автоматически сохраняются в браузере. Для резервной копии используйте «Сохранить данные». Основной ГРОТ не затрагивается.</p></details>
   <div class="v2-graph-summary">Сотрудников: ${graph.staff.length} · Периодов за ${year} год: ${graph.records.filter(r=>Number(r.year)===year).length}</div>
   <div class="v2-save-indicator" title="${escapeHtml(loadedSource)} · ${dirty?'нет свежей файловой копии':'файловая копия актуальна'} · ${escapeHtml(localSaveStatus)}"><span>${escapeHtml(loadedSource)} · ${dirty?'нет свежей файловой копии':'файловая копия актуальна'} · ${escapeHtml(localSaveStatus)}</span></div>
   <input id="v2-file" type="file" accept=".json,application/json" hidden>
   <input id="v2-production-file" type="file" accept=".json,.csv,application/json,text/csv,text/plain" hidden>
   <p id="v2-import-report" role="status">${escapeHtml(importReport)}</p>
   ${historyReview?`<div class="warning"><p>Встроенная история 2026: ${historyReview.total} периодов, сопоставлено по фамилии: ${historyReview.matched}, не сопоставлено: ${historyReview.unresolved}. Даты требуют проверки; это не подтверждённый факт отпуска.</p><button type="button" id="v2-stage-history">Добавить историю 2026 в тестовую копию</button></div>`:''}
   <div class="chart-selector"><label>График <select id="v2-chart"><option value="">Общий график</option>${chartOptions}</select></label>
    <button type="button" id="v2-chart-new">Новый график</button>
    <button type="button" id="v2-chart-edit" ${selectedGraphId?'':'disabled'}>Редактировать</button>
    <button type="button" id="v2-chart-delete" ${selectedGraphId?'':'disabled'}>Удалить</button>
   </div>
   <div class="table-wrap">${renderUnifiedYearTable(buildUnifiedYearView(year,graph.records,graph.staff),{expandedMonth})}</div>
  </main>
  <div id="v2-period-menu" class="period-context-menu" role="menu" aria-label="Действия с периодом" hidden>
   <button type="button" role="menuitem" id="v2-menu-edit">Изменить</button>
   <button type="button" role="menuitem" id="v2-menu-delete">Удалить</button>
  </div>
  <dialog id="v2-production-dialog" class="v2-production-dialog">
   <div class="directory-heading"><h2>Производственный календарь</h2><button type="button" id="v2-production-close">Закрыть</button></div>
   <p>Загрузка календаря по годам. Действующий график отпусков не заменяется.</p>
   <label>Год <select id="v2-production-year">${years.map(y=>'<option value="'+y+'"'+(y===year?' selected':'')+'>'+y+'</option>').join('')}</select></label>
   <p id="v2-production-current" class="muted"></p>
   <p class="muted">Формат JSON или CSV (дата;тип). Типы: <strong>праздник</strong>, <strong>выходной</strong>, <strong>рабочий</strong>. Праздники исключаются из длительности отпуска, а перенесённые выходные — нет.</p>
   <div class="directory-pick-footer">
    <button type="button" id="v2-production-auto">Обновить из интернета</button>
    <button type="button" id="v2-production-choose">Загрузить файл</button>
    <button type="button" id="v2-production-template">Образец JSON</button>
   </div>
   <p class="muted">Интернет-источник: <a href="https://isdayoff.ru" target="_blank" rel="noopener noreferrer">isdayoff.ru</a>, календарь РФ для пятидневной недели. Данные сервиса проверяются перед применением. Это не официальный государственный реестр.</p>
   <div id="v2-production-preview" class="v2-production-preview" aria-live="polite"></div>
   <p id="v2-production-error" role="alert"></p>
   <div class="directory-pick-footer">
    <button type="button" id="v2-production-apply" disabled>Применить календарь</button>
    <button type="button" id="v2-production-remove">Очистить загруженный</button>
   </div>
  </dialog>
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
    <div class="v2-year-editor-heading"><h2 id="v2-dialog-title">Отпуска сотрудника</h2><button type="button" id="v2-close-top" aria-label="Закрыть">×</button></div>
    <label class="v2-year-staff-select">Сотрудник <select name="staffId" required>${graph.staff.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}</select></label>
    <div class="calendar-panel">
     <div id="v2-calendar-months" class="calendar-months" aria-label="Календарь года"></div>
     <p id="v2-calendar-summary" class="calendar-summary" aria-live="polite"></p>
    </div>
    <div class="v2-year-bottom">
     <div class="v2-year-periods">
      <div class="v2-period-actions">
       <button type="button" id="v2-period-new">Добавить</button>
       <button type="button" id="v2-period-edit">Изменить</button>
       <button type="button" id="v2-period-remove">Удалить</button>
      </div>
      <div class="v2-period-list-scroll"><table class="v2-period-list">
       <thead><tr><th>№</th><th>Начало</th><th>Конец</th><th>Дней</th></tr></thead>
       <tbody id="v2-period-rows"></tbody>
      </table></div>
     </div>
     <div class="v2-year-balances">
      <div><strong>Доступно</strong><b id="v2-available-days">—</b></div>
      <div><strong>Запланировано</strong><b id="v2-planned-days">—</b></div>
      <div><strong>Осталось</strong><b id="v2-left-days">—</b></div>
      <div class="v2-year-footer"><button type="button" id="v2-employee-history">История отпусков</button><button type="button" id="v2-close-bottom">Закрыть</button></div>
     </div>
    </div>
    <div class="v2-period-edit-fields" id="v2-period-edit-fields">
     <div class="calendar-date-fields">
      <label>Начало <input name="startDisplay" type="text" inputmode="numeric" placeholder="дд.мм.гг" maxlength="8" required><input name="start" type="hidden"></label>
      <label>Конец <input name="endDisplay" type="text" inputmode="numeric" placeholder="дд.мм.гг" maxlength="8" required><input name="end" type="hidden"></label>
      <label>Дней <input name="days" type="number" min="1" max="3660" step="1" inputmode="numeric" required></label>
     </div>
     <p class="calendar-help">Выберите даты в календаре либо укажите начало и количество дней. Нерабочие праздничные дни не входят в продолжительность отпуска.</p>
    </div>
    <label id="v2-reason-label">Причина изменения
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
    <div class="actions v2-year-save-actions"><button type="button" id="v2-save">Сохранить период</button>
    <button type="button" id="v2-delete">Удалить период</button>
    <button type="button" id="v2-close">Отмена</button></div>
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
 q('#v2-print-graph').onclick=()=>window.print();
 q('#v2-reload').onclick=()=>window.location.reload();
 root.querySelectorAll('.v2-nav-item').forEach(item=>{
  item.addEventListener('toggle',()=>{
   if(!item.open)return;
   root.querySelectorAll('.v2-nav-item').forEach(other=>{if(other!==item)other.open=false;});
  });
  item.querySelectorAll('button').forEach(button=>
   button.addEventListener('click',()=>{item.open=false;}));
 });
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
 let productionPending=null;
 const productionDialog=q('#v2-production-dialog');
 const productionYear=q('#v2-production-year');
 const renderProductionState=()=>{
  const current=productionCalendars[productionYear.value];
  q('#v2-production-current').textContent=current
   ?'Загружен календарь '+current.year+(current.source?' · '+current.source:'')+(current.loadedAt?' · '+new Date(current.loadedAt).toLocaleDateString('ru-RU'):'')+': праздничных '+current.holidays.length+
    ', дополнительных выходных '+current.daysOff.length+
    ', рабочих выходных '+current.workingWeekends.length
   :'Для '+productionYear.value+' года загруженный календарь отсутствует. Применяются базовые праздничные дни РФ.';
  q('#v2-production-remove').disabled=!current;
 };
 q('#v2-calendar-import-open').onclick=()=>{
  productionPending=null;
  q('#v2-production-preview').textContent='';
  q('#v2-production-error').textContent='';
  q('#v2-production-apply').disabled=true;
  productionYear.value=String(year);renderProductionState();productionDialog.showModal();
 };
 productionYear.onchange=()=>{productionPending=null;q('#v2-production-preview').textContent='';q('#v2-production-apply').disabled=true;renderProductionState();};
 q('#v2-production-close').onclick=()=>productionDialog.close();
 q('#v2-production-auto').onclick=async()=>{
  const target=Number(productionYear.value);
  const button=q('#v2-production-auto');
  button.disabled=true;
  button.textContent='Получаем календарь…';
  productionPending=null;
  q('#v2-production-apply').disabled=true;
  q('#v2-production-error').textContent='';
  q('#v2-production-preview').textContent='Запрос к isdayoff.ru за '+target+' год. Проверяем все даты и переносы.';
  try{
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),15000);
   let response;
   try{response=await fetch(ISDAYOFF_YEAR_URL(target),{signal:controller.signal,cache:'no-store'});}
   finally{clearTimeout(timeout);}
   if(!response.ok)throw new Error('HTTP '+response.status+' — сервис недоступен');
   const result=parseIsDayOffYear(await response.text(),target);
   if(Number(productionYear.value)!==target)throw new Error('Выбран другой год, повторите загрузку');
   productionPending={...result,source:'isdayoff.ru (пятидневка)',loadedAt:new Date().toISOString()};
   q('#v2-production-preview').textContent='Получено из интернета за '+target+' год: выходных сверх обычных суббот и воскресений — '+result.daysOff.length+
     ', рабочих суббот и воскресений — '+result.workingWeekends.length+
     '. Федеральные праздники учитываются отдельно по ТК РФ. Проверьте календарь перед применением.';
   q('#v2-production-apply').disabled=false;
  }catch(err){
   q('#v2-production-error').textContent='Автоматическая загрузка не выполнена: '+(err.name==='AbortError'?'истекло время ожидания':err.message)+
     '. Можно загрузить CSV или JSON вручную.';
   q('#v2-production-preview').textContent='';
  }finally{button.disabled=false;button.textContent='Обновить из интернета';}
 };
 q('#v2-production-choose').onclick=()=>q('#v2-production-file').click();
 q('#v2-production-template').onclick=()=>downloadJson(productionCalendarExample(Number(productionYear.value)),'Grot_2-calendar-example-'+productionYear.value+'.json');
 q('#v2-production-file').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
   const parsed=parseProductionCalendarFile(await file.text(),file.name,Number(productionYear.value));
   if(parsed.year!==Number(productionYear.value))throw new Error('Год файла '+parsed.year+' отличается от выбранного '+productionYear.value);
   productionPending={...parsed,source:'Файл: '+file.name,loadedAt:new Date().toISOString()};
   q('#v2-production-preview').textContent='Файл: '+file.name+' · Год: '+parsed.year+
    ' · Праздничных: '+parsed.holidays.length+
    ' · Выходных: '+parsed.daysOff.length+
    ' · Рабочих выходных: '+parsed.workingWeekends.length;
   q('#v2-production-error').textContent='';
   q('#v2-production-apply').disabled=false;
  }catch(err){
   productionPending=null;q('#v2-production-apply').disabled=true;
   q('#v2-production-error').textContent=err.message;
  }finally{e.target.value='';}
 };
 q('#v2-production-apply').onclick=()=>{
  if(!productionPending)return;
  const target=productionPending.year;
  if(!confirm('Применить календарь '+target+' года? Продолжительность отпусков может пересчитаться, но их даты не изменятся.'))return;
  productionCalendars={...productionCalendars,[target]:productionPending};
  setProductionCalendars(productionCalendars);
  dirty=true;persistDraft();productionDialog.close();draw();
 };
 q('#v2-production-remove').onclick=()=>{
  const target=productionYear.value;if(!productionCalendars[target])return;
  if(!confirm('Удалить загруженный производственный календарь '+target+' года? Будет использован базовый список праздников.'))return;
  const updated={...productionCalendars};delete updated[target];productionCalendars=updated;
  setProductionCalendars(productionCalendars);dirty=true;persistDraft();productionDialog.close();draw();
 };
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
 table.addEventListener('click',e=>{
  const staffCell=e.target.closest('[data-staff-id]');
  if(staffCell){openEditor(null,{staffId:staffCell.dataset.staffId});return;}
 });
 table.addEventListener('click',e=>{
  const toggle=e.target.closest('[data-expand-month]');
  if(!toggle)return;
  expandedMonth=expandedMonth===Number(toggle.dataset.expandMonth)?null:Number(toggle.dataset.expandMonth);
  draw();
  if(expandedMonth!==null){
   const wrap=q('.table-wrap');
   const current=q('[data-expand-month="'+expandedMonth+'"]');
   if(current)wrap.scrollLeft=Math.max(0,current.getBoundingClientRect().left-
     wrap.getBoundingClientRect().left+wrap.scrollLeft-200);
  }
 });
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
function openEditor(rec,{deleting=false,staffId=null}={}){
 const form=q('#v2-editor'),dialog=q('#v2-dialog');
 const requestedId=String(rec?.staffId??staffId??staff[0]?.id??'');
 let employeeId=requestedId,current=rec||null,editing=!!deleting,removing=!!deleting,nextClick='start';
 const list=()=>records.filter(r=>!r.deleted&&Number(r.year)===year&&String(r.staffId)===employeeId)
  .sort((a,b)=>a.period.start.localeCompare(b.period.start));
 const employee=()=>staff.find(p=>String(p.id)===employeeId)||{id:employeeId,name:rec?.staffName||'Сотрудник'};
 const sync=()=>{
  form.elements.startDisplay.value=displayDate(form.elements.start.value);
  form.elements.endDisplay.value=displayDate(form.elements.end.value);
  form.elements.days.value=form.elements.start.value&&form.elements.end.value
   ?vacationDays(form.elements.start.value,form.elements.end.value):'';
 };
 const setPeriod=p=>{form.elements.start.value=p?.period?.start||'';form.elements.end.value=p?.period?.end||'';sync();};
 const reason=()=>{
  const v=form.elements.reasonPreset.value;
  const txt=String(v==='other'?form.elements.reasonOther.value:v).trim();
  if(!txt)throw new Error('Укажите причину изменения');return txt;
 };
 const update=()=>{
  const person=employee(),periods=list();
  const start=form.elements.start.value,end=form.elements.end.value;
  const calendars=periods.filter(p=>!(editing&&current&&String(p.id)===String(current.id)))
   .map(p=>p.period);
  if(editing&&start&&end)calendars.push({start,end});
  q('#v2-dialog-title').textContent=person.name+' — отпуска '+year;
  q('#v2-calendar-months').innerHTML=renderYearVacationCalendar(year,
   editing?start:'',editing?end:'',calendars);
  q('#v2-calendar-summary').textContent=editing?
   (start&&end?'Отпуск '+dateFmt(start)+' — '+dateFmt(end)+' · '+vacationDays(start,end)+' дн.':
     start?'Выберите день окончания отпуска':'Выберите день начала отпуска'):
   'Нажмите строку периода для выбора или «Добавить» для нового отпуска';
  q('#v2-period-rows').innerHTML=periods.length?periods.map((p,i)=>
   '<tr data-employee-period-id="'+escapeHtml(p.id)+'" class="'+(current&&String(current.id)===String(p.id)?'is-selected':'')+
   '"><td>'+(i+1)+'</td><td>'+escapeHtml(dateFmt(p.period.start))+
   '</td><td>'+escapeHtml(dateFmt(p.period.end))+'</td><td>'+
   vacationDays(p.period.start,p.period.end)+'</td></tr>').join(''):
   '<tr><td colspan="4">Периоды отсутствуют</td></tr>';
  const planned=periods.reduce((a,p)=>a+vacationDays(p.period.start,p.period.end),0);
  const raw=[person.annualVacationDays,person.vacationDays,person.leaveDays,
   person.annualLeaveDays,person.entitlementDays,person.daysOfLeave]
   .find(v=>v!==undefined&&v!==null&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0);
  const available=raw===undefined?null:Number(raw);
  q('#v2-available-days').textContent=available===null?'—':String(available);
  q('#v2-planned-days').textContent=String(planned);
  q('#v2-left-days').textContent=available===null?'—':String(available-planned);
  q('#v2-period-edit-fields').hidden=!editing;
  q('#v2-reason-label').hidden=!editing;
  q('#v2-reason-other-wrap').hidden=!editing||form.elements.reasonPreset.value!=='other';
  q('.v2-year-save-actions').hidden=!editing;
  q('#v2-save').hidden=!editing||removing;
  q('#v2-delete').hidden=!editing||!current||!removing;
  q('#v2-period-edit').disabled=!current;
  q('#v2-period-remove').disabled=!current;
 };
 const newEdit=p=>{
  current=p;editing=true;removing=false;nextClick='start';
  setPeriod(p);form.elements.reasonPreset.value='';form.elements.reasonOther.value='';
  q('#v2-error').textContent='';update();
 };
 form.elements.staffId.value=employeeId;
 form.elements.staffId.disabled=true;
 q('#v2-period-new').onclick=()=>newEdit(null);
 q('#v2-period-edit').onclick=()=>{if(current)newEdit(current);};
 q('#v2-period-remove').onclick=()=>{
  if(!current)return;
  newEdit(current);removing=true;update();
  q('#v2-error').textContent='Для удаления укажите причину и нажмите «Удалить период».';
 };
 q('#v2-period-rows').onclick=e=>{
  const row=e.target.closest('[data-employee-period-id]');if(!row)return;
  current=list().find(p=>String(p.id)===row.dataset.employeePeriodId)||null;
  editing=false;removing=false;setPeriod(current);update();
 };
 q('#v2-calendar-months').onclick=e=>{
  const day=e.target.closest('[data-calendar-day]');if(!day)return;
  if(!editing){newEdit(null);}
  const d=day.dataset.calendarDay;
  if(nextClick==='start'){
   form.elements.start.value=d;form.elements.end.value='';nextClick='end';
  }else{
   const start=form.elements.start.value;
   if(d<start){form.elements.start.value=d;form.elements.end.value=start;}
   else form.elements.end.value=d;
   nextClick='start';
  }
  sync();update();
 };
 for(const name of ['start','end']){
  form.elements[name+'Display'].onchange=()=>{
   try{
    const val=parseDisplayDate(form.elements[name+'Display'].value);
    form.elements[name].value=val;
    if(name==='start'&&val&&form.elements.days.value){
     form.elements.end.value=endDateForDays(val,Number(form.elements.days.value));
    }
    sync();q('#v2-error').textContent='';update();
   }catch(err){q('#v2-error').textContent=err.message;}
  };
 }
 form.elements.days.onchange=()=>{
  try{
   form.elements.end.value=endDateForDays(form.elements.start.value,Number(form.elements.days.value));
   sync();q('#v2-error').textContent='';update();
  }catch(err){q('#v2-error').textContent=err.message;}
 };
 form.elements.reasonPreset.onchange=()=>{update();};
 q('#v2-close-top').onclick=()=>dialog.close();
 q('#v2-close-bottom').onclick=()=>dialog.close();
 q('#v2-close').onclick=()=>{editing=false;removing=false;setPeriod(current);q('#v2-error').textContent='';update();};
 q('#v2-employee-history').onclick=()=>{
  dialog.close();
  q('#v2-audit-year').value=String(year);
  q('#v2-audit-search').value=employee().name;
  renderAudit();q('#v2-audit-dialog').showModal();
 };
 q('#v2-save').onclick=()=>{
  try{
   form.elements.start.value=parseDisplayDate(form.elements.startDisplay.value);
   form.elements.end.value=parseDisplayDate(form.elements.endDisplay.value);
   if(!form.elements.start.value||!form.elements.end.value)throw new Error('Укажите начало и конец отпуска');
   const meta={actor:'Пользователь тестового экрана',reason:reason(),at:new Date().toISOString()};
   if(current)records=editVacationPeriod(records,current.id,{
    start:form.elements.start.value,end:form.elements.end.value},editPolicy(),meta);
   else{
    const person=employee();
    const id='preview-'+(globalThis.crypto?.randomUUID?.()||String(Date.now())+'-'+records.length);
    records=addVacationPeriod(records,{id,year,staffId:person.id,staffName:person.name,
     chartId:null,start:form.elements.start.value,end:form.elements.end.value},editPolicy(),meta);
    current=records.find(p=>String(p.id)===id)||null;
   }
   dirty=true;persistDraft();dialog.close();draw();
  }catch(err){q('#v2-error').textContent=err.message;}
 };
 q('#v2-delete').onclick=()=>{
  try{
   if(!current)throw new Error('Период не выбран');
   const why=reason();
   if(!confirm('Удалить отпуск '+employee().name+' с '+dateFmt(current.period.start)+' по '+dateFmt(current.period.end)+'?'))return;
   records=removeVacationPeriod(records,current.id,editPolicy(),
    {actor:'Пользователь тестового экрана',reason:why,at:new Date().toISOString()});
   dirty=true;persistDraft();dialog.close();draw();
  }catch(err){q('#v2-error').textContent=err.message;}
 };
 q('#v2-error').textContent='';
 form.elements.reasonPreset.value='';form.elements.reasonOther.value='';
 if(!rec){editing=false;}
 setPeriod(current);update();dialog.showModal();
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
  records=newRecords;staff=newStaff;structure=inspected.structure||[];charts=inspected.charts||[];productionCalendars=inspected.productionCalendars||{};setProductionCalendars(productionCalendars);originalImport=inspected.sourceSnapshot;
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
 const now=new Date();
 const stamp=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-')+'-'+
  [now.getHours(),now.getMinutes(),now.getSeconds()].map(n=>String(n).padStart(2,'0')).join('');
 downloadJson({schemaVersion:2,staff,records,structure,charts,productionCalendars},'Grot_2-backup-'+stamp+'.json');
 dirty=false;persistDraft();draw();
}
draw();

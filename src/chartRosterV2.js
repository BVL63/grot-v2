/** Отдельные графики определяются составом, а не подразделением. */
export function validateCharts(charts,staff){
 if(!Array.isArray(charts))throw new Error('Графики должны быть списком');
 const known=new Set(staff.map(p=>String(p.id))),ids=new Set();
 return charts.map(chart=>{
  if(!chart||typeof chart!=='object'||!String(chart.id||'').trim()||
    !String(chart.name||'').trim()||!Number.isInteger(Number(chart.year))||
    Number(chart.year)<2000||Number(chart.year)>2200||!Array.isArray(chart.staffIds))
   throw new Error('Неверные данные отдельного графика');
  if(ids.has(String(chart.id)))throw new Error('Повтор ID графика');
  ids.add(String(chart.id));
  const members=[...new Set(chart.staffIds.map(String))];
  // Отсутствующих в текущем справочнике не удаляем: сохраняем состав для сверки.
  return {...chart,year:Number(chart.year),staffIds:members};
 });
}
export function staffInChart(staff,records,charts,chartId,year){
 if(!chartId)return {staff:[...staff],records:[...records]};
 const chart=charts.find(x=>String(x.id)===String(chartId)&&Number(x.year)===Number(year));
 if(!chart)throw new Error('График не найден');
 const ids=new Set(chart.staffIds.map(String));
 return {staff:staff.filter(p=>ids.has(String(p.id))),
  records:records.filter(r=>r.staffId!=null&&ids.has(String(r.staffId)))};
}
export function saveChart(charts,{id,name,year,staffIds},staff){
 const clean=String(name||'').trim();
 if(!clean)throw new Error('Укажите название графика');
 if(!Array.isArray(staffIds)||!staffIds.length)throw new Error('Выберите хотя бы одного сотрудника');
 const known=new Set(staff.map(p=>String(p.id)));
 for(const member of staffIds)if(!known.has(String(member)))throw new Error('Сотрудник не найден: '+member);
 const data={id:String(id),name:clean,year:Number(year),staffIds:[...new Set(staffIds.map(String))]};
 const next=charts.some(c=>String(c.id)===data.id)?
  charts.map(c=>String(c.id)===data.id?{...c,...data}:c):[...charts,data];
 return validateCharts(next,staff);
}
export function chartMemberIdsByStructure(staff,structure,structureId){
 const ids=new Set([String(structureId)]),pending=[String(structureId)];
 while(pending.length){
  const parent=pending.shift();
  for(const node of structure)if(String(node.parentId)===parent&&!ids.has(String(node.id))){
   ids.add(String(node.id));pending.push(String(node.id));
  }
 }
 const leaderIds=new Set(structure.filter(n=>ids.has(String(n.id))&&n.leaderId!=null).map(n=>String(n.leaderId)));
 return staff.filter(p=>ids.has(String(p.structureId))||leaderIds.has(String(p.id))).map(p=>String(p.id));
}

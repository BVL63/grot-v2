/** ГРОТ 2.0. Структура организации и сотрудники — независимы от года графика. */
const clone=x=>JSON.parse(JSON.stringify(x));
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function validateStructure(nodes){
 if(!Array.isArray(nodes))throw new Error('Структура должна быть списком');
 const ids=new Set();
 for(const node of nodes){
  if(!object(node)||!String(node.id||'').trim()||!String(node.name||'').trim())
   throw new Error('У элемента структуры должны быть ID и название');
  if(ids.has(String(node.id)))throw new Error('Повтор ID структуры: '+node.id);
  ids.add(String(node.id));
 }
 const byId=new Map(nodes.map(n=>[String(n.id),n]));
 for(const n of nodes){
  if(n.parentId!=null&&!byId.has(String(n.parentId)))
   throw new Error('Не найден родитель для '+n.name);
  const visited=new Set([String(n.id)]);
  let p=n.parentId;
  while(p!=null){
   if(visited.has(String(p)))throw new Error('Обнаружена циклическая структура');
   visited.add(String(p));p=byId.get(String(p))?.parentId;
  }
 }
 return clone(nodes);
}
export function descendantsOf(nodes,id){
 const result=new Set([String(id)]),queue=[String(id)];
 while(queue.length){
  const p=queue.shift();
  for(const n of nodes)if(String(n.parentId)===p&&!result.has(String(n.id))){
   result.add(String(n.id));queue.push(String(n.id));
  }
 }
 return result;
}
export function structureRows(nodes){
 const byParent=new Map();
 for(const n of nodes){const key=String(n.parentId??'');if(!byParent.has(key))byParent.set(key,[]);byParent.get(key).push(n);}
 const rows=[],walk=(parent,depth)=>{
  const siblings=(byParent.get(String(parent??''))||[]).sort((a,b)=>String(a.code||'').localeCompare(String(b.code||''),'ru',{numeric:true})||a.name.localeCompare(b.name,'ru'));
  for(const n of siblings){rows.push({...n,depth});walk(n.id,depth+1);}
 };
 walk(null,0);return rows;
}
/**
 * Автонумерация структуры: 01 → 01.02 → 01.02.01.
 * Заполняет только отсутствующие коды; существующие никогда не перенумеровывает.
 * Новым элементам назначает следующий номер после максимального номера
 * у соседних элементов одного родителя.
 */
export function fillMissingStructureCodes(nodes){
 const result=validateStructure(nodes);
 const byId=new Map(result.map(n=>[String(n.id),n]));
 const visiting=new Set();
 const assign=node=>{
  const id=String(node.id);
  if(visiting.has(id))throw new Error('Цикл в структуре');
  visiting.add(id);
  const parent=node.parentId==null?null:byId.get(String(node.parentId));
  if(parent)assignIfMissing(parent);
  if(!String(node.code||'').trim()){
   const prefix=parent?String(parent.code)+'.':'';
   const used=result.filter(s=>String(s.id)!==id&&String(s.parentId??'')===String(node.parentId??''))
    .map(s=>String(s.code||'').trim())
    .filter(code=>code.startsWith(prefix)&&/^\d+$/.test(code.slice(prefix.length)))
    .map(code=>Number(code.slice(prefix.length)));
   const next=Math.max(0,...used)+1;
   node.code=prefix+String(next).padStart(2,'0');
  }
  visiting.delete(id);
 };
 const done=new Set();
 const assignIfMissing=node=>{
  if(done.has(String(node.id)))return;
  assign(node);done.add(String(node.id));
 };
 for(const node of result)assignIfMissing(node);
 return result;
}
export function upsertStructure(nodes,entry){
 const current=nodes.find(n=>String(n.id)===String(entry.id));
 const next=current?nodes.map(n=>String(n.id)===String(entry.id)?{...n,...entry}:n):[...nodes,entry];
 return fillMissingStructureCodes(next);
}
export function structurePath(nodes,id){
 const map=new Map(nodes.map(n=>[String(n.id),n])),parts=[];let current=map.get(String(id));const visited=new Set();
 while(current&&!visited.has(String(current.id))){
  visited.add(String(current.id));parts.unshift(current.name);current=map.get(String(current.parentId));
 }
 return parts.join(' → ');
}
export function staffForStructure(staff,nodes,id){
 const ids=descendantsOf(nodes,id);
 // Руководитель входит в состав возглавляемого отдела, даже если
 // в старой копии у него не заполнено поле structureId.
 const leaders=new Set(nodes.filter(n=>ids.has(String(n.id))&&n.leaderId!=null&&String(n.leaderId).trim())
  .map(n=>String(n.leaderId)));
 return staff.filter(p=>ids.has(String(p.structureId))||leaders.has(String(p.id)));
}
export function upsertStaff(staff,entry){
 if(!String(entry.lastName||'').trim())throw new Error('Укажите фамилию сотрудника');
 const name=[entry.lastName,entry.firstName,entry.middleName].filter(Boolean).join(' ');
 const next={...entry,name};
 if(staff.some(x=>String(x.id)===String(entry.id)))
  return staff.map(x=>String(x.id)===String(entry.id)?{...x,...next}:x);
 return [...staff,next];
}

/** All unassigned staff, including those with IDs that no longer exist in structure. */
export function unassignedStaff(staff,nodes,{includeDismissed=true}={}){
 const ids=new Set(nodes.map(n=>String(n.id)));
 const leaderIds=new Set(nodes.filter(n=>n.leaderId!=null&&String(n.leaderId).trim()).map(n=>String(n.leaderId)));
 return staff.filter(s=>(includeDismissed||!s.dismissed)&&(!s.structureId||!ids.has(String(s.structureId)))&&!leaderIds.has(String(s.id)));
}
/** Assign a selected set to ONE structure node, leaving all other fields untouched. */
export function assignStaffToStructure(staff,nodes,staffIds,structureId){
 const node=nodes.find(n=>String(n.id)===String(structureId));
 if(!node)throw new Error('Подразделение не найдено');
 const selected=new Set(staffIds.map(String));
 if(!selected.size)throw new Error('Не выбраны сотрудники');
 const known=new Set(staff.map(s=>String(s.id)));
 for(const id of selected)if(!known.has(id))throw new Error('Не найден сотрудник '+id);
 const department=structurePath(nodes,node.id);
 return staff.map(s=>selected.has(String(s.id))?{...s,structureId:node.id,department}:s);
}

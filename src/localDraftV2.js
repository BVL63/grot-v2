import {inspectPreviewImport} from './previewImportV2.js';
export const DRAFT_KEY='grot-v2-local-draft-v1';
export function parseLocalDraft(raw){
 if(!raw)return null;
 let parsed;
 try{parsed=JSON.parse(raw);}catch{return null;}
 if(!parsed||parsed.schemaVersion!==2||parsed.draftType!=='grot-v2-local')return null;
 try{
  const checked=inspectPreviewImport({schemaVersion:2,records:parsed.records,staff:parsed.staff,structure:parsed.structure||[]});
  if(!checked.ok)return null;
  return {staff:checked.staff,records:checked.records,structure:checked.structure,year:Number.isInteger(parsed.year)?parsed.year:2027,
   source:String(parsed.source||'Локальное сохранение'),savedAt:parsed.savedAt||null,dirty:!!parsed.dirty};
 }catch{return null;}
}
export function makeLocalDraft({staff,records,structure=[],year,source,dirty}){
 return JSON.stringify({schemaVersion:2,draftType:'grot-v2-local',staff,records,structure,year,source,dirty,savedAt:new Date().toISOString()});
}

import labCore from '../../desktop/electron/research-lab.cjs';
const publicLab=labCore.createLab();
import insights from '../../desktop/electron/research-insights.cjs';
import workspace from '../../desktop/electron/research-workspace.cjs';
const publicService=insights.createInsights();
// Authenticated, same-origin endpoint; no caller-controlled URL or endpoint path.
export async function researchData(input){
 if(!input||typeof input.kind!=='string'||!input.selection||typeof input.selection!=='object')throw Error('Invalid research request.');
 const keys=input.keys||{};
 if(typeof keys!=='object'||Array.isArray(keys)||Object.keys(keys).length>2)throw Error('Invalid research credentials.');
 for(const [provider,key]of Object.entries(keys))workspace.validKey(provider,key);
 if(input.kind.startsWith('lab:')){const service=Object.values(keys).some(Boolean)?labCore.createLab():publicLab;return service.query(input.kind.slice(4),labCore.selection(input.selection),keys);}
 const config=insights.selection(input.selection);
 // Licensed results and credentials are never shared between users or cached globally.
 const service=Object.values(keys).some(Boolean)?insights.createInsights():publicService;
 return service.query(input.kind,config,keys);
}

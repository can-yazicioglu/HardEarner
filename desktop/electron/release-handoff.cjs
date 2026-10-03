const fs=require('fs'),path=require('path');
const version=v=>typeof v==='string'&&/^\d+\.\d+\.\d+$/.test(v)?v.split('.').map(Number):null;
function newer(a,b){const x=version(a),y=version(b);if(!x||!y)return false;for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i]}return false}
// Future releases request a graceful exit from the previous release instead of
// silently opening its window. A release only shuts itself down, never another app.
function installHandoff(app,onSecond,onQuit){
 const info={hardearnerVersion:app.getVersion()},file=path.join(app.getPath('userData'),'running-release.json');
 app.on('second-instance',(_e,_argv,_cwd,data)=>{if(newer(data?.hardearnerVersion,app.getVersion())){onQuit();app.quit()}else onSecond()});
 const remember=()=>{try{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({version:app.getVersion()}))}catch{}};
 if(app.requestSingleInstanceLock(info)){remember();return Promise.resolve(true)}
 let prior;try{prior=JSON.parse(fs.readFileSync(file,'utf8')).version}catch{}
 if(!newer(app.getVersion(),prior)){app.quit();return Promise.resolve(false)}
 return new Promise(resolve=>{let attempts=0;const t=setInterval(()=>{if(app.requestSingleInstanceLock(info)){clearInterval(t);remember();resolve(true)}else if(++attempts>=30){clearInterval(t);app.quit();resolve(false)}},250)});
}
module.exports={newer,installHandoff};

// Render the existing vector mark. No change to the app identity or geometry.
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const svg=fs.readFileSync(path.join(__dirname,'assets/logo.svg'),'utf8');
  for(const [size,target]of [[256,'assets/icon.png'],[512,'../web/public/icon-512.png'],[192,'../web/public/icon-192.png'],[180,'../web/public/apple-touch-icon.png']]){
   const page=await browser.newPage({viewport:{width:size,height:size},deviceScaleFactor:1});
   await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:100vw;height:100vh;display:block}</style>${svg}`);
   await page.screenshot({path:path.join(__dirname,target),omitBackground:true});await page.close();
  }
  const png=fs.readFileSync(path.join(__dirname,'assets/icon.png')),header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
  fs.writeFileSync(path.join(__dirname,'assets/icon.ico'),Buffer.concat([header,png]));console.log('Rendered Cherry HardEarner vector icons for Windows and web.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});

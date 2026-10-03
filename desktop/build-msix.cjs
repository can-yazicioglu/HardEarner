// Build an unsigned, Store-identity MSIX. Microsoft signs it after certification.
// No installation, certificate trust changes, user profiles, or credentials are included.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=__dirname,pkg=require('./package.json');
const identityFile=path.join(root,'store/identity.json');
const identity=fs.existsSync(identityFile)?JSON.parse(fs.readFileSync(identityFile,'utf8')):null;
const outputRoot=path.resolve(root,'../.artifacts/packages');
const sdk=process.env.HARDEARNER_WINDOWS_SDK_BIN;
const xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function build(){
 if(process.platform!=='win32')throw Error('Build MSIX on Windows with the Windows SDK.');
 if(!identity)throw Error('Copy store/identity.example.json to store/identity.json and enter your Partner Center identity. See docs/deployment.md.');
 if(!sdk)throw Error('Set HARDEARNER_WINDOWS_SDK_BIN to the x64 folder containing makeappx.exe.');
 if(!/^[A-Za-z0-9.-]{3,50}$/.test(identity.name)||!/^CN=[A-F0-9-]{36}$/i.test(identity.publisher)||!identity.familyName.startsWith(identity.name+'_'))throw Error('Use the verified Partner Center package identity.');
 const desktop=path.join(outputRoot,`HardEarner-${pkg.version}`,'HardEarner-win32-x64');
 for(const file of [path.join(desktop,'HardEarner.exe'),path.join(sdk,'makeappx.exe')])if(!fs.existsSync(file))throw Error('Missing prerequisite: '+file);
 execFileSync(process.execPath,['build.cjs'],{cwd:root,stdio:'inherit'});
 const buildDir=fs.mkdtempSync(path.join(outputRoot,`HardEarner-Store-${pkg.version}-`));
 const payload=path.join(buildDir,'payload'),archiveSource=path.join(buildDir,'app-source');
 fs.cpSync(desktop,payload,{recursive:true});fs.mkdirSync(archiveSource);
 for(const name of ['electron','dist','assets'])fs.cpSync(path.join(root,name),path.join(archiveSource,name),{recursive:true});
 fs.writeFileSync(path.join(archiveSource,'package.json'),JSON.stringify({name:pkg.name,productName:pkg.productName,version:pkg.version,main:pkg.main,author:pkg.author},null,2));
 const asar=await import('@electron/asar');
 await asar.createPackage(archiveSource,path.join(payload,'resources/app.asar'));
 const entries=asar.listPackage(path.join(payload,'resources/app.asar'));
 if(entries.some(p=>/\.encrypted|\.env(?:$|\.)|Local State|fixture|test-data|connections\.json/i.test(p)))throw Error('Unexpected private or test data in application archive.');
 execFileSync(process.env.HARDEARNER_PYTHON||'python',[path.join(root,'store/make-assets.py'),path.join(root,'assets/icon.png'),path.join(payload,'StoreAssets')],{stdio:'inherit',windowsHide:true});
 const manifest=`<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10" xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10" xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10" xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities" IgnorableNamespaces="uap uap10 rescap">
  <Identity Name="${xml(identity.name)}" Publisher="${xml(identity.publisher)}" Version="${pkg.version}.0" ProcessorArchitecture="x64" />
  <Properties><DisplayName>HardEarner</DisplayName><PublisherDisplayName>${xml(identity.publisherDisplayName)}</PublisherDisplayName><Description>Track savings, connected balances and market charts.</Description><Logo>StoreAssets\\StoreLogo.png</Logo></Properties>
  <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26200.0" /></Dependencies>
  <Resources>${['en-GB','tr-TR','es-ES','ru-RU','fr-FR','de-DE'].map(l=>`<Resource Language="${l}" />`).join('')}</Resources>
  <Applications><Application Id="${xml(identity.applicationId)}" Executable="HardEarner.exe" uap10:RuntimeBehavior="packagedClassicApp" uap10:TrustLevel="mediumIL"><uap:VisualElements DisplayName="HardEarner" Description="Hard-Earned Money needs attention." BackgroundColor="#080F20" Square44x44Logo="StoreAssets\\Square44x44Logo.png" Square150x150Logo="StoreAssets\\Square150x150Logo.png" /></Application></Applications>
  <Capabilities><rescap:Capability Name="runFullTrust" /></Capabilities>
</Package>`;
 fs.writeFileSync(path.join(payload,'AppxManifest.xml'),manifest);
 const msix=path.join(buildDir,`HardEarner_${pkg.version}.0_x64.msix`);
 execFileSync(path.join(sdk,'makeappx.exe'),['pack','/d',payload,'/p',msix,'/h','SHA256','/no'],{stdio:'inherit',windowsHide:true});
 const report={builtAt:new Date().toISOString(),version:pkg.version,packageVersion:pkg.version+'.0',identity,msix,sha256:hash(msix),bytes:fs.statSync(msix).size,exeSha256:hash(path.join(payload,'HardEarner.exe')),asarSha256:hash(path.join(payload,'resources/app.asar')),semanticValidation:true,privateUserDataIncluded:false,signed:false,installed:false,submitted:false,requires:'Microsoft Store certification and final installed-app tests'};
 fs.writeFileSync(path.join(buildDir,'build-report.json'),JSON.stringify(report,null,2));
 fs.writeFileSync(path.join(outputRoot,'HardEarner-Store-latest.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}
build().catch(e=>{console.error(e.message);process.exitCode=1});

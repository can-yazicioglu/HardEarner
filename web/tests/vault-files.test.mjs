import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encryptedBackup,readBackup,holdingsCSV,backupSummary} from '../client/vault-files.mjs';
import {deriveKey,newSalt} from '../client/crypto.mjs';
test('full encrypted backups preserve every workspace and refuse another identity or wrong password',async()=>{
 const identity='a'.repeat(64),password='Synthetic backup password',salt=newSalt(),key=await deriveKey(password,salt);
 const vault={version:1,portfolio:{holdings:[{id:'physical-gold'}],goals:[]},connections:{connections:[{id:'fixture-kraken',apiKey:'FIXTURE_NOT_A_REAL_KEY',history:{rows:[{cost:100}]}}]},analysis:{drawings:{btc:[{kind:'freehand'}]},alerts:[{id:'target'}]},performance:{baseline:{value:100}},securities:{apiKey:'FIXTURE_DATA_KEY'}};
 const backup=await encryptedBackup(vault,key,salt,identity);assert(!JSON.stringify(backup).includes('FIXTURE'));assert(!JSON.stringify(backup).includes('physical-gold'));
 assert.deepEqual(await readBackup(backup,password,identity),vault);
 assert.deepEqual(backupSummary(vault),{holdings:1,accounts:1,drawings:1,alerts:1,goals:0});
 await assert.rejects(readBackup(backup,'The wrong password here',identity),/incorrect/);
 await assert.rejects(readBackup(backup,password,'b'.repeat(64)),/this private account/);
 await assert.rejects(readBackup({...backup,envelope:{...backup.envelope,iv:'AAAAAAAAAAAAAAAA'}},password,identity),/incorrect/);
});
test('holdings CSV matches desktop columns, currency, fees and source without inventing missing costs',()=>{
 const csv=holdingsCSV([{name:'=HYPERLINK("untrusted")',type:'crypto',asset:'BTC',quantity:0.1,cost:null,purchaseFee:2,costCurrency:'TRY',costBasis:null,value:1000,grossSale:999,saleCosts:3,sell:996,gain:null,saleGain:null,returnPct:null,purchaseDate:'2026-09-01',location:'Kraken',storageType:'exchange'}],'TRY');
 assert(csv.includes('"Buy fee original"'));assert(csv.includes('"Source","Location"'));assert(csv.includes('"\'=HYPERLINK(""untrusted"")"'));assert(csv.includes('"TRY","","1000.00","999.00","3.00","996.00","","",""'));assert(csv.includes('Kraken'));
});

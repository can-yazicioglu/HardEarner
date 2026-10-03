// Offline CSV/Excel-paste import. Never execute formulas or infer ambiguous dates/decimals.
const {validAssetSymbol}=require('./asset-symbol.cjs');
function table(text){
 if(typeof text!=='string'||text.length>2e6)throw Error('Statement must be under 2 MB.');
 text=text.replace(/^\uFEFF/,'').trim();const head=text.split(/\r?\n/,1)[0],separator=head.includes('\t')?'\t':head.includes(';')?';':',';
 let row=[],cell='',quoted=false,rows=[];
 for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted;}else if(!quoted&&(ch===separator||ch==='\n')){row.push(cell.trim());cell='';if(ch==='\n'){if(row.some(Boolean))rows.push(row);row=[]}}else if(ch!=='\r')cell+=ch;}
 if(quoted)throw Error('Unclosed quote in statement.');row.push(cell.trim());if(row.some(Boolean))rows.push(row);
 if(rows.length<2||rows.length>2001||rows.some(r=>r.length>60))throw Error('Paste a header and up to 2,000 completed conversion rows.');
 return{headers:rows[0],rows:rows.slice(1)};
}
function number(text,decimal,zero=false){
 let s=String(text??'').trim();if(decimal===',')s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'');
 if(!/^\d+(?:\.\d+)?$/.test(s))throw Error('Invalid amount. Check the decimal format.');const n=Number(s);if(!Number.isFinite(n)||(zero?n<0:n<=0)||n>1e15)throw Error('Invalid amount.');return n;
}
function date(text,offset,format){
 let s=String(text).trim();if(format==='dmy'){const m=s.match(/^(\d{2})[./-](\d{2})[./-](\d{4})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)$/);if(!m)throw Error('Use day/month/year with a time.');s=`${m[3]}-${m[2]}-${m[1]}T${m[4]}`;}
 s=s.replace(' ','T');if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(s))throw Error('Invalid date/time. Choose the matching date format.');
 const ymd=s.slice(0,10);if(new Date(ymd+'T00:00:00Z').toISOString().slice(0,10)!==ymd)throw Error('Invalid calendar date.');
 if(!/Z$|[+-]\d\d:\d\d$/.test(s))s+=offset;const time=Date.parse(s);if(!Number.isFinite(time)||time<Date.parse('2017-01-01')||time>Date.now()+60000)throw Error('Conversion date is outside the supported range.');return time;
}
function preview(input){
 const {text,mapping:m,decimal='.',offset='+03:00',format='iso'}=input||{};
 if(!m||!['.',','].includes(decimal)||!['Z','+03:00','+01:00','+00:00','unknown'].includes(offset)||!['iso','dmy'].includes(format))throw Error('Choose the statement format.');
 const parsed=table(text),fields=['date','fromAsset','fromAmount','toAsset','toAmount'];
 if(fields.some(k=>!Number.isInteger(m[k])||m[k]<0||m[k]>=parsed.headers.length)||new Set([m.date,m.fromAmount,m.toAmount]).size!==3||m.date===m.fromAsset||m.date===m.toAsset||m.fromAmount===m.toAsset||m.toAmount===m.fromAsset)throw Error('Choose a different column for each required field.');
 const asset=s=>{s=String(s||'').trim().toUpperCase();if(!validAssetSymbol(s))throw Error('Invalid coin symbol.');return s};
 return parsed.rows.map((r,i)=>{try{const combined=k=>String(r[m[k+'Amount']]||'').match(/^(.+?)\s+([\p{L}\p{N}._-]+)$/u),symbol=k=>m[k+'Asset']===m[k+'Amount']?combined(k)?.[2]:r[m[k+'Asset']],value=k=>m[k+'Asset']===m[k+'Amount']?combined(k)?.[1]:r[m[k+'Amount']];const base=asset(symbol('to')),quote=asset(symbol('from'));if(base===quote)throw Error('Choose different outgoing and incoming assets.');const fee=m.fee>=0?number(r[m.fee],decimal,true):0,feeAsset=fee>0?asset(r[m.feeAsset]):quote;
 return{source:'Imported Convert',base,quote,quantity:number(value('to'),decimal),paid:number(value('from'),decimal),side:'BUY',fee,feeAsset,time:date(r[m.date],offset==='unknown'?'Z':offset,format),...(offset==='unknown'?{timeZoneUnverified:true,displayTime:r[m.date]}:{})};
 }catch(e){throw Error('Row '+(i+2)+': '+e.message)}});
}
module.exports={table,preview};

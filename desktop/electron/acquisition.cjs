function quantity(c,asset){return(c.balances||[]).filter(b=>b.asset===asset&&b.type==='crypto').reduce((s,b)=>s+b.quantity,0)}
function validate(c,asset,input){
 const q=quantity(c,asset);if(!(q>0))throw Error('This asset is no longer in the connected account.');
 if(!input||!Number.isFinite(input.quantity)||Math.abs(input.quantity-q)>Math.max(1e-12,q*1e-10))throw Error('The balance changed. Refresh and enter the purchase details again.');
 if(!Number.isFinite(input.cost)||input.cost<0||input.cost>1e15||!['TRY','USD','GBP','EUR'].includes(input.currency))throw Error('Enter a valid purchase cost and currency.');
 if(typeof input.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!Number.isFinite(Date.parse(input.date))||new Date(input.date).toISOString().slice(0,10)!==input.date||input.date>new Date().toLocaleDateString('en-CA'))throw Error('Enter a valid purchase date, today or earlier.');
 return{quantity:q,cost:input.cost,currency:input.currency,date:input.date,fx:{[input.currency]:1},updatedAt:new Date().toISOString()};
}
module.exports={quantity,validate};

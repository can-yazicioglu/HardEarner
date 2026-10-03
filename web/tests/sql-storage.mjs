import {DatabaseSync} from 'node:sqlite';
export function sqlStorage(){
 const db=new DatabaseSync(':memory:');
 return{db,sql:{exec:(text,...args)=>{const rows=db.prepare(text).all(...args);return{toArray:()=>rows}}},transactionSync:fn=>{
  db.exec('BEGIN');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}
 }};
}

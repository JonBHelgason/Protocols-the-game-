const database = new Promise((resolve,reject)=>{
  const req=indexedDB.open('protocols',1);
  req.onupgradeneeded=()=>req.result.createObjectStore('state');
  req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
});
export async function readState() { const db=await database; return new Promise((resolve,reject)=>{const r=db.transaction('state').objectStore('state').get('main');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}); }
export async function writeState(state) { const db=await database; return new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(state,'main');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);}); }

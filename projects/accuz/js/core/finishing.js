/* Buku 3.5 — local scheduling, imports, audit and encrypted backup (not at-rest storage). */
(function(){'use strict';const B=window.Buku,E=(c,m)=>new B.BukuError(c,m),now=()=>B.util.nowIso();
 const safeType=new Set(['documents','deals','property_units','quotations','contacts','journal_entries','payments']);
 function trace(db,x){if(!safeType.has(x.entity))throw E('audit','Invalid audit entity');return db.tx(()=>db.insert('audit_changes',{
   at:now(),action:x.action,entity:x.entity,entity_id:x.id||null,before_json:JSON.stringify(x.before||null),
   after_json:JSON.stringify(x.after||null),reason:x.reason||null}));}
 function addAttachment(db,x){if(!safeType.has(x.entity))throw E('attachment','Unsupported record type');
   if(!Number.isInteger(Number(x.entity_id))||Number(x.entity_id)<=0)throw E('attachment','Invalid record ID');
   const bytes=x.bytes;if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>5*1024*1024)throw E('attachment','Attachment must be 1 byte to 5 MiB');
   if(!String(x.name||'').trim())throw E('attachment','Filename required');return db.tx(()=>db.insert('attachments',{
     entity_type:x.entity,entity_id:Number(x.entity_id),file_name:String(x.name).slice(0,200),mime_type:x.mime||'application/octet-stream',
     size:bytes.length,bytes,created_at:now()}));}
 function attachment(db,id){const a=db.get('SELECT * FROM attachments WHERE id=?',[id]);if(!a)throw E('attachment','Attachment missing');return a;}
 function recurringAdd(db,x){if(!['monthly','quarterly','yearly'].includes(x.cadence)||!B.util.isIsoDate(x.next_date))throw E('recurring','Invalid schedule');
   const template={currency:x.currency||'IDR',memo:x.memo||String(x.name),lines:x.lines};
   if(!Array.isArray(template.lines)||template.lines.length<2)throw E('recurring','Enter balanced lines');
   // Validate using the posting builder, without posting. The scheduled date is used for preview.
   B.posting.build(db,{...template,date:x.next_date},{strict:true});
   return db.tx(()=>db.insert('recurring_schedules',{name:String(x.name),template_json:JSON.stringify(template),cadence:x.cadence,
     next_date:x.next_date,enabled:1,created_at:now()}));}
 function dueDate(date,cadence){const x=new Date(date+'T12:00:00Z'),day=x.getUTCDate();x.setUTCDate(1);
   x.setUTCMonth(x.getUTCMonth()+({monthly:1,quarterly:3,yearly:12}[cadence]));
   x.setUTCDate(Math.min(day,new Date(Date.UTC(x.getUTCFullYear(),x.getUTCMonth()+1,0)).getUTCDate()));return x.toISOString().slice(0,10);}
 function generate(db,id,asOf){return db.tx(()=>{const x=db.get('SELECT * FROM recurring_schedules WHERE id=?',[id]);if(!x||!x.enabled)throw E('recurring','Schedule not active');
   if(x.next_date>(asOf||B.util.today()))throw E('recurring','Next run is not yet due');
   const t=JSON.parse(x.template_json);const data={...t,date:x.next_date,source_type:'recurring_draft',source_id:x.id};
   if(db.scalar('SELECT 1 FROM recurring_runs WHERE schedule_id=? AND date=?',[id,x.next_date]))throw E('duplicate','Draft already generated');
   const draft=B.posting.saveDraft(db,data);
   db.insert('recurring_runs',{schedule_id:id,date:x.next_date,draft_journal_id:draft,created_at:now()});
   db.run('UPDATE recurring_schedules SET next_date=? WHERE id=?',[dueDate(x.next_date,x.cadence),id]);return draft;});}
 function search(db,term){const v='%'+String(term||'').trim().replace(/[%_]/g,'\\$&')+'%';if(term.trim().length<2)return [];
   return [].concat(db.all("SELECT 'deal' type,id,number title,project description FROM deals WHERE number LIKE ? OR project LIKE ? LIMIT 25",[v,v]),
   db.all("SELECT 'document' type,id,coalesce(number,'Draft # '||id) title,coalesce(subject,'') description FROM documents WHERE number LIKE ? OR subject LIKE ? LIMIT 25",[v,v]),
   db.all("SELECT 'contact' type,id,name title,coalesce(email,'') description FROM contacts WHERE name LIKE ? OR email LIKE ? LIMIT 25",[v,v]),
   db.all("SELECT 'unit' type,id,code title,project description FROM property_units WHERE code LIKE ? OR project LIKE ? LIMIT 25",[v,v]));}
 function contactImport(db,text){const rows=B.util.parseCsv(text),head=(rows.shift()||[]).map(s=>String(s).trim().toLowerCase());
   const n=head.indexOf('name');if(n<0)throw E('csv','CSV must include a name column');let created=0,skipped=0;
   return db.tx(()=>{rows.forEach(r=>{const name=(r[n]||'').trim();if(!name){skipped++;return;}
     if(db.scalar('SELECT 1 FROM contacts WHERE lower(name)=lower(?)',[name])){skipped++;return;}
     const get=k=>head.includes(k)?(r[head.indexOf(k)]||'').trim()||null:null;
     db.insert('contacts',{name,tags:'[]',email:get('email'),phone:get('phone'),npwp:get('npwp'),
       is_active:1,created_at:now(),updated_at:now()});created++;});return {created,skipped};});}
 async function encryptBackup(bytes,passphrase){if(!crypto||!crypto.subtle)throw E('crypto','Secure WebCrypto API is unavailable');
   if(String(passphrase||'').length<12)throw E('password','Use a passphrase of at least 12 characters');
   const enc=new TextEncoder(),salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
   const key=await crypto.subtle.importKey('raw',enc.encode(passphrase),'PBKDF2',false,['deriveKey']);
   const aes=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},key,{name:'AES-GCM',length:256},false,['encrypt']);
   const sealed=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},aes,bytes));
   const file=new Uint8Array(4+16+12+sealed.length);file.set(enc.encode('BKE1'));file.set(salt,4);file.set(iv,20);file.set(sealed,32);return file;}
 async function decryptBackup(file,passphrase){if(!(file instanceof Uint8Array)||file.length<48||new TextDecoder().decode(file.slice(0,4))!=='BKE1')throw E('backup','Not a Buku encrypted export');
   const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);
   const aes=await crypto.subtle.deriveKey({name:'PBKDF2',salt:file.slice(4,20),iterations:250000,hash:'SHA-256'},key,{name:'AES-GCM',length:256},false,['decrypt']);
   try{return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:file.slice(20,32)},aes,file.slice(32)));}
   catch(e){throw E('password','Incorrect passphrase or corrupted encrypted backup');}}
 B.finishing={trace,addAttachment,attachment,recurringAdd,generate,search,contactImport,encryptBackup,decryptBackup};
})();

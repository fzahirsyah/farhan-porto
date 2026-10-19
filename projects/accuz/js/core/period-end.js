/* Buku 3.4 — monthly close and general period locks complement independent PPN locks. */
(function(){'use strict';const B=window.Buku,E=(c,m)=>new B.BukuError(c,m),now=()=>B.util.nowIso();
  const valid=p=>/^\d{4}-(0[1-9]|1[0-2])$/.test(p);
  function month(db,p){if(!valid(p))throw E('period','Use YYYY-MM');return db.get('SELECT * FROM period_closings WHERE period=?',[p]);}
  function check(db,p){month(db,p);const end=B.util.monthEnd(p+'-01');
    const unposted=db.scalar("SELECT count(*) FROM journal_entries WHERE status='draft' AND date<=?",[end]);
    const pending=db.scalar("SELECT count(*) FROM documents WHERE status='draft' AND date<=?",[end]);
    const trial=db.get(`SELECT coalesce(sum(l.debit_base),0) debit,coalesce(sum(l.credit_base),0) credit FROM journal_lines l
      JOIN journal_entries e ON e.id=l.entry_id WHERE e.status='posted' AND e.date<=?`,[end]);
    const inventory=B.property?B.property.trial(db):{ok:true};
    const titipan=B.deals?B.deals.trial(db):{ok:true};
    return {period:p,trial,debit:trial.debit,credit:trial.credit,balanced:trial.debit===trial.credit,
      draft_journals:unposted,draft_documents:pending,inventory_ok:inventory.ok,titipan_ok:!titipan.unassigned};}
  function close(db,p,confirmation){return db.tx(()=>{
    const current=month(db,p);if(current&&current.status==='closed')throw E('closed','Period already closed');
    const c=check(db,p);if(!c.balanced||!c.inventory_ok||!c.titipan_ok||c.draft_journals||c.draft_documents)throw E('checklist','Resolve outstanding reconciliations and drafts before closing');
    if(!confirmation)throw E('confirmation','Confirm review of bank, AR, AP, tax, property, deferred revenue and JV balances');
    const checklist=JSON.stringify({bank:true,ar:true,ap:true,tax:true,property:true,jv:true,deferred:true,confirmed_by_user:true});
    db.run(`INSERT INTO period_closings(period,status,checklist,closed_at,reopened_at,reopen_reason,trial_debit,trial_credit)
      VALUES(?,'closed',?,?,NULL,NULL,?,?) ON CONFLICT(period) DO UPDATE SET status='closed',checklist=excluded.checklist,closed_at=excluded.closed_at,
      reopened_at=NULL,reopen_reason=NULL,trial_debit=excluded.trial_debit,trial_credit=excluded.trial_credit`,[p,checklist,now(),c.debit,c.credit]);
    db.insert('period_events',{period:p,event:'close',at:now()});B.posting.audit(db,'close','period_closings',null,p);return c;});}
  function reopen(db,p,reason){return db.tx(()=>{const v=month(db,p);if(!v||v.status!=='closed')throw E('period','Period is not closed');
    if(!String(reason||'').trim())throw E('reason','Reopening requires a reason');
    db.run("UPDATE period_closings SET status='reopened',reopened_at=?,reopen_reason=? WHERE period=?",[now(),reason,p]);
    db.insert('period_events',{period:p,event:'reopen',reason,at:now()});B.posting.audit(db,'reopen','period_closings',null,p+' '+reason);});}
  function budget(db,p,account,amount){return db.tx(()=>{month(db,p);if(!db.scalar('SELECT 1 FROM accounts WHERE id=? AND is_header=0',[account]))throw E('account','Unknown budget account');
    if(!Number.isSafeInteger(Number(amount)))throw E('amount','Invalid budget amount');
    db.run('INSERT INTO budgets(period,account_id,amount) VALUES(?,?,?) ON CONFLICT(period,account_id) DO UPDATE SET amount=excluded.amount',[p,account,Number(amount)]);});}
  function budgetReport(db,p){month(db,p);return db.all(`SELECT b.*,a.code,a.name,
    coalesce((SELECT sum(CASE WHEN a.type IN ('income','liability','equity') THEN l.credit_base-l.debit_base ELSE l.debit_base-l.credit_base END)
    FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE e.status='posted' AND e.source_type<>'year_end' AND l.account_id=b.account_id AND substr(e.date,1,7)=b.period),0) actual
    FROM budgets b JOIN accounts a ON a.id=b.account_id WHERE b.period=? ORDER BY a.code`,[p]);}
  function fiscal(db,x){return db.tx(()=>{month(db,x.period);if(!['positive','negative','final_income','credit'].includes(x.kind)||!Number.isSafeInteger(Number(x.amount))||x.amount<0)
    throw E('fiscal','Invalid fiscal adjustment');return db.insert('fiscal_adjustments',{period:x.period,account_id:x.account_id||null,kind:x.kind,
      amount:Number(x.amount),memo:x.memo||null,created_at:now()});});}
  function yearEnd(db,end){return db.tx(()=>{if(!B.util.isIsoDate(end))throw E('date','Use YYYY-MM-DD for fiscal year end');
    const start=B.util.fiscalYearStart(end,db.scalar('SELECT fiscal_year_start_month FROM company WHERE id=1'));
    if(B.util.addDays(B.util.monthStart(start,12),-1)!==end)throw E('year_end','This is not the fiscal year-end date for this company');
    if(db.scalar('SELECT 1 FROM year_end_closings WHERE year_end=?',[end]))throw E('year_closed','Fiscal year is already closed');
    const rows=db.all(`SELECT a.id,a.type,coalesce(sum(l.debit_base-l.credit_base),0) net FROM journal_lines l
      JOIN journal_entries e ON e.id=l.entry_id JOIN accounts a ON a.id=l.account_id
      WHERE e.status='posted' AND e.date>=? AND e.date<=? AND a.type IN ('income','expense') AND a.is_header=0
      GROUP BY a.id,a.type HAVING net<>0`,[start,end]);
    if(!rows.length)throw E('no_balance','No nominal-account balances to close');
    const out=rows.map(r=>r.net>0?{account_id:r.id,credit:r.net}:{account_id:r.id,debit:-r.net});
    const net=rows.reduce((sum,r)=>sum-r.net,0);
    const retained=db.scalar("SELECT id FROM accounts WHERE code='3-2000' AND is_header=0 AND is_active=1");
    if(!retained)throw E('account','Retained earnings account missing');
    if(net>0)out.push({account_id:retained,credit:net});else if(net<0)out.push({account_id:retained,debit:-net});
    const j=B.posting.post(db,{date:end,currency:'IDR',source_type:'year_end',reference:end,
      memo:'Close nominal accounts for fiscal year '+start+' to '+end,lines:out});
    db.insert('year_end_closings',{year_end:end,journal_entry_id:j.id,profit:net,closed_at:now()});
    B.posting.audit(db,'year_end','year_end_closings',null,end);return {journal:j,profit:net};});}
  function fxRevalue(db,p,currency){return db.tx(()=>{month(db,p);if(currency==='IDR'||!db.scalar('SELECT is_enabled FROM currencies WHERE code=?',[currency]))throw E('fx','Select an active foreign currency');
    if(db.scalar('SELECT 1 FROM fx_revaluations WHERE period=? AND currency=?',[p,currency]))throw E('fx_exists','This currency is already revalued for the period');
    const asof=B.util.monthEnd(p+'-01'),rateObj=B.fx.lookup(db,currency,asof);
    if(!rateObj)throw E('rate','Set the closing exchange rate first');
    const accounts=db.all(`SELECT a.id,a.code,a.type,a.subtype,
      coalesce(sum(CASE WHEN e.status='posted' AND e.date<=? THEN l.debit-l.credit ELSE 0 END),0) foreign_net,
      coalesce(sum(CASE WHEN e.status='posted' AND e.date<=? THEN l.debit_base-l.credit_base ELSE 0 END),0) base_net
      FROM accounts a LEFT JOIN journal_lines l ON l.account_id=a.id LEFT JOIN journal_entries e ON e.id=l.entry_id
      WHERE a.currency=? AND a.is_header=0 AND a.subtype IN ('bank','cash','ar','ap') GROUP BY a.id`,[asof,asof,currency]);
    const lines=[],fx=db.scalar("SELECT id FROM accounts WHERE code='7-2100'"),dec=B.fx.decimals(db,currency);
    if(!fx)throw E('account','Unrealized FX account missing');let sum=0;
    for(const a of accounts){if(!a.foreign_net)continue;
      const target=(a.foreign_net<0?-1:1)*B.money.toBase(Math.abs(a.foreign_net),dec,rateObj.rate);
      const diff=target-a.base_net;if(!diff)continue;
      const value=Math.abs(diff),isDebit=diff>0;
      lines.push({account_id:a.id,currency,rate:rateObj.rate,debit:0,credit:0,base:value,side:isDebit?'debit':'credit',description:'FX valuation '+a.code});
      lines.push({account_id:fx,currency:'IDR',...(isDebit?{credit:value}:{debit:value}),description:'Unrealized FX '+a.code});
      sum+=diff;
    }
    if(!lines.length)throw E('no_revaluation','Balances are already at the closing rate or no foreign monetary balance exists');
    const j=B.posting.post(db,{date:asof,currency:'IDR',source_type:'fx_revalue',reference:p+' '+currency,
      memo:'Unrealized foreign-exchange revaluation '+currency,lines});
    db.insert('fx_revaluations',{period:p,currency,journal_entry_id:j.id,amount:sum,created_at:now()});
    return {journal:j,amount:sum};});}
  function reverseFx(db,p,currency){return db.tx(()=>{const r=db.get('SELECT * FROM fx_revaluations WHERE period=? AND currency=?',[p,currency]);
    if(!r||r.reversal_entry_id)throw E('fx','Missing or already reversed FX revaluation');
    const next=B.util.monthStart(p+'-01',1);const j=B.posting.reverse(db,r.journal_entry_id,next,'Reverse unrealized FX '+p+' '+currency);
    db.run('UPDATE fx_revaluations SET reversal_entry_id=? WHERE id=?',[j.id,r.id]);return j;});}
  B.period={month,check,close,reopen,budget,budgetReport,fiscal,yearEnd,fxRevalue,reverseFx};
})();

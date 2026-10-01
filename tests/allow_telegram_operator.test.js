'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {allowOperator}=require('../scripts/allow-telegram-operator');
test('adds Telegram operator to all three local allowlists idempotently without exposing other config',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aterum-telegram-allow-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'.env');fs.writeFileSync(file,'SECRET=keep-private\nTELEGRAM_ALLOWED_CHAT_IDS=11111\n',{mode:0o600});
 allowOperator(file,'1254740120');allowOperator(file,'1254740120');
 const value=fs.readFileSync(file,'utf8');
 assert.match(value,/SECRET=keep-private/);
 for(const key of ['TELEGRAM_ALLOWED_CHAT_IDS','TELEGRAM_ALLOWED_USER_IDS','TELEGRAM_SHUTDOWN_ALLOWED_USER_IDS']){
  assert.match(value,new RegExp(`^${key}=.*1254740120`, 'm'));
  assert.equal(value.match(new RegExp(`^${key}=.*1254740120.*1254740120`, 'm')),null);
 }
 assert.equal(fs.statSync(file).mode&0o777,0o600);
 assert.throws(()=>allowOperator(file,'125;bad'),/numeric/);
});

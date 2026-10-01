#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const keys=['TELEGRAM_ALLOWED_CHAT_IDS','TELEGRAM_ALLOWED_USER_IDS','TELEGRAM_SHUTDOWN_ALLOWED_USER_IDS'];
function allowOperator(file,id){
 if(!/^\d{5,20}$/.test(String(id||'')))throw new Error('TELEGRAM_USER_ID must be numeric');
 const stat=fs.statSync(file);const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);
 for(const key of keys){
  const found=lines.findIndex(line=>line.startsWith(key+'='));
  const values=found<0?[]:lines[found].slice(key.length+1).split(',').map(x=>x.trim()).filter(Boolean);
  if(!values.includes(String(id)))values.push(String(id));
  const updated=key+'='+values.join(',');
  if(found<0)lines.push(updated);else lines[found]=updated;
 }
 const content=lines.join('\n').replace(/\n*$/,'\n');
 const temp=path.join(path.dirname(file),`.env-telegram-${process.pid}.tmp`);
 fs.writeFileSync(temp,content,{mode:stat.mode&0o777,flag:'wx'});
 try{fs.renameSync(temp,file)}catch(error){fs.unlinkSync(temp);throw error}
}
if(require.main===module){
 try{allowOperator(path.resolve(__dirname,'../.env'),process.argv[2]);console.log('Telegram operator added locally. Recreate telegram_control to apply access.');}
 catch(error){console.error(error.message);process.exitCode=1}
}
module.exports={allowOperator};

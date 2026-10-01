'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createServer,windowsAction,validateTime}=require('../scripts/aterum-shutdown-bridge');
const {createCommands,commandAllowed}=require('../telegram-control/commands');
const {request}=require('../telegram-control/shutdown');
test('only fixed scheduler actions and valid time enter PowerShell',async()=>{
 assert(validateTime('23:30'));assert(!validateTime('23:30; shutdown /s'));
 let command;
 const run=async(exe,args)=>{command=[exe,...args];return{stdout:'{"scheduled":true,"nextRunTime":"2026-10-01T23:30:00"}'};};
 const config={windowsScript:'C:\\Users\\a\\AppData\\Local\\Aterum\\controlled-shutdown.ps1',distro:'Debian',user:'saitama',controlScript:'/home/saitama/projects/aterum/aterum_gui/scripts/aterum-control.js'};
 await windowsAction('Schedule','23:30',config,run);
 assert(command.includes('-Time'));assert(command.includes('23:30'));
 await assert.rejects(windowsAction('Schedule','x; shutdown /s',config,run),/INVALID_TIME/);
 assert(!command.includes('x; shutdown /s'));
});
test('Telegram shutdown requires private admin and allowlisted user, then requests a fixed action',async()=>{
 const shutdown=require('../telegram-control/shutdown');
 const before=shutdown.request;let called=0;
 shutdown.request=async(socket,mode,payload)=>{called++;assert.equal(socket,'/safe/socket');assert.equal(mode,'schedule');assert.equal(payload.time,'23:30');return{scheduled:true,nextRunTime:'2026-10-01T23:30:00'}};
 try{
  const commands=createCommands({config:{shutdownSocket:'/safe/socket',shutdownAllowedUserIds:new Set(['7'])},api:{},audit:{},telegram:{}});
  assert.equal(commandAllowed('viewer','shutdown_at'),false);
  await assert.rejects(commands.execute('shutdown_at',['23:30'],{role:'admin',chatType:'supergroup',userId:'7'}),/private/);
  await assert.rejects(commands.execute('shutdown_cancel',[],{role:'admin',chatType:'supergroup',userId:'7'}),/private/);
  await assert.rejects(commands.execute('shutdown_at',['23:30'],{role:'admin',chatType:'private',userId:'8'}),/allowed/);
  assert.equal(called,0);
  const result=await commands.execute('shutdown_at',['23:30'],{role:'admin',chatType:'private',userId:'7'});
  assert.match(result,/CONTROLLED SHUTDOWN/);assert.equal(called,1);
  shutdown.request=async()=>({scheduled:false});
  assert.match(await commands.execute('shutdown_status',[],{role:'admin',chatType:'supergroup',userId:'7'}),/No shutdown scheduled/);
 }finally{shutdown.request=before}
});

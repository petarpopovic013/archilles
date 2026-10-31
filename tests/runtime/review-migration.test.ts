import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {migrations} from '../../runtime/db/schema';
import {openDatabase} from '../../runtime/db/connection';
import {contractFixture} from '../../src/domain';

test('upgrades an already-versioned review database missing review_rounds without losing projects',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'archilles-upgrade-')),file=path.join(dir,'db.sqlite');
  try{
    const old=new Database(file);
    for(let i=0;i<7;i++)old.exec(i===6?migrations[i].replace(/CREATE TABLE review_rounds\s*\([\s\S]*?\);/,''):migrations[i]);
    old.pragma('user_version = 7');
    old.prepare('INSERT INTO projects(id,revision,data) VALUES(?,?,?)').run(contractFixture.project.id,1,JSON.stringify(contractFixture.project));old.close();
    const migrated=openDatabase(file);
    assert.ok(migrated.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='review_rounds'").get());
    assert.equal(migrated.pragma('user_version',{simple:true}),migrations.length);
    assert.equal(migrated.prepare('SELECT COUNT(*) FROM projects').pluck().get(),1);migrated.close();
    const repeat=openDatabase(file);assert.equal(repeat.prepare('SELECT COUNT(*) FROM projects').pluck().get(),1);repeat.close();
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

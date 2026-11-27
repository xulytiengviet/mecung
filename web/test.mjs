import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {actor,weights} from './actor.mjs';
import {Robot,leastVisited,CELL} from './sim.mjs';
const params=await weights(new Uint8Array(await readFile(new URL('../checkpoints/maze_5x5_hier_best.zip',import.meta.url))));
assert.equal(params.reduce((count,t)=>count+t.length,0),85316);
for(const n of [5,7]){
  for(const mode of ['rl','baseline']){
    let wins=0,moves=0;
    for(let seed=1;seed<=20;seed++){
      const bot=new Robot(n,seed,mode==='rl'?actor(params):leastVisited);
      while(['ready','drive','turn'].includes(bot.phase)){
        assert.ok(bot.ticks<100000);
        const prev=bot.cell;bot.tick();
        if(prev!==bot.cell) {
          assert.equal(Math.abs(prev%n-bot.cell%n)+Math.abs(Math.floor(prev/n)-Math.floor(bot.cell/n)),1);
          assert.equal(Math.floor(bot.x/CELL)+n*Math.floor(bot.y/CELL),bot.cell);
        }
      }
      if(bot.phase==='goal'){wins++;moves+=bot.moves;}
      else assert.equal(bot.phase,'limit');
    }
    assert.ok(wins>0);
    console.log({n,mode,wins,seeds:20,meanSuccessfulMoves:moves/wins});
  }
}

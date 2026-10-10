import test from 'node:test';
import assert from 'node:assert/strict';
import {clampOverlay,visibleViewport} from '../src/viewportPlacement.js';

test('floating editors remain visible at all corners without changing their anchor',()=>{
 const bounds={left:0,top:0,width:390,height:844};
 for(const anchor of [{left:0,top:0},{left:382,top:0},{left:0,top:836},{left:382,top:836}]){
  const before={...anchor},box=clampOverlay(anchor,{width:280,height:136},bounds);
  assert.ok(box.left>=8&&box.top>=8);assert.ok(box.left+box.width<=382&&box.top+box.height<=836);assert.deepEqual(anchor,before);
 }
});
test('keyboard and shifted visual viewport restrict editable UI dimensions',()=>{
 const bounds=visibleViewport({innerWidth:390,innerHeight:844,visualViewport:{offsetLeft:0,offsetTop:160,width:390,height:280}});
 const box=clampOverlay({left:380,top:800},{width:500,height:400},bounds);
 assert.deepEqual(box,{left:8,top:168,width:374,height:264});
});
test('rotated tablet panel is clamped using current viewport rather than old position',()=>{
 const box=clampOverlay({left:679.125,top:178},{width:300,height:440},{left:0,top:0,width:820,height:1180});
 assert.equal(box.left,512);assert.equal(box.left+box.width,812);
});

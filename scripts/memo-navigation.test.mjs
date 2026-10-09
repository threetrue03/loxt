import test from 'node:test';
import assert from 'node:assert/strict';
import { memoOutline, inlineText, textMatches } from '../src/memoNavigation.js';
const heading = (id, level, text, children = []) => ({ id, type: 'heading', props: { level }, content: [{ type: 'text', text }], children });
test('outline keeps stable IDs, skipped levels, repeated and empty titles', () => {
  const result = memoOutline([heading('a',1,'한글'),heading('b',3,'중복'),heading('c',4,''),heading('d',2,'중복'),heading('e',4,'끝'),heading('f',1,'새 루트')]);
  assert.deepEqual(result.roots.map(item => item.id), ['a','f']);
  assert.deepEqual(result.roots[0].children.map(item => item.id), ['b','d']);
  assert.equal(result.flat[2].title, '제목 없음'); assert.equal(result.roots[0].children[1].children[0].id, 'e');
});
test('outline includes nested children and inline links but excludes Markdown-looking code', () => {
  const result = memoOutline([{id:'toggle',type:'toggleListItem',children:[heading('nested',2,'내용')]},{id:'code',type:'codeBlock',content:[{text:'# 코드'}]},heading('outside',1,'제목'),heading('unsupported',5,'h5')]);
  assert.deepEqual(result.flat.map(item=>item.id),['nested','outside']); assert.deepEqual(result.flat[0].parents,['toggle']);
  assert.equal(inlineText([{text:'긴 '},{type:'link',content:[{text:'링크'}]},{text:' 제목'}]),'긴 링크 제목');
});
test('search offsets span formatted fragments and preserve expanded Unicode offsets', () => {
  assert.deepEqual(textMatches(['프로젝트 ', '회의', ' 기록'].join(''),'프로젝트 회의'),[{start:0,end:7}]);
  assert.deepEqual(textMatches('İ test 😀 TEST','test'),[{start:2,end:6},{start:10,end:14}]);
  assert.deepEqual(textMatches('İ','i'),[{start:0,end:1}]);
});
test('search is bounded and skips empty queries', () => {
  assert.equal(textMatches('a '.repeat(2000),'a',500).length,500); assert.deepEqual(textMatches('abc',''),[]);
});

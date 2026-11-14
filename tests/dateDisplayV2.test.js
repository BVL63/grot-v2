import test from 'node:test';
import assert from 'node:assert/strict';
import {displayDate,parseDisplayDate,displayTimestamp} from '../src/dateDisplayV2.js';

test('ISO date shown as dd.mm.yy and back',()=>{
 assert.equal(displayDate('2027-02-08'),'08.02.27');
 assert.equal(parseDisplayDate('08.02.27'),'2027-02-08');
 assert.equal(displayDate(''),'');
 assert.equal(parseDisplayDate(''),'');
});
test('Leap dates and invalid text',()=>{
 assert.equal(parseDisplayDate('29.02.28'),'2028-02-29');
 assert.throws(()=>parseDisplayDate('29.02.27'),/Некорректная/);
 assert.throws(()=>parseDisplayDate('2027-02-08'),/формате/);
 assert.equal(displayTimestamp('2026-11-14T02:07:09.000Z'),'14.11.26 02:07');
});

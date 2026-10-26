import { describe, expect, it } from 'vitest';
import { channelExpression, parseChannelList } from '@sanctuary/shared';
import { EosCommandBuilder, isReadOnlyAddress } from '../src/engine/eosCommands';
import { parseCueText, parseFeedback } from '../src/engine/eosFeedback';
import { float, str } from '../src/osc/codec';

describe('channel expressions', () => {
  it('compresses ranges using Eos syntax', () => {
    expect(channelExpression([3, 1, 2, 5, 7, 8, 9, 30])).toBe('1 Thru 3 + 5 + 7 Thru 9 + 30');
    expect(channelExpression([20, 21])).toBe('20 + 21');
  });
  it('parses user-entered lists', () => {
    expect(parseChannelList('1-3, 30, 79 thru 80')).toEqual([1, 2, 3, 30, 79, 80]);
    expect(parseChannelList('5 + 7')).toEqual([5, 7]);
  });
});

describe('EosCommandBuilder', () => {
  const b = new EosCommandBuilder(null);
  it('builds command-line intensity commands with Enter (#)', () => {
    expect(b.intensity({ channels: [20, 21, 22], eosGroup: null }, 75)[0]).toEqual({ address: '/eos/newcmd', args: [str('Chan 20 Thru 22 At 75 #')] });
    expect(b.intensity({ channels: [1], eosGroup: 4 }, 100)[0].args[0].value).toBe('Group 4 At Full #');
  });
  it('fires cues on an explicit list', () => {
    expect(b.fireCue(2, '15.5')[0].address).toBe('/eos/cue/2/15.5/fire');
    expect(() => b.fireCue(1, '1; drop')).toThrow();
  });
  it('scales submasters to 0–1', () => {
    expect(b.sub(3, 50)[0]).toEqual({ address: '/eos/sub/3', args: [float(0.5)] });
  });
  it('prefixes the OSC user when configured', () => {
    const u = new EosCommandBuilder(5);
    expect(u.fireCue(1, '1')[0].address).toBe('/eos/user/5/cue/1/1/fire');
    expect(u.ping().address).toBe('/eos/ping');
  });
  it('only treats query addresses as read-only', () => {
    expect(isReadOnlyAddress('/eos/ping')).toBe(true);
    expect(isReadOnlyAddress('/eos/get/version')).toBe(true);
    expect(isReadOnlyAddress('/eos/newcmd')).toBe(false);
    expect(isReadOnlyAddress('/eos/user/3/newcmd')).toBe(false);
    expect(isReadOnlyAddress('/eos/sub/1')).toBe(false);
  });
});

describe('Eos feedback parsing', () => {
  it('parses cue text with label, time and percent', () => {
    const c = parseCueText('1/45 Sermon Wash 5 100%');
    expect(c).toMatchObject({ list: 1, cue: '45', label: 'Sermon Wash', progress: 100 });
    expect(parseCueText('2/3.5 Song 3 4.5 37%')).toMatchObject({ list: 2, cue: '3.5', label: 'Song 3', progress: 37 });
  });
  it('keeps unparseable text as a label', () => {
    expect(parseCueText('weird')).toMatchObject({ list: null, label: 'weird' });
  });
  it('maps progress floats to percent', () => {
    expect(parseFeedback({ address: '/eos/out/active/cue/1/45', args: [float(0.25)] })).toEqual({ kind: 'cueProgress', list: 1, cue: '45', progress: 25 });
  });
  it('parses patch replies from the third-party API', () => {
    const ev = parseFeedback({ address: '/eos/out/get/patch/21/1/list/0/50', args: [{ type: 'i', value: 0 }, str('uid'), str('Front 2'), str('ETC'), str('Source Four WRD'), { type: 'i', value: 533 }] });
    expect(ev).toMatchObject({ kind: 'patchEntry', channel: 21, label: 'Front 2', absoluteAddress: 533 });
  });
});

import { describe, it, expect } from 'vitest';
const inv = require('../../lib/expert-investigate');
const mcp = require('../../lib/aditkb-mcp');

describe('expert investigator', () => {
  it('decides when to look things up', () => {
    const tk = { meta: { account: 'test hayden' }, text: '' };
    expect(inv.needsLookup('what should I do', tk, null)).toBe(true);
    expect(inv.needsLookup('what should I do', tk, { header: { account: 'test hayden' } })).toBe(true);
    const real = { meta: { account: 'Bright Smiles' } }, crm = { header: { account: 'Bright Smiles' } };
    expect(inv.needsLookup('write the reply', real, crm)).toBe(false);
    expect(inv.needsLookup('who is the CSM on this account', real, crm)).toBe(true);
    expect(inv.needsLookup('How do I set up appointment reminders?', null, null)).toBe(false);
    expect(inv.needsLookup('Find Dr. Perry in NC and check the deal', null, null)).toBe(true);
  });
  it('describes lookups in plain words', () => {
    expect(inv._describe('run_sql', { sql: 'select a from crm_accounts a join crm_deals d on 1=1' })).toBe('Looked up crm_accounts, crm_deals');
    expect(inv._describe('data_dictionary', {})).toBe('Checked which records are available');
  });
  it('runs a tool loop, only with allowed tools, and returns findings and steps', async () => {
    const called = [];
    const fakeMcp = {
      tools: async () => [{ name: 'run_sql', description: 'sql', inputSchema: { type: 'object' } }, { name: 'read_email', description: 'mail' }],
      instructions: async () => 'Call data_dictionary first.',
      call: async (name, args) => { called.push(name); return { isError: false, text: '[{"account":"Perry Family Dentistry","city":"Statesville"}]' }; },
    };
    let n = 0, sentTools = null;
    const fakeClaude = async (body) => {
      n++; sentTools = body.tools.map(t => t.name);
      if (n === 1) return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'u1', name: 'run_sql', input: { sql: 'select * from crm_accounts' } }, { type: 'tool_use', id: 'u2', name: 'read_email', input: {} }] };
      const last = body.messages[body.messages.length - 1];
      expect(last.content.find(c => c.tool_use_id === 'u2').is_error).toBe(true);
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ACCOUNT: Perry Family Dentistry, Statesville NC (AditKB)\nFINDINGS:\n- x [CRM]' }] };
    };
    const r = await inv.investigate({ question: 'find Dr. Perry', deps: { mcp: fakeMcp, claude: fakeClaude } });
    expect(sentTools).toEqual(['run_sql']);
    expect(called).toEqual(['run_sql']);
    expect(r.summary).toMatch(/Perry Family Dentistry/);
    expect(r.summary).not.toMatch(/AditKB/);
    expect(r.steps.map(s => s.ok)).toEqual([true, false]);
  });
  it('stops at the lookup budget and asks for findings', async () => {
    const fakeMcp = { tools: async () => [{ name: 'read_rows', inputSchema: { type: 'object' } }], instructions: async () => '', call: async () => ({ text: 'rows' }) };
    let last = null;
    const fakeClaude = async (body) => { last = body; if (body.tool_choice.type === 'none') return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ACCOUNT: not found' }] };
      return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'x' + Math.random(), name: 'read_rows', input: { table: 't' } }] }; };
    const r = await inv.investigate({ question: 'q', maxCalls: 3, deps: { mcp: fakeMcp, claude: fakeClaude } });
    expect(r.calls).toBe(3);
    expect(r.summary).toBe('ACCOUNT: not found');
    expect(last.messages[last.messages.length - 1].role).toBe('user');
  });
  it('reads MCP replies as JSON or event streams', () => {
    expect(mcp._readReply('{"jsonrpc":"2.0","id":3,"result":{"ok":1}}', 3).result.ok).toBe(1);
    expect(mcp._readReply('event: message\ndata: {"jsonrpc":"2.0","id":4,"result":{"tools":[]}}\n\n', 4).result.tools).toEqual([]);
  });
  it('keeps the live CRM tools read-only', async () => {
    expect((await inv._runLocal('crm_query', { coql: 'delete from Deals' })).isError).toBe(true);
    expect((await inv._runLocal('crm_query', { coql: 'select id from Deals; select id from Accounts' })).isError).toBe(true);
    expect((await inv._runLocal('crm_deal_people', { deal_id: 'abc' })).isError).toBe(true);
    expect(inv._describe('crm_deal_people', {})).toMatch(/tech onboarding owner/);
  });
  it('offers local tools and runs them through their own runner', async () => {
    const fakeMcp = { tools: async () => [{ name: 'run_sql', inputSchema: { type: 'object' } }], instructions: async () => '', call: async () => ({ text: 'x' }) };
    let n = 0, ran = null;
    const fakeClaude = async (body) => { n++; if (n === 1) { expect(body.tools.map(t => t.name)).toContain('crm_deal_people'); return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'a', name: 'crm_deal_people', input: { deal_id: '1607362002063490842' } }] }; }
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ACCOUNT: x\nFINDINGS:\n- Tech onboarding owner Tyler Roden [CRM Tech OB]' }] }; };
    const local = { tools: inv.LOCAL, run: async (name, a) => { ran = [name, a.deal_id]; return { isError: false, text: '{"tech_onboarding_owner":"Tyler Roden"}' }; } };
    const r = await inv.investigate({ question: 'q', deps: { mcp: fakeMcp, claude: fakeClaude, local } });
    expect(ran).toEqual(['crm_deal_people', '1607362002063490842']);
    expect(r.summary).toMatch(/Tyler Roden/);
  });
});

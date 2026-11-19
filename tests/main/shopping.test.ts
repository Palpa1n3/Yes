import { describe, expect, it } from 'vitest';
import { shoppingRules } from '../../src/main/services/agent-runner';
import { sanitizeSettings } from '../../src/shared/settings';
import { EXTRA_TOOL_DEFS } from '../../src/main/services/extra-tool-defs';

describe('shopping with Agent Mode', () => {
  it('lets it ask sellers questions but never commit without approval', () => {
    const r = shoppingRules('Jack', { shopping: true, sellerMessages: 'allow' });
    expect(r).toContain('WITHOUT confirm_action');
    expect(r).toContain('making or countering an offer');
    expect(r).toMatch(/again right before the final Pay/);
    expect(r).toContain('never type card details');
    expect(r).toContain('outside the site');
    expect(r).toContain('address, phone number, email or payment details');
  });

  it('asks for every message, or none at all, when set that way', () => {
    expect(shoppingRules('Jack', { sellerMessages: 'ask' })).toContain(
      'Before sending any message to a seller, use confirm_action',
    );
    expect(shoppingRules('Jack', { sellerMessages: 'block' })).toContain('Do not message sellers');
  });

  it('seller messages are allowed by default and the setting is kept', () => {
    expect(sanitizeSettings({}).permissions.message_sellers).toBe('allow');
    expect(
      sanitizeSettings({ permissions: { message_sellers: 'ask' } }).permissions.message_sellers,
    ).toBe('ask');
  });

  it('Claude has a shop tool that says payments always need approval', () => {
    const t = EXTRA_TOOL_DEFS.find((x) => x.name === 'shop');
    expect(t?.description).toContain('ALWAYS need the user');
  });
});

import { describe, expect, it } from 'vitest';
import {
  archiveHashes,
  archiveHeader,
  effectiveOrder,
  findConflicts,
  gameOrder,
  isPatch,
  isOurModlist,
  modlistText,
  preferOrder,
  variants,
  related,
  suggestOrder,
} from '@shared/loadorder';

/** A fake index block with the given hashes. */
function index(hashes: bigint[]): Uint8Array {
  const b = new Uint8Array(28 + hashes.length * 56);
  const v = new DataView(b.buffer);
  v.setUint32(0, 8, true);
  v.setUint32(16, hashes.length, true);
  hashes.forEach((h, i) => v.setBigUint64(28 + i * 56, h, true));
  return b;
}

describe('archive load order', () => {
  it('reads the header and the files an archive changes', () => {
    const head = new Uint8Array(40);
    head.set([0x52, 0x44, 0x41, 0x52]);
    const v = new DataView(head.buffer);
    v.setBigUint64(8, 2748416n, true);
    v.setUint32(16, 5532, true);
    expect(archiveHeader(head)).toEqual({ indexPos: 2748416, indexSize: 5532 });
    expect(archiveHeader(new Uint8Array(40))).toBeNull();
    expect(archiveHashes(index([0xfbdf71b3b6c68n, 0x9bb586b7606147d8n]))).toEqual([
      'fbdf71b3b6c68',
      '9bb586b7606147d8',
    ]);
  });
  it('orders like the game, or by modlist.txt', () => {
    expect(gameOrder(['b.archive', '#x.archive', '!a.archive', 'A.archive'])).toEqual([
      '!a.archive',
      '#x.archive',
      'A.archive',
      'b.archive',
    ]);
    expect(effectiveOrder(['a', 'b', 'c'], '# note\nc\nmissing\n')).toEqual(['c', 'a', 'b']);
  });
  it('finds clashes and moves patches ahead of what they patch', () => {
    const hashes = new Map([
      ['Apartment Cats.archive', ['1', '2', '3']],
      ['Cats Patch.archive', ['2', '3']],
      ['Other.archive', ['9']],
      ['!Better Lights.archive', ['3']],
    ]);
    const order = gameOrder([...hashes.keys()]);
    const c = findConflicts(order, hashes);
    expect(c).toHaveLength(3);
    expect(c).toEqual(
      expect.arrayContaining([
        { winner: 'Apartment Cats.archive', loser: 'Cats Patch.archive', files: 1 },
        { winner: '!Better Lights.archive', loser: 'Apartment Cats.archive', files: 1 },
        { winner: '!Better Lights.archive', loser: 'Cats Patch.archive', files: 1 },
      ]),
    );
    const s = suggestOrder(order, c);
    expect(s.order).toEqual([
      '!Better Lights.archive',
      'Cats Patch.archive',
      'Apartment Cats.archive',
      'Other.archive',
    ]);
    expect(s.moves).toHaveLength(1);
    expect(s.moves[0]).toMatchObject({
      archive: 'Cats Patch.archive',
      before: 'Apartment Cats.archive',
    });
    expect(isPatch('Stats Bar UI Fix.archive')).toBe(true);
    expect(related('Cats Patch.archive', 'Apartment Cats.archive')).toBe(true);
    expect(related('Cats Patch.archive', '!Better Lights.archive')).toBe(false);
    expect(isPatch('Apartment Cats.archive')).toBe(false);
    expect(modlistText(['a', 'b'])).toMatch(/^# .*\na\nb\n$/);
  });
});

describe('choosing winners', () => {
  it('spots alternative versions and moves a chosen winner ahead', () => {
    expect(
      variants(
        '#ReallyWantToStayAtYourHouse_Judy.archive',
        '#ReallyWantToStayAtYourHouse_Panam.archive',
      ),
    ).toBe(true);
    expect(variants('ImmersiveFoodVendors.archive', 'ImmersiveFoodVendorsDogtown.archive')).toBe(
      false,
    );
    expect(preferOrder(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(preferOrder(['a', 'b', 'c'], 'a', 'c')).toEqual(['a', 'b', 'c']);
    expect(isOurModlist(modlistText(['a']))).toBe(true);
    expect(isOurModlist('a\nb')).toBe(false);
  });
});

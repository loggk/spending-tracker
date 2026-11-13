import { describe, expect, it } from 'vitest';
import { sanitizeMerchant } from './merchant';

describe('sanitizeMerchant', () => {
  it('collapses the ways one merchant gets written', () => {
    const spellings = [
      '7-ELEVEN #38104 TORONTO ON',
      '7 ELEVEN 38104, TORONTO, ON',
      '7/ELEVEN  38104   Toronto  ON  CA',
    ];

    const [first] = spellings.map(sanitizeMerchant);

    expect(first).toBe('7 ELEVEN TORONTO');
    for (const spelling of spellings) {
      expect(sanitizeMerchant(spelling)).toBe(first);
    }
  });

  it('drops a payment processor prefix', () => {
    expect(sanitizeMerchant('SQ *BLUE BOTTLE COFFEE')).toBe('BLUE BOTTLE COFFEE');
    expect(sanitizeMerchant('TST* CANOE RESTAURANT')).toBe('CANOE RESTAURANT');
  });

  it('keeps a digit that belongs to the name', () => {
    expect(sanitizeMerchant('A&W #212')).toBe('A W');
    expect(sanitizeMerchant('7 ELEVEN')).toBe('7 ELEVEN');
  });

  it('drops a trailing province or country but not one inside the name', () => {
    expect(sanitizeMerchant('LOBLAWS ON')).toBe('LOBLAWS');
    expect(sanitizeMerchant('ON THE RUN BC')).toBe('ON THE RUN');
  });

  it('never returns an empty string for a merchant that had letters', () => {
    expect(sanitizeMerchant('ON')).toBe('ON');
  });

  it('is stable across case and punctuation', () => {
    expect(sanitizeMerchant('Tim Hortons')).toBe(sanitizeMerchant('TIM HORTONS!'));
  });
});

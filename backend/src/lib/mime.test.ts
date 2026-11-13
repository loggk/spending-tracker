import { describe, expect, it } from 'vitest';
import { decodeEncodedWords, extractAddress, htmlToText, parameter, parseEmail } from './mime';

const crlf = (lines: string[]): string => lines.join('\r\n');

describe('parseEmail', () => {
  it('reads headers and a plain body', () => {
    const email = parseEmail(
      crlf([
        'From: "American Express" <AmericanExpress@welcome.americanexpress.com>',
        'Subject: Transaction Approved',
        'Content-Type: text/plain; charset=UTF-8',
        '',
        'Amount: $38.60',
        'Merchant: TIM HORTONS',
      ]),
    );

    expect(email.from).toBe('americanexpress@welcome.americanexpress.com');
    expect(email.subject).toBe('Transaction Approved');
    expect(email.text).toContain('Merchant: TIM HORTONS');
  });

  it('unfolds a header split across lines', () => {
    const email = parseEmail(
      crlf(['Subject: A very long', '\tsubject line', 'From: a@b.com', '', 'body']),
    );

    expect(email.subject).toBe('A very long subject line');
  });

  it('prefers the plain part of a multipart/alternative', () => {
    const email = parseEmail(
      crlf([
        'From: alerts@rbc.com',
        'Content-Type: multipart/alternative; boundary="SEP"',
        '',
        'ignored preamble',
        '--SEP',
        'Content-Type: text/plain',
        '',
        'the plain one',
        '--SEP',
        'Content-Type: text/html',
        '',
        '<p>the html one</p>',
        '--SEP--',
      ]),
    );

    expect(email.text).toBe('the plain one');
  });

  it('falls back to converting the HTML part when there is no plain one', () => {
    const email = parseEmail(
      crlf([
        'From: alerts@rbc.com',
        'Content-Type: multipart/alternative; boundary=SEP',
        '',
        '--SEP',
        'Content-Type: text/html; charset=UTF-8',
        '',
        '<div>A debit of $12.34</div><div>was made</div>',
        '--SEP--',
      ]),
    );

    expect(email.text).toBe('A debit of $12.34\nwas made');
  });

  it('decodes a base64 body', () => {
    const email = parseEmail(
      crlf([
        'From: a@b.com',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from('Amount: $5.00').toString('base64'),
      ]),
    );

    expect(email.text).toBe('Amount: $5.00');
  });

  it('decodes quoted-printable, including soft breaks and multi-byte characters', () => {
    const email = parseEmail(
      crlf([
        'From: a@b.com',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        'Caf=C3=A9 total is $4=',
        '.50',
      ]),
    );

    expect(email.text).toBe('Café total is $4.50');
  });

  it('returns an empty body rather than throwing on a multipart with no boundary', () => {
    const email = parseEmail(crlf(['From: a@b.com', 'Content-Type: multipart/mixed', '', 'x']));

    expect(email.text).toBe('');
  });
});

describe('extractAddress', () => {
  it.each([
    ['"Amex" <Alerts@Amex.com>', 'alerts@amex.com'],
    ['alerts@rbc.com', 'alerts@rbc.com'],
    ['', ''],
  ])('reads %s', (input, expected) => {
    expect(extractAddress(input)).toBe(expected);
  });
});

describe('parameter', () => {
  it('reads quoted and bare values', () => {
    expect(parameter('multipart/alternative; boundary="a=b"', 'boundary')).toBe('a=b');
    expect(parameter('text/plain; charset=UTF-8', 'charset')).toBe('UTF-8');
    expect(parameter('text/plain', 'charset')).toBeUndefined();
  });
});

describe('decodeEncodedWords', () => {
  it('decodes base64 and quoted-printable words', () => {
    expect(decodeEncodedWords(`=?UTF-8?B?${Buffer.from('Café').toString('base64')}?=`)).toBe(
      'Café',
    );
    expect(decodeEncodedWords('=?UTF-8?Q?Your_caf=C3=A9_charge?=')).toBe('Your café charge');
  });

  it('leaves plain text alone', () => {
    expect(decodeEncodedWords('Transaction Approved')).toBe('Transaction Approved');
  });
});

describe('htmlToText', () => {
  it('drops scripts and styles entirely', () => {
    expect(htmlToText('<style>p{color:red}</style><p>Kept</p><script>evil()</script>')).toBe(
      'Kept',
    );
  });

  it('decodes entities', () => {
    expect(htmlToText('<p>A&nbsp;&amp;&nbsp;W &#36;5 &#x26; more</p>')).toBe('A & W $5 & more');
  });

  it('keeps a label and its value from running together', () => {
    expect(htmlToText('<td>Amount</td><td>$12.34</td>')).toBe('Amount\n$12.34');
  });
});

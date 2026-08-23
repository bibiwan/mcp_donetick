import { describe, it, expect } from 'vitest';
import { htmlToText, textToHtml, looksLikeHtml } from '../src/utils/html.js';

describe('description conversion', () => {
  describe('looksLikeHtml', () => {
    it('recognizes real tags', () => {
      expect(looksLikeHtml('<p>hello</p>')).toBe(true);
      expect(looksLikeHtml('a <br> b')).toBe(true);
      expect(looksLikeHtml('<img src="x">')).toBe(true);
    });

    it('does not mistake prose punctuation for markup', () => {
      expect(looksLikeHtml('plain text')).toBe(false);
      expect(looksLikeHtml('a < b and c > d')).toBe(false);
      expect(looksLikeHtml('I <3 cleaning')).toBe(false);
      expect(looksLikeHtml('température < 4°C')).toBe(false);
    });
  });

  describe('htmlToText', () => {
    it('unwraps the single paragraph DoneTick writes from its editor', () => {
      expect(htmlToText('<p>Vider bac collecteur, filtre, brosse. 3 min.</p>')).toBe(
        'Vider bac collecteur, filtre, brosse. 3 min.'
      );
    });

    it('leaves plain text alone', () => {
      expect(htmlToText('Tonte/desherbage selon saison. 45 min.')).toBe(
        'Tonte/desherbage selon saison. 45 min.'
      );
    });

    it('turns paragraphs into blank-line-separated blocks', () => {
      expect(htmlToText('<p>First</p><p>Second</p>')).toBe('First\n\nSecond');
    });

    it('turns line breaks into newlines', () => {
      expect(htmlToText('<p>One<br>Two</p>')).toBe('One\nTwo');
      expect(htmlToText('One<br />Two')).toBe('One\nTwo');
    });

    it('renders list items with a dash', () => {
      expect(htmlToText('<ul><li>Filtre</li><li>Joint</li></ul>')).toBe('- Filtre\n- Joint');
    });

    it('decodes named and numeric entities', () => {
      expect(htmlToText('<p>Caf&eacute;</p>'.replace('&eacute;', '&#233;'))).toBe('Café');
      expect(htmlToText('<p>a &amp; b</p>')).toBe('a & b');
      expect(htmlToText('<p>&lt;tag&gt;</p>')).toBe('<tag>');
      expect(htmlToText('<p>&#x2713; done</p>')).toBe('✓ done');
      expect(htmlToText('<p>nbsp&nbsp;here</p>')).toBe('nbsp here');
    });

    it('decodes entities in plain text too', () => {
      expect(htmlToText('a &amp; b')).toBe('a & b');
    });

    it('names images instead of dropping them silently', () => {
      expect(htmlToText('<p>Before<img src="x" alt="the filter">After</p>')).toBe(
        'Before[image: the filter]After'
      );
      expect(htmlToText('<p><img src="x"></p>')).toBe('[image]');
    });

    it('discards script and style content', () => {
      expect(htmlToText('<p>ok</p><script>alert(1)</script>')).toBe('ok');
      expect(htmlToText('<style>p{color:red}</style><p>ok</p>')).toBe('ok');
    });

    it('strips attributes and inline formatting', () => {
      expect(htmlToText('<p class="x"><strong>Bold</strong> and <em>italic</em></p>')).toBe(
        'Bold and italic'
      );
    });

    it('collapses the blank lines the substitutions leave behind', () => {
      expect(htmlToText('<div><p>A</p></div><div><p>B</p></div>')).toBe('A\n\nB');
    });

    it('handles empty and whitespace input', () => {
      expect(htmlToText('')).toBe('');
      expect(htmlToText('<p></p>')).toBe('');
    });
  });

  describe('textToHtml', () => {
    it('wraps a single block in a paragraph', () => {
      expect(textToHtml('Wipe the shelves')).toBe('<p>Wipe the shelves</p>');
    });

    it('makes blank-line-separated blocks separate paragraphs', () => {
      expect(textToHtml('First\n\nSecond')).toBe('<p>First</p><p>Second</p>');
    });

    it('keeps single newlines as line breaks, which is the point', () => {
      expect(textToHtml('One\nTwo')).toBe('<p>One<br>Two</p>');
    });

    it('normalizes CRLF', () => {
      expect(textToHtml('One\r\nTwo')).toBe('<p>One<br>Two</p>');
    });

    it('escapes characters that would otherwise become markup', () => {
      expect(textToHtml('a < b & c > d')).toBe('<p>a &lt; b &amp; c &gt; d</p>');
    });

    it('passes existing HTML through untouched, so echoing a read back is safe', () => {
      const html = '<p>Already <strong>rich</strong></p>';
      expect(textToHtml(html)).toBe(html);
    });

    it('drops empty blocks rather than emitting hollow paragraphs', () => {
      expect(textToHtml('A\n\n\n\nB')).toBe('<p>A</p><p>B</p>');
      expect(textToHtml('   ')).toBe('');
      expect(textToHtml('')).toBe('');
    });
  });

  describe('round-tripping', () => {
    it('preserves plain text through text -> html -> text', () => {
      for (const text of [
        'Wipe the shelves',
        'One\nTwo',
        'First\n\nSecond',
        'a < b & c',
        'Café ✓',
      ]) {
        expect(htmlToText(textToHtml(text))).toBe(text);
      }
    });

    it('preserves the text of DoneTick-authored HTML through html -> text -> html', () => {
      const stored = '<p>Aerer chambre, draps, oreillers, dresser. 2 min.</p>';
      const text = htmlToText(stored);
      expect(textToHtml(text)).toBe(stored);
    });
  });
});

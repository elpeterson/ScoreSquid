import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMeetListHtml, parseResultsHtml } from '../mso-scrape';
import { msoMeetIdFromUrl } from '../meet-match';

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

describe('parseMeetListHtml (women\'s athlete page)', () => {
  const meets = parseMeetListHtml(fixture('mso_myscores_wag.html'));

  it('finds each meet once, with its name', () => {
    expect(meets.map((m) => m.name)).toEqual([
      '2026 Sample Snowflake Classic',
      'Made-Up Penny Invitational 2025',
    ]);
  });

  it('gives links that carry the meet ID', () => {
    expect(meets.map((m) => m.href.split('#')[0])).toEqual([
      '/results/90001/5550001',
      '/results/90002/5550001',
    ]);
    expect(meets.map((m) => msoMeetIdFromUrl(m.href))).toEqual(['90001', '90002']);
  });

  it('keeps only the level, not the age group or the screen-reader label (SQ-049)', () => {
    expect(meets.map((m) => m.level)).toEqual(['6', 'XG']);
  });

  it('reads the level from the cell text when there is no level span', () => {
    const html =
      '<table><tr><td>Made Up Meet</td><td>Gym</td><td><a href="/results/1/2">4 Junior (opens meet scores)</a></td></tr></table>';
    expect(parseMeetListHtml(html)[0].level).toBe('4');
  });

  it('finds nothing on a page without results links', () => {
    expect(parseMeetListHtml('<html><body><p>No athlete</p></body></html>')).toEqual([]);
  });
});

describe('parseResultsHtml', () => {
  it('reads the four women\'s apparatus, places, AA place, title and dates', () => {
    expect(parseResultsHtml(fixture('mso_results_wag.html'))).toEqual({
      name: '2026 Sample Snowflake Classic',
      dateStr: 'Feb 13, 2026 - Feb 15, 2026',
      allAroundPlace: 4,
      scores: [
        { apparatus: 'vault', value: 8.95, place: 14 },
        { apparatus: 'uneven_bars', value: 8.875, place: 6 },
        { apparatus: 'balance_beam', value: 9, place: 2 },
        { apparatus: 'floor_exercise', value: 9.3, place: 5 },
      ],
    });
  });

  it('gives no scores for a meet page without an athlete', () => {
    const page = parseResultsHtml(
      '<h1 class="event-title">2026 Sample Snowflake Classic</h1><div id="MeetDetails"><h5><strong>Feb 13, 2026</strong></h5></div>',
    );
    expect(page.scores).toEqual([]);
    expect(page.allAroundPlace).toBeNull();
  });
});

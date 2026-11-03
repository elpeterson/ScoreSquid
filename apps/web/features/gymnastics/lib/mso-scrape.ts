// Parsing MSO's HTML pages: the fallback for men's, and the only path for women's.
// Server-only, as it loads cheerio. Pure: the caller fetches the page.

import * as cheerio from 'cheerio';
import { msoListLevel, parseScoreRow, type ParsedScore } from './mso-parser';

/** A meet from an athlete's `/Athlete.MyScores/<id>` page. */
export type ScrapedMeetLink = {
  /** The link as MSO gives it, e.g. `/results/123/456#...`. */
  href: string;
  name: string;
  level: string;
  dateStr: string;
};

/** The meets an athlete's MSO page links to, once each, in page order. */
export function parseMeetListHtml(html: string): ScrapedMeetLink[] {
  const $ = cheerio.load(html);
  const meets: ScrapedMeetLink[] = [];

  $('a[href^="/results/"]').each((_, el) => {
    const link = $(el);
    const href = link.attr('href');
    const row = link.closest('tr');
    if (row.length === 0) return;

    const cols = row.find('td');
    const name = $(cols[0]).text().trim() || link.text().trim();
    const levelCell = $(cols[2]);
    const cellText = levelCell.text().trim();
    const dateStr = (cols.length > 4 && $(cols[4]).text().trim()) || 'Date TBD';

    if (name === cellText && name.length < 5) return;
    if (name && href && !meets.some((m) => m.href === href)) {
      // MSO marks the level in its own span; the cell also holds the age group.
      const level = msoListLevel(levelCell.find('span.level').first().text()) ?? msoListLevel(cellText) ?? '';
      meets.push({ href, name, level, dateStr });
    }
  });

  return meets;
}

/** One athlete's result, from their `/results/<meet>/<athlete>` page. */
export type ScrapedResult = {
  /** Empty when the page has no title. */
  name: string;
  /** The meet's dates as written, e.g. `Feb 13, 2026 - Feb 15, 2026`; empty if absent. */
  dateStr: string;
  allAroundPlace: number | null;
  scores: ParsedScore[];
};

/**
 * Read the athlete's table from a results page. A page without an athlete (plain
 * `/results/<meet>`) has no such table, so it gives no scores.
 */
export function parseResultsHtml(html: string): ScrapedResult {
  const $ = cheerio.load(html);
  const scores: ParsedScore[] = [];
  let allAroundPlace: number | null = null;

  $('#athlete table tbody tr').each((_, row) => {
    const $row = $(row);
    const eventLabel = $row.find('th').text().trim();
    const scoreText = $row.find('span.score').text().trim();
    const placeText = $row.find('span.place').text().trim();

    if (eventLabel === 'AA') {
      const place = parseInt(placeText.replace('T', ''));
      if (!isNaN(place)) allAroundPlace = place;
    } else {
      const parsed = parseScoreRow(eventLabel, scoreText, placeText);
      if (parsed) scores.push(parsed);
    }
  });

  return {
    name: $('h1.event-title').text().trim(),
    dateStr: $('#MeetDetails h5 strong').first().text().trim(),
    allAroundPlace,
    scores,
  };
}

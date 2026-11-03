// A local stand-in for MeetScoresOnline's JSON API, serving the made-up unit-test
// fixtures. The app reaches it through E2E_MSO_ORIGIN; anything else gets a 404.
// GET /__requests reports how many requests it has had, for tests that check MSO
// was not called.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.resolve(here, '../../features/gymnastics/lib/__tests__/fixtures');
const read = (name) => JSON.parse(fs.readFileSync(path.join(fixtures, `${name}.json`), 'utf8'));
const port = Number(process.env.E2E_MSO_PORT ?? 4010);

const requests = [];

function respond(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

http
  .createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      if (req.method === 'GET' && req.url === '/__requests') return respond(res, 200, { count: requests.length, requests });
      const params = Object.fromEntries(new URLSearchParams(raw));
      requests.push({ path: req.url, query: params.query_name, gymnastid: params.p_gymnastid, meetid: params.p_meetid });

      if (req.url.startsWith('/Ajax.ProjectsJson.msoGymnast.aspx') && params.query_name === 'lookup_gymnast') {
        const body = read('lookup_gymnast');
        for (const row of body.results[0].result.row) row.gymnastid = params.p_gymnastid;
        return respond(res, 200, body);
      }
      if (req.url.startsWith('/Ajax.ProjectsJson.msoMeet.aspx') && params.query_name === 'lookup_scores2') {
        const body = read('lookup_scores2');
        for (const row of body.results[0].result.row) row.meetid = params.p_meetid;
        return respond(res, 200, body);
      }
      respond(res, 404, { error: 'not in the stand-in' });
    });
  })
  .listen(port, '127.0.0.1', () => console.log(`MSO stand-in on http://127.0.0.1:${port}`));

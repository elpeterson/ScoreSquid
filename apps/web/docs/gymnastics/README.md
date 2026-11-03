# ScoreSquid Gymnastics

> **"Never lose a score again."**

ScoreSquid Gymnastics is the gymnastics side of [ScoreSquid](https://github.com/elpeterson/ScoreSquid): a mobile-first home for a gymnast's meet scores. Setup instructions are in the repository's README.

## 🚀 Features
*   **Multi-Gymnast Support:** Track scores for multiple children (siblings) under one parent account.
*   **MAG & WAG Support:** Score entry, editing and Insights for both Men's and Women's artistic gymnastics. Women's levels are typed freely, so a typed level (e.g. "Gold") may not group with MSO's code for it ("XG") in Insights (see [SQ-042](sq-042/README.md)).
*   **MeetScoresOnline Integration:** Import a gymnast's full meet history from MeetScoresOnline using an MSO Athlete ID — capturing per-apparatus scores and all-around. Men's import uses MSO's JSON API and also captures each meet's level & division; women's reads MSO's results pages.
*   **Consistency Insights:** A per-apparatus line graph of a gymnast's scores across the season, filtered by level and division so non-comparable groups are never mixed (see [Insights](#-insights)).
*   **Structured Levels & Divisions (Men's):** Level and division are captured as structured fields mirroring the values used in competition — numeric levels 3–10 with Division 1/2, plus Elite/Junior/Senior tracks and elite codes. Women's keeps flexible free-text entry.
*   **Live Meet Entry:** Enter scores as they happen. Supports incomplete meets and future schedule planning.
*   **Detailed Scoring:** Track Final Score, Start Value, Placement, and All-Around placement.
*   **Deep Customization:** Toggle fields (like Start Value) to declutter the UI on small screens.
*   **Themeable:** Light and dark mode, saved to your account.
*   **Secure:** Row Level Security (RLS) ensures data privacy — each user sees only their own gymnasts.

## 📊 Insights
The **Consistency** view (linked from the dashboard) charts a gymnast's apparatus scores over a season:
- One colored line per apparatus, dates on the X axis and score on the Y axis, with a hover tooltip showing every event's score for a given date.
- A **Level** filter plus a context-aware **Division / Track** filter, so a Level 4 Division 1 season is never plotted against a Level 5 Division 2 season — those scores aren't comparable.
- Computed entirely from the gymnast's own stored scores; it uses no other users' data.

## 🚧 Coming Soon
-   **Offline Support:** PWA capabilities for gyms with poor signal.
-   **Additional Data Sources:** Manual import from scoring sources beyond MeetScoresOnline.
-   **Media Uploads:** Attach photos of scorecards or screenshots to meets.

## 📖 The Problem
For parents of competitive gymnasts, tracking progress is a nightmare of fragmentation.
- **The "Official" App:** MyUSAGym is unreliable, often crashes during meets, and has poor support for non-iOS devices.
- **The Fragmentation:** Meets are split across ScoreCat, MyMeetScoresOnline, and paper printouts.
- **The Data Loss:** There is no single, reliable "source of truth" for a gymnast's history over the years.

## 💡 The Solution
ScoreSquid Gymnastics is exactly what it sounds like: a permanent digital container for competition results. It doesn't care which scoring system the meet used. It places the power back in the parent's hands to own their child's data.

**Core Philosophy:**
1.  **Mobile First:** Built for the parent sitting in the bleachers.
2.  **Data Ownership:** You enter it, you keep it. Forever.
3.  **Simplicity:** No social feeds, no ads, just scores.

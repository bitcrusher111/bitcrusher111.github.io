# candidruetter.net

## Editing the website

The editor is not part of this repository. It lives in the private studio on
this computer (`~/Studio`, started with `~/Studio/studio.sh`, or in VS Code:
Terminal → Run Build Task). It opens

- the **studio** at http://localhost:4001
- a **preview** of the website at http://localhost:4000

Change things there, press **Save** (⌘S), check the preview, then
**commit and push** this repository — GitHub publishes the site a minute or two later.
Push once when you're done, not in the middle of bigger changes.

## Where things are

| What | File(s) | Editor section |
|---|---|---|
| Project pages (solo works, theater, ongoing projects, other) | `_projects/*.html` | Projects |
| Categories on the portfolio (start) page | `_data/portfolio.json` | Projects → Portfolio categories |
| Hidden portfolio `/selected-works/` | `_data/selected_works.json` | Selected works |
| Freelancing page | `_data/freelancing.json` | Freelancing |
| Releases page | `_data/releases.json` | Releases |
| Dates page | `_data/dates.json` | Dates |
| About page | `_data/about.json` | About |
| Images | `assets/images/` (uploads are scaled down automatically) | — |
| Look of the site | `assets/css/styles.css`, `_layouts/`, `_includes/`, `pages/` | — |

Texts everywhere follow one rule: an empty line starts a new paragraph,
a single line break stays a line break. Simple HTML (links) works.

Deleted projects are moved to `~/Studio/archive/website/`, never thrown away.

## One-time setup (new computer)

    rbenv install 3.2.9
    gem install bundler -v 4.0.3
    bundle install

Troubleshooting: `./bin/refresh.sh` restarts the preview from scratch.

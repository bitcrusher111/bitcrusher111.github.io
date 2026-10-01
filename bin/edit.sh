#!/bin/zsh
# Starts everything for editing the website:
#   preview of the site   http://localhost:4000
#   site editor           http://localhost:4001  (opens in the browser)
# Stop with Ctrl+C.
cd "$(dirname "$0")/.."
eval "$(rbenv init - zsh)"
rbenv shell 3.2.9

# (re)start the preview so it always runs with the current settings
lsof -ti tcp:4000 | xargs kill 2>/dev/null
lsof -ti tcp:35729 | xargs kill 2>/dev/null
bundle exec jekyll serve --livereload > /tmp/jekyll-preview.log 2>&1 &
JEKYLL=$!
trap "kill $JEKYLL 2>/dev/null" EXIT

# stop an editor that is still running, then start the editor
lsof -ti tcp:4001 | xargs kill 2>/dev/null
sleep 1
ruby tools/editor/server.rb --open

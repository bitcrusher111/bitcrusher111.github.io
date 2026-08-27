Local Jekyll preview — copy/paste commands

One-time setup (new machine)
----------------------------
# Install Ruby 3.2.9 and Bundler, then install deps
rbenv install 3.2.9
rbenv local 3.2.9
gem install bundler -v 4.0.3
bundle install

Daily workflow
--------------
# From the repo root, start the dev server with live reload
eval "$(rbenv init - zsh)"
rbenv shell 3.2.9
bundle exec jekyll serve --livereload

# Open in browser
# http://127.0.0.1:4000

Troubleshooting
---------------
# If bundler/ruby seems wrong (using system Ruby), re-init rbenv
eval "$(rbenv init - zsh)"
rbenv shell 3.2.9

# If you need a different port
bundle exec jekyll serve --livereload --port 4001

# If you suspect stale cache
bundle exec jekyll clean && bundle exec jekyll serve --livereload

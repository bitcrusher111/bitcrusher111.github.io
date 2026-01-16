#!/bin/zsh
# Kill any running Jekyll server
lsof -ti:4000 | xargs kill -9 2>/dev/null

# Initialize rbenv
eval "$(rbenv init - zsh)"
rbenv shell 3.2.9

# Clean and rebuild
bundle exec jekyll clean
bundle exec jekyll serve --livereload

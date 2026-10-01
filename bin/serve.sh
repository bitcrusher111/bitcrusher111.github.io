#!/bin/zsh
cd "$(dirname "$0")/.."
eval "$(rbenv init - zsh)"
rbenv shell 3.2.9
bundle exec jekyll serve --livereload

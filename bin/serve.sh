#!/bin/zsh
eval "$(rbenv init - zsh)"
rbenv shell 3.2.9
bundle exec jekyll serve --livereload

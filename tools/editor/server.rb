# Local editor for the whole website.
#   start:  bin/edit.sh   (or: ruby tools/editor/server.rb)
#   open:   http://localhost:4001
#
# It only edits files in this repository:
#   _data/*.json      selected works, freelancing, dates, releases, about, portfolio categories
#   _projects/*.html  one file per project (front matter + plain text)
#   assets/images/    uploaded images (resized automatically)
# Nothing is published until you commit and push.

require "webrick"
require "json"
require "yaml"
require "date"
require "digest"
require "fileutils"
require "net/http"
require "uri"
require "cgi"

PORT = Integer(ENV.fetch("PORT", 4001))
ROOT = File.expand_path("../..", __dir__)
UI_DIR = File.join(__dir__, "ui")
ARCHIVE = File.expand_path("../website-archive", ROOT) # deleted things go here, never really deleted
DATA_FILES = %w[selected_works freelancing dates releases about portfolio].freeze
PROJECT_KEYS = %w[title category date image permalink videos audio credits gallery photo_credits links].freeze
IMAGE_EXT = %w[.jpg .jpeg .png .webp .gif .avif].freeze
MIME = { ".html" => "text/html", ".js" => "text/javascript", ".css" => "text/css", ".json" => "application/json",
         ".jpg" => "image/jpeg", ".jpeg" => "image/jpeg", ".png" => "image/png", ".webp" => "image/webp",
         ".gif" => "image/gif", ".avif" => "image/avif", ".svg" => "image/svg+xml" }.freeze

StaticFile = Struct.new(:content, :mime)

class ApiError < StandardError
  attr_reader :status
  def initialize(status, message) = (@status = status; super(message))
end

# ---------- helpers ----------

def version_of(path) = File.exist?(path) ? Digest::SHA1.file(path).hexdigest : nil

def write_atomic(path, content)
  tmp = "#{path}.tmp"
  File.write(tmp, content)
  File.rename(tmp, path)
end

def check_version!(path, body)
  return if body["force"] || body["version"] == version_of(path)
  raise ApiError.new(409, "conflict")
end

def slugify(text)
  s = text.to_s.dup.force_encoding("UTF-8").scrub.downcase.unicode_normalize(:nfkd).gsub(/[^\x00-\x7F]/, "")
  s = s.gsub(/\(\d{4}\)/, "").gsub(/[^a-z0-9]+/, "-").gsub(/^-|-$/, "")
  s.empty? ? "untitled" : s
end

def clean_text(text)
  text.to_s.gsub("\r\n", "\n").gsub(/[ \t]+\n/, "\n").gsub(/\n{3,}/, "\n\n").strip
end

def archive(path)
  dest = File.join(ARCHIVE, path.delete_prefix("#{ROOT}/"))
  FileUtils.mkdir_p(File.dirname(dest))
  dest = dest.sub(/(\.\w+)?\z/) { "-#{Time.now.strftime('%Y%m%d-%H%M%S')}#{$1}" } if File.exist?(dest)
  FileUtils.mv(path, dest)
end

# ---------- data files ----------

def data_path(name)
  raise ApiError.new(404, "unknown data file") unless DATA_FILES.include?(name)
  File.join(ROOT, "_data", "#{name}.json")
end

# ---------- projects ----------

def project_path(id)
  raise ApiError.new(400, "bad id") unless id.match?(/\A[a-z0-9][a-z0-9_-]*\z/)
  File.join(ROOT, "_projects", "#{id}.html")
end

def read_project(path)
  raw = File.read(path)
  m = raw.match(/\A---\s*\n(.*?)\n---\s*\n?(.*)\z/m) or raise ApiError.new(500, "#{File.basename(path)} has no front matter")
  fm = YAML.safe_load(m[1], permitted_classes: [Date]) || {}
  fm["date"] = fm["date"].to_s if fm["date"]
  fm.merge("text" => m[2].to_s.strip)
end

def write_project(path, project, existing = {})
  fm = {}
  PROJECT_KEYS.each do |key|
    value = project[key]
    value = value.reject { |v| v.nil? || v == "" || (v.is_a?(Hash) && v.values.all? { |x| x.to_s.strip.empty? }) } if value.is_a?(Array)
    next if value.nil? || value == "" || value == []
    fm[key] = key == "date" ? Date.parse(value.to_s) : value
  end
  existing.each { |k, v| fm[k] = v unless PROJECT_KEYS.include?(k) || k == "text" } # keep anything we don't edit
  yaml = YAML.dump(fm, line_width: -1).delete_prefix("---\n")
  write_atomic(path, "---\n#{yaml}---\n#{clean_text(project['text'])}\n")
end

def list_projects
  Dir.glob(File.join(ROOT, "_projects", "*.html")).map do |path|
    p = read_project(path)
    { "id" => File.basename(path, ".html"), "title" => p["title"], "category" => p["category"],
      "date" => p["date"], "image" => p["image"], "permalink" => p["permalink"] }
  end
end

# ---------- uploads ----------

def save_upload(folder, name, bytes, max_width)
  folder = folder.to_s.gsub(/[^a-z0-9_\/-]/i, "").gsub(%r{\.\.|^/+}, "")
  raise ApiError.new(400, "missing folder") if folder.empty?
  ext = File.extname(name.to_s).downcase
  raise ApiError.new(400, "only images (jpg, png, webp, gif, avif)") unless IMAGE_EXT.include?(ext)
  base = slugify(File.basename(name.to_s, ".*"))
  dir = File.join(ROOT, "assets", "images", folder)
  FileUtils.mkdir_p(dir)
  file, n = "#{base}#{ext}", 2
  while File.exist?(File.join(dir, file))
    file = "#{base}-#{n}#{ext}"
    n += 1
  end
  path = File.join(dir, file)
  File.binwrite(path, bytes)
  shrink(path, max_width)
  "/assets/images/#{folder}/#{File.basename(path)}"
end

# big photos are scaled down with macOS `sips`; jpg quality 82
def shrink(path, max_width)
  return unless max_width && max_width > 0 && system("which sips > /dev/null 2>&1")
  width = `sips -g pixelWidth "#{path}" 2>/dev/null`[/pixelWidth: (\d+)/, 1].to_i
  return if width <= max_width
  opts = %w[.jpg .jpeg].include?(File.extname(path).downcase) ? ["-s", "formatOptions", "82"] : []
  system("sips", "--resampleWidth", max_width.to_s, *opts, path, out: File::NULL, err: File::NULL)
end

# ---------- link info (title + cover for releases) ----------

def fetch(url, limit = 4)
  raise ApiError.new(400, "too many redirects") if limit.zero?
  uri = URI(url)
  raise ApiError.new(400, "only http(s) links") unless %w[http https].include?(uri.scheme)
  res = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", open_timeout: 8, read_timeout: 8) do |http|
    http.get(uri.request_uri, "User-Agent" => "Mozilla/5.0 (Macintosh) site-editor", "Accept-Language" => "en")
  end
  return fetch(URI.join(url, res["location"]).to_s, limit - 1) if res.is_a?(Net::HTTPRedirection)
  res
end

def link_info(url)
  html = fetch(url).body.to_s.force_encoding("UTF-8").scrub
  meta = ->(prop) { html[/<meta[^>]+(?:property|name)=["']#{prop}["'][^>]*content=["']([^"']*)["']/i, 1] || html[/<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']#{prop}["']/i, 1] }
  title = CGI.unescapeHTML(meta.("og:title").to_s)
  { "title" => title, "image" => CGI.unescapeHTML(meta.("og:image").to_s) }
end

def download_image(url, folder, name, max_width)
  res = fetch(url)
  raise ApiError.new(400, "could not download image") unless res.is_a?(Net::HTTPSuccess)
  ext = { "image/png" => ".png", "image/webp" => ".webp", "image/gif" => ".gif" }.fetch(res["content-type"].to_s[/^[\w\/]+/], ".jpg")
  save_upload(folder, "#{name}#{ext}", res.body, max_width)
end

# ---------- http ----------

class Editor < WEBrick::HTTPServlet::AbstractServlet
  def service(req, res)
    res["Cache-Control"] = "no-store"
    body = req.body && req["Content-Type"].to_s.include?("json") ? JSON.parse(req.body) : {}
    result = route(req, body)
    if result.is_a?(StaticFile)
      res.body, res["Content-Type"] = result.content, result.mime
    else
      res["Content-Type"] = "application/json; charset=utf-8"
      res.body = JSON.generate(result)
    end
  rescue ApiError => e
    res.status = e.status
    res["Content-Type"] = "application/json"
    res.body = JSON.generate(error: e.message)
  rescue JSON::ParserError, ArgumentError, Psych::Exception => e
    res.status = 400
    res["Content-Type"] = "application/json"
    res.body = JSON.generate(error: e.message)
  rescue StandardError => e
    warn e.full_message
    res.status = 500
    res["Content-Type"] = "application/json"
    res.body = JSON.generate(error: e.message)
  end

  def route(req, body)
    m, path = req.request_method, req.path
    q = WEBrick::HTTPUtils.parse_query(req.query_string.to_s) # also for POST (WEBrick ignores it there)
    data_name = path[%r{\A/api/data/(\w+)\z}, 1]
    project_id = path[%r{\A/api/projects/([\w-]+)\z}, 1]

    if m == "GET" && ["/", "/index.html"].include?(path)
      static(File.join(UI_DIR, "index.html"))
    elsif m == "GET" && path.match?(%r{\A/ui/[\w.-]+\z})
      static(File.join(UI_DIR, File.basename(path)))
    elsif m == "GET" && path.start_with?("/assets/")
      static(File.join(ROOT, CGI.unescape(path)), within: File.join(ROOT, "assets"))

    elsif data_name && m == "GET"
      file = data_path(data_name)
      { version: version_of(file), data: JSON.parse(File.read(file)) }
    elsif data_name && m == "PUT"
      file = data_path(data_name)
      check_version!(file, body)
      raise ApiError.new(400, "missing data") unless body["data"].is_a?(Hash)
      write_atomic(file, JSON.pretty_generate(body["data"]) + "\n")
      { version: version_of(file) }

    elsif path == "/api/projects" && m == "GET"
      list_projects
    elsif path == "/api/projects" && m == "POST"
      id = slugify(body["title"])
      id = "#{id}-#{rand(100..999)}" while File.exist?(project_path(id))
      category = body["category"].to_s
      write_project(project_path(id), { "title" => body["title"], "category" => category, "date" => Date.today.to_s,
                                        "permalink" => "/#{category}/#{id}/", "text" => "More documentation coming soon." })
      { id: id }
    elsif project_id && m == "GET"
      file = existing_project(project_id)
      { version: version_of(file), project: read_project(file) }
    elsif project_id && m == "PUT"
      file = existing_project(project_id)
      check_version!(file, body)
      write_project(file, body["project"] || {}, read_project(file))
      { version: version_of(file) }
    elsif project_id && m == "DELETE"
      archive(existing_project(project_id))
      { ok: true }

    elsif path == "/api/upload" && m == "POST"
      { url: save_upload(q["folder"], q["name"], req.body.to_s, q["max"].to_i) }
    elsif path == "/api/link-info" && m == "GET"
      link_info(q["url"].to_s)
    elsif path == "/api/download-image" && m == "POST"
      { url: download_image(body["url"].to_s, body["folder"], body["name"].to_s, body["max"].to_i) }
    else
      raise ApiError.new(404, "not found")
    end
  end

  def existing_project(id)
    file = project_path(id)
    raise ApiError.new(404, "project not found") unless File.exist?(file)
    file
  end

  def static(file, within: UI_DIR)
    file = File.expand_path(file)
    raise ApiError.new(404, "not found") unless file.start_with?(within) && File.file?(file)
    StaticFile.new(File.binread(file), MIME.fetch(File.extname(file).downcase, "application/octet-stream"))
  end
end

server = WEBrick::HTTPServer.new(BindAddress: "127.0.0.1", Port: PORT, Logger: WEBrick::Log.new(File::NULL), AccessLog: [])
server.mount("/", Editor)
trap("INT") { server.shutdown }
trap("TERM") { server.shutdown }
puts "Site editor running at http://localhost:#{PORT}  (Ctrl+C to stop)"
system("open", "http://localhost:#{PORT}") if ARGV.include?("--open")
server.start

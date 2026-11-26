# Listener statistics: a database on the shared ungap-live-db instance and a
# Serverless Function in this site's project. See stats/ for the code.

variable "stats_database_instance_id" {
  type        = string
  description = "Shared PostgreSQL instance (ungap-live-db), without region prefix."
  default     = "56a5d49a-7901-44ec-ba11-8eb9c798846f"
}

variable "stats_hostname" {
  type    = string
  default = "stats.the-energy-hour.com"
}

# Scaleway checks the CNAME when the domain is bound. The Route 53 record
# stats -> stats_function_domain exists, so this is on.
variable "bind_stats_domain" {
  type    = bool
  default = true
}

data "scaleway_rdb_instance" "live" {
  instance_id = var.stats_database_instance_id
  region      = var.region
}

resource "scaleway_rdb_database" "stats" {
  instance_id = data.scaleway_rdb_instance.live.id
  name        = "energy_hour"
  lifecycle { prevent_destroy = true }
}

# Owner: runs migrations only. Its password never leaves the OpenTofu state.
resource "random_password" "stats_owner" {
  length           = 40
  special          = true
  override_special = "!"
  min_special      = 1
  min_numeric      = 1
  min_upper        = 1
  min_lower        = 1
}

resource "scaleway_rdb_user" "stats_owner" {
  instance_id = data.scaleway_rdb_instance.live.id
  name        = "energy_hour_owner"
  password    = random_password.stats_owner.result
  is_admin    = false
}

resource "scaleway_rdb_privilege" "stats_owner" {
  instance_id   = data.scaleway_rdb_instance.live.id
  user_name     = scaleway_rdb_user.stats_owner.name
  database_name = scaleway_rdb_database.stats.name
  permission    = "all"
}

# The function's role: readonly here (connect), and the migration grants
# SELECT, INSERT and UPDATE on energy_hour.listening_daily only.
resource "random_password" "stats_app" {
  length           = 40
  special          = true
  override_special = "!"
  min_special      = 1
  min_numeric      = 1
  min_upper        = 1
  min_lower        = 1
}

resource "scaleway_rdb_user" "stats_app" {
  instance_id = data.scaleway_rdb_instance.live.id
  name        = "energy_hour_app"
  password    = random_password.stats_app.result
  is_admin    = false
}

resource "scaleway_rdb_privilege" "stats_app" {
  instance_id   = data.scaleway_rdb_instance.live.id
  user_name     = scaleway_rdb_user.stats_app.name
  database_name = scaleway_rdb_database.stats.name
  permission    = "readonly"
  # Scaleway reports "custom" once the migration has added its table grants;
  # resetting it to readonly could drop them.
  lifecycle { ignore_changes = [permission] }
}

resource "scaleway_function_namespace" "stats" {
  name        = "the-energy-hour-stats"
  description = "Anonymous listener statistics for the-energy-hour."
  project_id  = scaleway_account_project.site.id
  region      = var.region
}

resource "scaleway_function" "stats" {
  name         = "stats"
  namespace_id = scaleway_function_namespace.stats.id
  runtime      = "node24"
  handler      = "src/handler.handle"
  privacy      = "public"
  http_option  = "redirected"
  min_scale    = 0
  # Caps cost and the number of database connections (one per instance).
  max_scale    = 3
  memory_limit = 256
  timeout      = 10

  environment_variables = {
    STATS_ALLOWED_ORIGINS = "https://the-energy-hour.com,https://www.the-energy-hour.com"
    STATS_PLAYLIST_URL    = "https://the-energy-hour.com/playlist.json"
  }
  secret_environment_variables = {
    STATS_DATABASE_URL = "postgresql://${scaleway_rdb_user.stats_app.name}:${urlencode(random_password.stats_app.result)}@${data.scaleway_rdb_instance.live.endpoint_ip}:${data.scaleway_rdb_instance.live.endpoint_port}/${scaleway_rdb_database.stats.name}"
    STATS_DATABASE_CA  = data.scaleway_rdb_instance.live.certificate
  }

  depends_on = [scaleway_rdb_privilege.stats_app]

  # The code is uploaded and deployed by .github/workflows/deploy.yml; OpenTofu
  # owns the settings and secrets only.
  lifecycle { ignore_changes = [zip_file, zip_hash, deploy] }
}

resource "scaleway_function_domain" "stats" {
  count       = var.bind_stats_domain ? 1 : 0
  function_id = scaleway_function.stats.id
  hostname    = var.stats_hostname
}

output "stats_function_domain" {
  description = "Target for the stats CNAME in Route 53."
  value       = scaleway_function.stats.domain_name
}

output "stats_owner_database_url" {
  description = "For running stats/migrations as the owner."
  value       = "postgresql://${scaleway_rdb_user.stats_owner.name}:${urlencode(random_password.stats_owner.result)}@${data.scaleway_rdb_instance.live.endpoint_ip}:${data.scaleway_rdb_instance.live.endpoint_port}/${scaleway_rdb_database.stats.name}?sslmode=verify-full"
  sensitive   = true
}

output "stats_database_ca" {
  value = data.scaleway_rdb_instance.live.certificate
}

# Self-hosted audio for the site's own player.
# Served from media.the-energy-hour.com through its own Edge Services pipeline.
# Uploads are manual (scripts/upload-audio.py); the GitHub deployer has no access.

variable "media_bucket_name" {
  type    = string
  default = "the-energy-hour-media"
}

variable "media_domain" {
  type    = string
  default = "media.the-energy-hour.com"
}

resource "scaleway_object_bucket" "media" {
  name          = var.media_bucket_name
  project_id    = scaleway_account_project.site.id
  region        = var.region
  force_destroy = false

  versioning {
    enabled = false
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "scaleway_object_bucket_acl" "media" {
  bucket     = scaleway_object_bucket.media.id
  project_id = scaleway_account_project.site.id
  acl        = "private"
}

resource "scaleway_object_bucket_policy" "media" {
  bucket     = scaleway_object_bucket.media.id
  project_id = scaleway_account_project.site.id

  policy = jsonencode({
    Id      = "the-energy-hour-media-public-objects"
    Version = "2023-04-17"
    Statement = [
      {
        Sid = "AllowExistingOwner"
        Principal = {
          SCW = "user_id:81771095-0368-4a5f-9482-8e446e12fcb7"
        }
        Action   = ["s3:*"]
        Effect   = "Allow"
        Resource = [var.media_bucket_name, "${var.media_bucket_name}/*"]
      },
      {
        Sid = "AllowExistingCliApplication"
        Principal = {
          SCW = "application_id:d3ac0ade-b166-4bda-a00e-e30872c98635"
        }
        Action   = ["s3:*"]
        Effect   = "Allow"
        Resource = [var.media_bucket_name, "${var.media_bucket_name}/*"]
      },
      {
        Sid       = "AllowPublicObjectRead"
        Principal = "*"
        Action    = ["s3:GetObject"]
        Effect    = "Allow"
        Resource  = ["${var.media_bucket_name}/*"]
      }
    ]
  })

  depends_on = [scaleway_object_bucket_acl.media]
}

resource "scaleway_edge_services_pipeline" "media" {
  name        = "the-energy-hour-media"
  description = "Audio files for the-energy-hour (media subdomain)."
  project_id  = scaleway_account_project.site.id
}

resource "scaleway_edge_services_backend_stage" "media" {
  pipeline_id = scaleway_edge_services_pipeline.media.id
  project_id  = scaleway_account_project.site.id

  s3_backend_config {
    bucket_name   = scaleway_object_bucket.media.name
    bucket_region = var.region
    is_website    = false
  }
}

resource "scaleway_edge_services_route_stage" "media" {
  pipeline_id = scaleway_edge_services_pipeline.media.id
  project_id  = scaleway_account_project.site.id

  rule {
    backend_stage_id = scaleway_edge_services_backend_stage.media.id

    rule_http_match {
      method_filters = ["get", "head"]

      path_filter {
        path_filter_type = "regex"
        value            = ".*"
      }
    }
  }
}

# Object names carry a content hash and are never overwritten, so a long
# fallback TTL is safe. Objects also send Cache-Control: immutable.
resource "scaleway_edge_services_cache_stage" "media" {
  pipeline_id    = scaleway_edge_services_pipeline.media.id
  route_stage_id = scaleway_edge_services_route_stage.media.id
  project_id     = scaleway_account_project.site.id
  refresh_cache  = "initial"
  fallback_ttl   = 86400
}

resource "scaleway_edge_services_tls_stage" "media" {
  pipeline_id         = scaleway_edge_services_pipeline.media.id
  cache_stage_id      = scaleway_edge_services_cache_stage.media.id
  project_id          = scaleway_account_project.site.id
  managed_certificate = true
}

resource "scaleway_edge_services_dns_stage" "media" {
  pipeline_id  = scaleway_edge_services_pipeline.media.id
  tls_stage_id = scaleway_edge_services_tls_stage.media.id
  project_id   = scaleway_account_project.site.id
  fqdns        = [var.media_domain]
}

resource "scaleway_edge_services_head_stage" "media" {
  pipeline_id   = scaleway_edge_services_pipeline.media.id
  head_stage_id = scaleway_edge_services_dns_stage.media.id
}

output "media_bucket_name" {
  value = scaleway_object_bucket.media.name
}

output "media_edge_pipeline_id" {
  value = scaleway_edge_services_pipeline.media.id
}

output "media_edge_default_fqdn" {
  description = "CNAME target for var.media_domain in Route 53."
  value       = scaleway_edge_services_dns_stage.media.default_fqdn
}

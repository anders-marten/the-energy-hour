resource "scaleway_edge_services_pipeline" "site" {
  name        = "the-energy-hour-production"
  description = "Production Edge Services pipeline for the-energy-hour."
  project_id  = scaleway_account_project.site.id
}

resource "scaleway_edge_services_backend_stage" "site" {
  pipeline_id = scaleway_edge_services_pipeline.site.id
  project_id  = scaleway_account_project.site.id

  s3_backend_config {
    bucket_name   = scaleway_object_bucket.site.name
    bucket_region = var.region
    is_website    = true
  }
}

resource "scaleway_edge_services_route_stage" "site" {
  pipeline_id = scaleway_edge_services_pipeline.site.id
  project_id  = scaleway_account_project.site.id

  rule {
    backend_stage_id = scaleway_edge_services_backend_stage.site.id

    rule_http_match {
      method_filters = ["get", "head"]

      path_filter {
        path_filter_type = "regex"
        value            = ".*"
      }
    }
  }
}

resource "scaleway_edge_services_cache_stage" "site" {
  pipeline_id    = scaleway_edge_services_pipeline.site.id
  route_stage_id = scaleway_edge_services_route_stage.site.id
  project_id     = scaleway_account_project.site.id
  refresh_cache  = "initial"
  fallback_ttl   = 300
}

resource "scaleway_edge_services_tls_stage" "site" {
  pipeline_id         = scaleway_edge_services_pipeline.site.id
  cache_stage_id      = scaleway_edge_services_cache_stage.site.id
  project_id          = scaleway_account_project.site.id
  managed_certificate = true
}

resource "scaleway_edge_services_dns_stage" "site" {
  pipeline_id  = scaleway_edge_services_pipeline.site.id
  tls_stage_id = scaleway_edge_services_tls_stage.site.id
  project_id   = scaleway_account_project.site.id
}

resource "scaleway_edge_services_head_stage" "site" {
  pipeline_id   = scaleway_edge_services_pipeline.site.id
  head_stage_id = scaleway_edge_services_dns_stage.site.id
}

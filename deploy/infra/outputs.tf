output "project_id" {
  value = scaleway_account_project.site.id
}

output "bucket_name" {
  value = scaleway_object_bucket.site.name
}

output "deploy_access_key" {
  value     = scaleway_iam_api_key.deployer.access_key
  sensitive = true
}

output "deploy_secret_key" {
  value     = scaleway_iam_api_key.deployer.secret_key
  sensitive = true
}

output "edge_pipeline_id" {
  value = scaleway_edge_services_pipeline.site.id
}

output "edge_default_fqdn" {
  value = scaleway_edge_services_dns_stage.site.default_fqdn
}

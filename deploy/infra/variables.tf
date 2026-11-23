variable "region" {
  type    = string
  default = "fr-par"
}

variable "organization_id" {
  type = string
}

variable "provider_project_id" {
  type        = string
  description = "Existing project used by the provider until the separate project resource is created."
}

variable "bucket_name" {
  type = string
}

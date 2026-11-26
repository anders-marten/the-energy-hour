resource "scaleway_account_project" "site" {
  name        = "ungap-the-energy-hour"
  description = "Separat produktionprojekt for the-energy-hour."
}

resource "scaleway_object_bucket" "site" {
  name          = var.bucket_name
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

resource "scaleway_object_bucket_acl" "site" {
  bucket     = scaleway_object_bucket.site.id
  project_id = scaleway_account_project.site.id
  acl        = "private"
}

resource "scaleway_object_bucket_policy" "site" {
  bucket     = scaleway_object_bucket.site.id
  project_id = scaleway_account_project.site.id

  policy = jsonencode({
    Id      = "the-energy-hour-public-objects"
    Version = "2023-04-17"
    Statement = [
      {
        Sid = "AllowDeployApplication"
        Principal = {
          SCW = "application_id:${scaleway_iam_application.deployer.id}"
        }
        Action   = ["s3:*"]
        Effect   = "Allow"
        Resource = [var.bucket_name, "${var.bucket_name}/*"]
      },
      {
        Sid = "AllowExistingOwner"
        Principal = {
          SCW = "user_id:81771095-0368-4a5f-9482-8e446e12fcb7"
        }
        Action   = ["s3:*"]
        Effect   = "Allow"
        Resource = [var.bucket_name, "${var.bucket_name}/*"]
      },
      {
        Sid = "AllowExistingCliApplication"
        Principal = {
          SCW = "application_id:d3ac0ade-b166-4bda-a00e-e30872c98635"
        }
        Action   = ["s3:*"]
        Effect   = "Allow"
        Resource = [var.bucket_name, "${var.bucket_name}/*"]
      },
      {
        Sid       = "AllowPublicObjectRead"
        Principal = "*"
        Action    = ["s3:GetObject"]
        Effect    = "Allow"
        Resource  = ["${var.bucket_name}/*"]
      }
    ]
  })

  depends_on = [scaleway_object_bucket_acl.site]
}

resource "scaleway_object_bucket_website_configuration" "site" {
  bucket     = scaleway_object_bucket.site.id
  project_id = scaleway_account_project.site.id
  region     = var.region

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

resource "scaleway_iam_application" "deployer" {
  name        = "the-energy-hour-deployer"
  description = "Begransad GitHub deployment-identitet for the-energy-hour."
}

resource "scaleway_iam_policy" "deployer" {
  name           = "the-energy-hour-deployer"
  application_id = scaleway_iam_application.deployer.id

  rule {
    project_ids = [scaleway_account_project.site.id]
    permission_set_names = [
      "ObjectStorageObjectsRead",
      "ObjectStorageObjectsWrite",
      "ObjectStorageObjectsDelete",
      "ObjectStorageBucketsRead",
      "EdgeServicesFullAccess",
      # Uploads and deploys the stats function's code (the only function in this project).
      "FunctionsFullAccess"
    ]
  }
}

resource "scaleway_iam_api_key" "deployer" {
  application_id     = scaleway_iam_application.deployer.id
  default_project_id = scaleway_account_project.site.id
  description        = "GitHub Actions deploy key for the-energy-hour."

  lifecycle {
    ignore_changes = [expires_at]
  }
}

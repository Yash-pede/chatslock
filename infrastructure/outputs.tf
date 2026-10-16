output "main_site_bucket" {
  description = "S3 bucket the built main-site is deployed to."
  value       = module.main_site.bucket_name
}

output "main_site_distribution_id" {
  description = "CloudFront distribution id for the main-site."
  value       = module.main_site.distribution_id
}

output "main_site_url" {
  description = "Public URL of the main-site."
  value       = "https://${var.domain_name}"
}

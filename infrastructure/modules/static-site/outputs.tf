output "bucket_name" {
  description = "S3 bucket the built site is deployed to."
  value       = local.site_name
}

output "distribution_id" {
  description = "CloudFront distribution id (used for cache invalidations)."
  value       = aws_cloudfront_distribution.site.id
}

output "cloudfront_domain_name" {
  description = "CloudFront domain, useful before DNS is live."
  value       = aws_cloudfront_distribution.site.domain_name
}

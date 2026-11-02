output "cache_security_group_id" {
  value = aws_security_group.cache.id
}

output "endpoint" {
  value = aws_elasticache_serverless_cache.valkey_cache.endpoint[0].address
}

output "port" {
  value = aws_elasticache_serverless_cache.valkey_cache.endpoint[0].port
}

resource "aws_elasticache_serverless_cache" "valkey_cache" {
  engine = "valkey"
  name   = "chat-cache"
  cache_usage_limits {
    data_storage {
      maximum = 10
      unit    = "GB"
    }
    ecpu_per_second {
      maximum = 5000
    }
  }
  # daily_snapshot_time      = "09:00"
  description              = "Prod Cache For chat"
  major_engine_version     = "9"
  snapshot_retention_limit = 1
  security_group_ids       = [aws_security_group.cache.id]
  subnet_ids               = var.private_subnet_ids
}

resource "aws_security_group" "cache" {
  name        = "chat-cache-sg"
  description = "Valkey access from API lambdas only"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "cache_from_api_lambdas" {
  security_group_id            = aws_security_group.cache.id
  referenced_security_group_id = var.api_lambda_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = aws_elasticache_serverless_cache.valkey_cache.endpoint[0].port
  to_port                      = aws_elasticache_serverless_cache.valkey_cache.endpoint[0].port
  description                  = "Valkey from API lambda SG only"
}

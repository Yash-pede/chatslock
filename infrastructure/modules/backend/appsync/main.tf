data "aws_acm_certificate" "issued_cert" {
  region   = "us-east-1"
  domain   = "wss.${var.domain_name}"
  statuses = ["ISSUED"]
}

data "aws_region" "current" {}

data "aws_route53_zone" "main" {
  name = var.domain_name
}

resource "aws_appsync_domain_name" "wssDomain" {
  domain_name     = "wss.${var.domain_name}"
  certificate_arn = data.aws_acm_certificate.issued_cert.arn
}

resource "aws_appsync_domain_name_api_association" "apidomain" {
  api_id      = aws_appsync_api.api.api_id
  domain_name = "wss.${var.domain_name}"
}

resource "aws_route53_record" "wss" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "wss.${var.domain_name}"
  type    = "CNAME"
  ttl     = 300
  records = [aws_appsync_domain_name.wssDomain.appsync_domain_name]
}


resource "aws_appsync_api" "api" {
  name = "api-event"

  event_config {
    auth_provider {
      auth_type = "AMAZON_COGNITO_USER_POOLS"
      cognito_config {
        user_pool_id = var.cognito_user_pool_id
        aws_region   = data.aws_region.current.region
      }
    }

    connection_auth_mode {
      auth_type = "AMAZON_COGNITO_USER_POOLS"
    }

    default_publish_auth_mode {
      auth_type = "AMAZON_COGNITO_USER_POOLS"
    }

    default_subscribe_auth_mode {
      auth_type = "AMAZON_COGNITO_USER_POOLS"
    }
  }
}

# Conversation
resource "aws_appsync_datasource" "realtimeLambda" {
  api_id           = aws_appsync_api.api.api_id
  name             = "realtimeLambda"
  type             = "AWS_LAMBDA"
  service_role_arn = aws_iam_role.appsync_role.arn

  lambda_config {
    function_arn = var.realtime_lambda_arn
  }
  depends_on = [
    aws_iam_role_policy.lambda_permission
  ]

}

resource "aws_appsync_channel_namespace" "conversation" {
  name   = "conversation"
  api_id = aws_appsync_api.api.api_id
  handler_configs {
    on_publish {
      behavior = "DIRECT"
      integration {
        data_source_name = aws_appsync_datasource.realtimeLambda.name
        lambda_config {
          invoke_type = "REQUEST_RESPONSE"
        }
      }
    }
    on_subscribe {
      behavior = "DIRECT"
      integration {
        data_source_name = aws_appsync_datasource.realtimeLambda.name
        lambda_config {
          invoke_type = "REQUEST_RESPONSE"
        }
      }
    }
  }
}

# User

resource "aws_appsync_channel_namespace" "user" {
  name   = "user"
  api_id = aws_appsync_api.api.api_id
  handler_configs {
    on_publish {
      behavior = "DIRECT"
      integration {
        data_source_name = aws_appsync_datasource.realtimeLambda.name
        lambda_config {
          invoke_type = "REQUEST_RESPONSE"
        }
      }
    }
    on_subscribe {
      behavior = "DIRECT"
      integration {
        data_source_name = aws_appsync_datasource.realtimeLambda.name
        lambda_config {
          invoke_type = "REQUEST_RESPONSE"
        }
      }
    }
  }
}

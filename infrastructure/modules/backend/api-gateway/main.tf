module "apigateway-v2" {
  source  = "terraform-aws-modules/apigateway-v2/aws"
  version = "6.1.1"

  name          = "prod-http"
  description   = "Gateway for backend lambda functions"
  protocol_type = "HTTP"

  cors_configuration = {
    allow_headers = ["content-type", "x-amz-date", "authorization", "x-api-key", "x-amz-security-token", "x-amz-user-agent"]
    allow_methods = ["*"]
    # TODO: only allow your main application
    allow_origins = ["*"]
  }
  # Custom domain
  domain_name      = "api.${var.domain_name}"
  hosted_zone_name = var.domain_name

  # Access logs
  stage_access_log_settings = {
    create_log_group            = true
    log_group_retention_in_days = 7
    format = jsonencode({
      context = {
        domainName              = "$context.domainName"
        integrationErrorMessage = "$context.integrationErrorMessage"
        protocol                = "$context.protocol"
        requestId               = "$context.requestId"
        requestTime             = "$context.requestTime"
        responseLength          = "$context.responseLength"
        routeKey                = "$context.routeKey"
        stage                   = "$context.stage"
        status                  = "$context.status"
        error = {
          message      = "$context.error.message"
          responseType = "$context.error.responseType"
        }
        identity = {
          sourceIP = "$context.identity.sourceIp"
        }
        integration = {
          error             = "$context.integration.error"
          integrationStatus = "$context.integration.integrationStatus"
        }
      }
    })
  }

  authorizers = {
    "main" = {
      name             = "api-auth"
      authorizer_type  = "JWT"
      identity_sources = ["$request.header.Authorization"]
      jwt_configuration = {
        audience = [var.cognito_user_client, var.cognito_admin_client]
        issuer   = var.cognito_issuer
      }
    }
  }

  routes = {

    "ANY /api/auth/{proxy+}" = {
      authorization_type = "NONE"
      integration = {
        uri                    = var.lambda_details.auth.arn
        payload_format_version = "2.0"
        timeout_milliseconds   = 12000
      }
    }


    "ANY /api/users/{proxy+}" = {
      authorization_type = "JWT"
      authorizer_key     = "main"
      integration = {
        uri                    = var.lambda_details.users.arn
        payload_format_version = "2.0"
        timeout_milliseconds   = 12000
      }
    }
  }

}


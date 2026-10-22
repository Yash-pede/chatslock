module "apigateway-v2" {
  source  = "terraform-aws-modules/apigateway-v2/aws"
  version = "6.1.1"

  name          = "prod-http"
  description   = "Gateway for backend lambda functions"
  protocol_type = "HTTP"

  # Access logging needs the account-level CloudWatch role to exist first.
  depends_on = [aws_api_gateway_account.this]

  cors_configuration = {
    allow_headers = ["content-type", "x-amz-date", "authorization", "x-amz-security-token", "x-amz-user-agent"]
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

    "ANY /api/conversations/{proxy+}" = {
      authorization_type = "JWT"
      authorizer_key     = "main"
      integration = {
        uri                    = var.lambda_details.conversations.arn
        payload_format_version = "2.0"
        timeout_milliseconds   = 12000
      }
    }
  }

}

# WS API

module "apigateway-v2-ws" {
  source  = "terraform-aws-modules/apigateway-v2/aws"
  version = "6.1.1"

  name        = "prod-ws"
  description = "Ws Api for messages, pressence, and other updates."

  protocol_type                = "WEBSOCKET"
  route_selection_expression   = "$request.body.action"
  # No API key is provisioned, so the default x-api-key lookup always fails
  # the handshake with INVALID_API_KEY. Keep the default; use a null one.
  api_key_selection_expression = "$request.header.x-api-key"

  # Websocket stage sets logging_level/data trace, which also requires it.
  depends_on = [aws_api_gateway_account.this]

  # Custom domain
  domain_name      = "ws.${var.domain_name}"
  hosted_zone_name = var.domain_name

  authorizers = {
    "main" = {
      name             = "ws-auth"
      authorizer_type  = "REQUEST"
      identity_sources = ["route.request.header.Authorization"]
      authorizer_uri   = var.ws_authorizer_lambda_invoke_arn
    }
  }

  routes = {
    "$connect" = {
      operation_name     = "ConnectRoute"
      authorization_type = "CUSTOM"
      authorizer_key     = "main"

      integration = {
        type = "AWS_PROXY"
        uri  = var.ws_events_lambda_invoke_arn
      }
    }
    "$disconnect" = {
      operation_name     = "DisconnectRoute"
      authorization_type = "NONE"

      integration = {
        type = "AWS_PROXY"
        uri  = var.ws_events_lambda_invoke_arn
      }
    },
    "sendmessage" = {
      operation_name     = "SendRoute"
      authorization_type = "NONE"

      integration = {
        type = "AWS_PROXY"
        uri  = var.ws_events_lambda_invoke_arn
      }
    },
  }


  stage_name = "prod"
  stage_default_route_settings = {
    data_trace_enabled       = true
    detailed_metrics_enabled = true
    logging_level            = "INFO"
    throttling_burst_limit   = 100
    throttling_rate_limit    = 100
  }

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

}

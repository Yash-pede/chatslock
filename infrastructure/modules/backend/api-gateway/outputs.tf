output "api_gateway_execution_arn" {
  value = module.apigateway-v2.api_execution_arn
}

output "ws_api_gateway_execution_arn" {
  value = module.apigateway-v2-ws.api_execution_arn
}

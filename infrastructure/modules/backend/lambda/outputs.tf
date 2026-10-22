output "auth_lambda_arn" {
  value = module.auth_lambda.lambda_function_arn
}

output "ws_authorizer_lambda_invoke_arn" {
  value = module.ws_authorizer_lambda.lambda_function_invoke_arn
}

output "ws_events_lambda_invoke_arn" {
  value = module.ws_events_lambda.lambda_function_invoke_arn
}


output "lambda_details" {
  value = local.api_lambdas
}

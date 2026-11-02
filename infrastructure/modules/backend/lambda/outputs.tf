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

output "api_lambda_security_group_id" {
  value = aws_security_group.api_lambda_sg.id
}

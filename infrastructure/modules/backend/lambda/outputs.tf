output "auth_lambda_arn" {
  value = module.auth_lambda.lambda_function_arn
}

output "realtime_lambda" {
  value = module.realtime_lambda.lambda_function_arn
}

output "lambda_details" {
  value = local.api_lambdas
}

output "api_lambda_security_group_id" {
  value = aws_security_group.api_lambda_sg.id
}

output "auth_lambda_arn" {
  value = module.auth_lambda.lambda_function_arn
}

output "lambda_details" {
  value = local.api_lambdas
}
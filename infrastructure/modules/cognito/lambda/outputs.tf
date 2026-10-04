output "define_auth_arn" {
  value = aws_lambda_function.define_auth.arn
}

output "create_auth_arn" {
  value = aws_lambda_function.create_auth.arn
}

output "verify_auth_arn" {
  value = aws_lambda_function.verify_auth.arn
}

output "lambda_sg_id" {
  value = aws_security_group.lambda_sg.id
}

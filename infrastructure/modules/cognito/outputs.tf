output "user_client" {
  value = aws_cognito_user_pool_client.users.id
}

output "admin_client" {
  value = aws_cognito_user_pool_client.admin.id
}

output "cognito_issuer" {
  value = "https://cognito-idp.ap-south-1.amazonaws.com/${aws_cognito_user_pool.chat_user_pool.id}/.well-known/jwks.json"
}
output "user_pool_id" {
  value = aws_cognito_user_pool.chat_user_pool.id
}

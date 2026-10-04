module "lambdas" {
  source               = "./lambda"
  user_pool_arn        = aws_cognito_user_pool.chat_user_pool.arn
  vpc_id               = var.vpc_id
  private_subnet_ids   = var.private_subnet_ids
  auth_lambda_env_name = var.auth_lambda_env_name
  auth_lambda_env_arn  = var.auth_lambda_env_arn
}

resource "aws_cognito_user_pool" "chat_user_pool" {
  name = var.resource_name

  alias_attributes = ["phone_number"]
  # auto_verified_attributes = ["phone_number"]

  username_configuration {
    case_sensitive = false
  }

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = true
  }

  lambda_config {
    define_auth_challenge          = module.lambdas.define_auth_arn
    create_auth_challenge          = module.lambdas.create_auth_arn
    verify_auth_challenge_response = module.lambdas.verify_auth_arn
  }
}


resource "aws_cognito_user_pool_client" "users" {
  name         = "users-client"
  user_pool_id = aws_cognito_user_pool.chat_user_pool.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_CUSTOM_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  access_token_validity  = 15
  id_token_validity      = 15
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}


resource "aws_cognito_user_pool_client" "admin" {
  name         = "admin-client"
  user_pool_id = aws_cognito_user_pool.chat_user_pool.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  access_token_validity  = 15
  id_token_validity      = 15
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}


resource "aws_cognito_user_group" "user" {
  name         = "user"
  user_pool_id = aws_cognito_user_pool.chat_user_pool.id
  description  = "Group for users."
}

resource "aws_cognito_user_group" "agent" {
  name         = "agent"
  user_pool_id = aws_cognito_user_pool.chat_user_pool.id
  description  = "Group for agents."
}

resource "aws_cognito_user_group" "moderator" {
  name         = "moderator"
  user_pool_id = aws_cognito_user_pool.chat_user_pool.id
  description  = "Group for moderators."
}

resource "aws_cognito_user_group" "admin" {
  name         = "admin"
  user_pool_id = aws_cognito_user_pool.chat_user_pool.id
  description  = "Group for admin."
}

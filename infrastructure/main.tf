data "aws_availability_zones" "available" {}

locals {
  name = var.resource_name

  vpc_cidr = "10.0.0.0/16"
  azs      = slice(data.aws_availability_zones.available.names, 0, 3)

  tags = {
    Name = local.name
  }
}

module "vpc" {
  source = "terraform-aws-modules/vpc/aws"

  name = local.name
  cidr = local.vpc_cidr
  azs  = local.azs

  public_subnets  = [for k, v in local.azs : cidrsubnet(local.vpc_cidr, 8, k)]     # /24
  private_subnets = [for k, v in local.azs : cidrsubnet(local.vpc_cidr, 8, k + 3)] # /24

  enable_nat_gateway = true
  single_nat_gateway = true

  tags = local.tags
}

module "cognito" {
  source = "./modules/cognito"

  resource_name           = local.name
  vpc_id                  = module.vpc.vpc_id
  private_subnet_ids      = module.vpc.private_subnets
  auth_lambda_secret_name = aws_secretsmanager_secret.auth_lambda_env.name
  auth_lambda_secret_arn  = aws_secretsmanager_secret.auth_lambda_env.arn
}

module "backend_api_gateway" {
  source = "./modules/backend/api-gateway"

  domain_name          = var.domain_name
  cognito_user_client  = module.cognito.user_client
  cognito_admin_client = module.cognito.admin_client
  cognito_issuer       = module.cognito.cognito_issuer
  lambda_details       = module.api_lambdas.lambda_details
}

module "api_lambdas" {
  source = "./modules/backend/lambda"

  api_gateway_execution_arn = module.backend_api_gateway.api_gateway_execution_arn
}

resource "aws_secretsmanager_secret" "auth_lambda_env" {
  name = "auth-lambdas/env"
}

resource "aws_secretsmanager_secret" "backend_lambda_env" {
  name = "api-lambdas/env"
}

resource "aws_secretsmanager_secret_version" "example" {
  secret_id = aws_secretsmanager_secret.backend_lambda_env.id
  secret_string = jsonencode({
    cognito_user_pool_id    = module.cognito.user_pool_id
    cognito_admin_client_id = module.cognito.admin_client
    cognito_user_client_id  = module.cognito.user_client
  })
}


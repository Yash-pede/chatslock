# layer for lambda
# Build it with: pnpm layer:push (see scripts/build-layer.sh)
resource "aws_lambda_layer_version" "lambda_layer" {
  layer_name          = "api_layer"
  filename            = "${path.root}/../layers/api/build.zip"
  source_code_hash    = filebase64sha256("${path.root}/../layers/api/build.zip")
  compatible_runtimes = ["nodejs24.x"]
}

# api lambdas

module "auth_lambda" {
  source = "terraform-aws-modules/lambda/aws"

  function_name = "auth"
  description   = "Lambda For granting auth tokens"
  handler       = "index.handler"
  runtime       = "nodejs24.x"
  create_role   = false
  timeout       = 10
  layers        = [aws_lambda_layer_version.lambda_layer.arn]
  lambda_role   = aws_iam_role.api_lambda_role.arn

  vpc_security_group_ids = [aws_security_group.api_lambda_sg.id]
  vpc_subnet_ids         = var.vpc_subnet_ids

  source_path = "${path.root}/../functions/auth/dist/index.mjs"
}

module "users_lambda" {
  source = "terraform-aws-modules/lambda/aws"

  function_name          = "users"
  description            = "Lambda For users Route."
  handler                = "index.handler"
  runtime                = "nodejs24.x"
  create_role            = false
  timeout                = 10
  layers                 = [aws_lambda_layer_version.lambda_layer.arn]
  lambda_role            = aws_iam_role.api_lambda_role.arn
  vpc_security_group_ids = [aws_security_group.api_lambda_sg.id]
  vpc_subnet_ids         = var.vpc_subnet_ids

  source_path = "${path.root}/../functions/users/dist/index.mjs"
}

module "conversations_lambda" {
  source = "terraform-aws-modules/lambda/aws"

  function_name          = "conversations"
  description            = "Lambda For conversations Route."
  handler                = "index.handler"
  runtime                = "nodejs24.x"
  create_role            = false
  timeout                = 10
  layers                 = [aws_lambda_layer_version.lambda_layer.arn]
  lambda_role            = aws_iam_role.api_lambda_role.arn
  vpc_security_group_ids = [aws_security_group.api_lambda_sg.id]
  vpc_subnet_ids         = var.vpc_subnet_ids

  source_path = "${path.root}/../functions/conversations/dist/index.mjs"
}

module "ws_authorizer_lambda" {
  source = "terraform-aws-modules/lambda/aws"

  function_name  = "wsAuthorizer"
  handler        = "index.handler"
  runtime        = "nodejs24.x"
  create_role    = false
  timeout        = 10
  lambda_role    = aws_iam_role.api_lambda_role.arn
  vpc_subnet_ids = var.vpc_subnet_ids

  # Bundled ESM (`pnpm build` in the function) — a bare index.js is loaded as
  # CommonJS and its imports would fail at init.
  source_path = "${path.root}/../functions/wsAuthorizer/dist/index.mjs"
  environment_variables = {
    SECRET_NAME = var.api_lambda_secret_name

  }
}

# Deliberately OUTSIDE the VPC (like `ws_authorizer_lambda`). It only talks to
# DynamoDB (has a gateway endpoint) and to API Gateway's `@connections` API
# (`execute-api` over the public endpoint); a private subnet adds ENI cold
# starts and NAT/firewall failure modes without buying anything. Networking it
# back into the VPC means re-adding `vpc_security_group_ids` + `vpc_subnet_ids`.
module "ws_events_lambda" {
  source = "terraform-aws-modules/lambda/aws"

  function_name = "wsEvents"
  description   = "Lambda For Websocket Events."
  handler       = "index.handler"
  runtime       = "nodejs24.x"
  create_role   = false
  timeout       = 10
  memory_size   = 256
  layers        = [aws_lambda_layer_version.lambda_layer.arn]
  lambda_role   = aws_iam_role.api_lambda_role.arn

  source_path = "${path.root}/../functions/wsConnectionEvents/dist/index.mjs"

  # Emits every LOG level so a refused frame / failed fan-out is visible in
  # CloudWatch (the default only logs INFO and above, which hides nothing today
  # because nothing is logged — see `validateFrame`).
  environment_variables = {
    AWS_LAMBDA_LOG_LEVEL = "INFO"
  }
}

locals {
  api_lambdas = {
    auth = {
      arn  = module.auth_lambda.lambda_function_arn
      name = module.auth_lambda.lambda_function_name
    }
    users = {
      arn  = module.users_lambda.lambda_function_arn
      name = module.users_lambda.lambda_function_name
    }
    conversations = {
      arn  = module.conversations_lambda.lambda_function_arn
      name = module.conversations_lambda.lambda_function_name
    }
  }
}

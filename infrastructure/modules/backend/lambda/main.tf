locals {
  api_lambdas = {
    auth = {
      arn  = module.auth_lambda.lambda_function_arn
      name = module.auth_lambda.lambda_function_name
    }
  }
}

resource "aws_lambda_permission" "api_gateway" {
  for_each = local.api_lambdas

  statement_id  = "AllowApiGatewayInvoke-${each.value.name}"
  action        = "lambda:InvokeFunction"
  function_name = each.value.name

  principal = "apigateway.amazonaws.com"

  source_arn = "${var.api_gateway_execution_arn}/*/*/api/${each.value.name}/{proxy+}"
}

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
  create_role   = true
  layers        = [aws_lambda_layer_version.lambda_layer.arn]

  source_path = "${path.root}/../functions/auth/dist/index.mjs"
}

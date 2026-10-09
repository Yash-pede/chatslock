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
data "archive_file" "lambda_layer_zip" {
  type        = "zip"
  source_dir  = "${path.root}/../packages/api/dist"
  output_path = "${path.root}/../packages/api/dist/build.zip"
}

resource "aws_lambda_layer_version" "lambda_layer" {
  layer_name          = "api_layer"
  filename            = "${path.root}/../packages/api/dist/build.zip"
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


  source_path = "${path.root}/../functions/auth/dist/index.js"


}

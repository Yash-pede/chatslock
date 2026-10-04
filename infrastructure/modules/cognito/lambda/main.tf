# IAM role for Lambda execution
data "aws_iam_policy_document" "assume_role" {
  statement {
    effect = "Allow"

    principals {
      type = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "custom_auth_lambda_role" {
  name = "custom-auth-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
}

# AWS basic policy to grant access to write logs in cloudwatch
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.custom_auth_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_vpc_access" {
  role       = aws_iam_role.custom_auth_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "lambda_secrets_policy" {
  name = "lambda-secrets-policy"
  role = aws_iam_role.custom_auth_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "secretsmanager:GetSecretValue"
        ],
        Resource = var.auth_lambda_env_arn
      }
    ]
  })
}

resource "aws_security_group" "lambda_sg" {
  name   = "lambda-sg"
  vpc_id = var.vpc_id

  egress {
    from_port = 0
    to_port   = 0
    protocol  = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}


data "archive_file" "define_auth_zip" {
  type        = "zip"
  source_dir = "${path.module}/custom_auth_lambda/define_auth/code"
  output_path = "${path.module}/custom_auth_lambda/define_auth/define_auth.zip"
}

data "archive_file" "create_auth_zip" {
  type        = "zip"
  source_dir = "${path.module}/custom_auth_lambda/create_auth/code"
  output_path = "${path.module}/custom_auth_lambda/create_auth/create_auth.zip"
}

data "archive_file" "verify_auth_zip" {
  type        = "zip"
  source_dir = "${path.module}/custom_auth_lambda/verify_auth/code"
  output_path = "${path.module}/custom_auth_lambda/verify_auth/verify_auth.zip"
}

# Lambda function
resource "aws_lambda_function" "define_auth" {
  filename      = data.archive_file.define_auth_zip.output_path
  function_name = "define_auth"
  role          = aws_iam_role.custom_auth_lambda_role.arn
  handler       = "index.handler"
  code_sha256   = data.archive_file.define_auth_zip.output_base64sha256
  timeout       = 10
  runtime = "nodejs24.x"
}

resource "aws_lambda_function" "create_auth" {
  filename      = data.archive_file.create_auth_zip.output_path
  function_name = "create_auth"
  role          = aws_iam_role.custom_auth_lambda_role.arn
  handler       = "index.handler"
  code_sha256   = data.archive_file.create_auth_zip.output_base64sha256
  timeout       = 10
  runtime = "nodejs24.x"
  vpc_config {
    security_group_ids = [aws_security_group.lambda_sg.id]
    subnet_ids = var.private_subnet_ids
  }
  environment {
    variables = {
      SECRET_NAME = var.auth_lambda_env_name
    }
  }
}

resource "aws_lambda_function" "verify_auth" {
  filename      = data.archive_file.verify_auth_zip.output_path
  function_name = "verify_auth"
  role          = aws_iam_role.custom_auth_lambda_role.arn
  handler       = "index.handler"
  code_sha256   = data.archive_file.verify_auth_zip.output_base64sha256
  timeout       = 10
  runtime = "nodejs24.x"
}


resource "aws_lambda_permission" "cognito_define" {
  statement_id  = "AllowCognitoInvokeDefine"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.define_auth.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = var.user_pool_arn
}

resource "aws_lambda_permission" "cognito_create" {
  statement_id  = "AllowCognitoInvokeCreate"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.create_auth.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = var.user_pool_arn
}

resource "aws_lambda_permission" "cognito_verify" {
  statement_id  = "AllowCognitoInvokeVerify"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.verify_auth.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = var.user_pool_arn
}
